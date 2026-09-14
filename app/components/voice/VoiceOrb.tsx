import { useState, useEffect, useCallback, useRef } from 'react';
import { Mic, MicOff, X as CloseIcon, Loader2, GraduationCap, AlertTriangle, AudioLines } from 'lucide-react';
import { cn } from '@/app/lib/utils';
import { startVoiceSession, stopVoiceSession, TutorEvent } from '@/app/lib/ai/gemini-live';
import {
    getTutorToolDeclarations,
    executeTutorTool,
    describeTutorTool,
    buildTutorSystemInstruction,
    cancelTutorActions,
} from '@/app/lib/ai/tutor-tools';
import { useVoiceStore, TUTOR_VOICES } from '@/app/lib/stores/voice-store';
import { useFileStore } from '@/app/lib/useFileStore';

export default function VoiceOrb() {
    const [showPicker, setShowPicker] = useState(false);
    const startTokenRef = useRef(0);
    const {
        selectedVoice, setSelectedVoice,
        status, setStatus,
        error, setError,
        currentCaption,
        activity,
        resetSession,
        sessionVoice,
    } = useVoiceStore();

    const endSession = useCallback(() => {
        // Invalidates any start still in flight so it cannot revive the session
        startTokenRef.current++;
        cancelTutorActions();
        stopVoiceSession();
        resetSession();
    }, [resetSession]);

    const beginSession = useCallback(async (voiceName: string, opts?: { resume?: boolean }) => {
        // Identifies this start attempt. Starting a session is async, so a lesson
        // card, a keyboard toggle and a voice switch can overlap; only the newest
        // attempt is allowed to drive the UI.
        const token = ++startTokenRef.current;

        // The voice is fixed for the whole session. A resumed lesson keeps the
        // voice it was started in, so continuing never swaps the tutor's voice
        // mid-lesson — even across an app restart.
        const store = useVoiceStore.getState();
        const voice = opts?.resume ? (store.sessionVoice ?? voiceName) : voiceName;
        store.setSessionVoice(voice);

        setShowPicker(false);
        setError(null);
        // Never leave a second session running alongside this one — two live
        // sockets both stream audio, which is what makes the tutor reply twice.
        cancelTutorActions();
        stopVoiceSession();
        // On resume, keep the chat history — the tutor continues the same lesson
        if (!opts?.resume) useVoiceStore.getState().clearTranscript();
        setStatus('connecting');
        // Open the tutor sidebar so the learner can follow the conversation
        useFileStore.getState().setActiveView('tutor');

        await startVoiceSession({
            voiceName: voice,
            systemInstruction: buildTutorSystemInstruction({ resume: opts?.resume }),
            toolDeclarations: getTutorToolDeclarations(),
            executeTool: executeTutorTool,
            onEvent: (event: TutorEvent) => {
                // Superseded by a newer session: its events own the UI now
                if (startTokenRef.current !== token) return;
                const store = useVoiceStore.getState();
                switch (event.type) {
                    case 'connected':
                        store.setStatus('live');
                        break;
                    case 'tutor-transcript':
                        store.appendCaption(event.text);
                        break;
                    case 'user-transcript':
                        store.appendUserSpeech(event.text);
                        break;
                    case 'tool-start': {
                        const label = describeTutorTool(event.name, event.args);
                        if (label) {
                            store.setActivity(label);
                            store.addAction(label);
                        }
                        break;
                    }
                    case 'tool-done':
                        store.setActivity(null);
                        break;
                    case 'turn-complete':
                        store.flushCaption();
                        break;
                    case 'interrupted':
                        store.flushCaption();
                        break;
                    case 'error':
                        store.setError(event.message);
                        cancelTutorActions();
                        stopVoiceSession();
                        store.resetSession();
                        break;
                    case 'closed':
                        if (event.reason) store.setError(event.reason);
                        cancelTutorActions();
                        store.resetSession();
                        break;
                }
            },
        });
    }, [setError, setStatus]);

    const toggleVoice = useCallback(() => {
        if (status === 'live' || status === 'connecting') {
            endSession();
        } else {
            // Keyboard toggle starts straight away with the saved voice
            beginSession(useVoiceStore.getState().selectedVoice);
        }
    }, [status, endSession, beginSession]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
                e.preventDefault();
                toggleVoice();
            }
        };
        const handleCustomEvent = () => toggleVoice();
        // A lesson card asked the tutor to teach a specific curriculum lesson
        const handleStartLesson = (e: Event) => {
            const ref = (e as CustomEvent).detail;
            if (!ref) return;
            useVoiceStore.getState().setLessonContext(ref);
            // beginSession replaces any running session, so it already picks up
            // the new lesson context
            beginSession(useVoiceStore.getState().selectedVoice);
        };

        // The tutor panel asked to continue the interrupted lesson where it left off
        const handleResumeLesson = () => {
            const s = useVoiceStore.getState();
            if (s.status === 'live' || s.status === 'connecting') return;
            beginSession(s.selectedVoice, { resume: true });
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('vylos:toggle-voice', handleCustomEvent);
        window.addEventListener('vylos:start-lesson', handleStartLesson);
        window.addEventListener('vylos:resume-lesson', handleResumeLesson);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('vylos:toggle-voice', handleCustomEvent);
            window.removeEventListener('vylos:start-lesson', handleStartLesson);
            window.removeEventListener('vylos:resume-lesson', handleResumeLesson);
        };
    }, [toggleVoice, endSession, beginSession]);

    // Clean up the session if the component unmounts (e.g. logout)
    useEffect(() => () => { cancelTutorActions(); stopVoiceSession(); }, []);

    const isActive = status === 'live' || status === 'connecting';

    return (
        <>
            {/* Error toast */}
            {error && (
                <div className="fixed bottom-24 right-8 z-[60] w-80 bg-[#18181b] border border-red-500/50 rounded-lg shadow-2xl animate-in slide-in-from-bottom-5 duration-300">
                    <div className="p-4 flex items-start gap-3">
                        <AlertTriangle size={16} className="text-red-400 mt-0.5 shrink-0" />
                        <p className="flex-1 text-xs text-gray-300 leading-relaxed">{error}</p>
                        <button onClick={() => setError(null)} className="text-gray-500 hover:text-white transition-colors">
                            <CloseIcon size={14} />
                        </button>
                    </div>
                </div>
            )}

            {/* Voice picker — the voice is chosen before a session and locked for it */}
            {showPicker && !isActive && (
                <div className="fixed bottom-28 right-8 z-[60] w-80 bg-[#0d0d0d] border border-[var(--vylos-grey-border)] rounded-xl shadow-2xl animate-in slide-in-from-bottom-5 duration-300 overflow-hidden">
                    <div className="p-4 border-b border-[var(--vylos-grey-border)] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <GraduationCap size={14} className="text-[var(--vylos-green)]" />
                            <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Voice Tutor</span>
                        </div>
                        <button onClick={() => setShowPicker(false)} className="text-gray-500 hover:text-white transition-colors">
                            <CloseIcon size={14} />
                        </button>
                    </div>

                    <div className="p-4">
                        <p className="text-[11px] text-gray-500 mb-3">Choose your tutor&apos;s voice:</p>
                        <div className="grid grid-cols-2 gap-2 mb-4">
                            {TUTOR_VOICES.map((voice) => (
                                <button
                                    key={voice.name}
                                    onClick={() => setSelectedVoice(voice.name)}
                                    className={cn(
                                        'p-2.5 rounded-lg border text-left transition-all',
                                        selectedVoice === voice.name
                                            ? 'border-[var(--vylos-green)] bg-[var(--vylos-green)]/10'
                                            : 'border-[var(--vylos-grey-border)] hover:border-gray-600'
                                    )}
                                >
                                    <div className={cn(
                                        'text-xs font-bold',
                                        selectedVoice === voice.name ? 'text-[var(--vylos-green)]' : 'text-gray-200'
                                    )}>
                                        {voice.name}
                                    </div>
                                    <div className="text-[10px] text-gray-500 mt-0.5">{voice.description}</div>
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => beginSession(selectedVoice)}
                            className="w-full bg-[var(--vylos-green)] hover:bg-[var(--vylos-green-accent)] text-black font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm transition-all transform active:scale-95 shadow-[0_0_15px_rgba(0,255,0,0.2)]"
                        >
                            <Mic size={15} /> Start Session
                        </button>
                        <p className="text-[9px] text-center text-gray-600 mt-2">The tutor sees your editor and teaches hands-on. Ctrl+L to toggle.</p>
                    </div>
                </div>
            )}

            {/* Live captions + activity */}
            {status === 'live' && (currentCaption || activity) && (
                <div className="fixed bottom-28 right-8 z-[55] w-96 max-w-[calc(100vw-4rem)] flex flex-col items-end gap-2 pointer-events-none">
                    {activity && (
                        <div className="px-3 py-1.5 bg-[var(--vylos-green)]/15 border border-[var(--vylos-green)]/40 rounded-full flex items-center gap-2 animate-in fade-in duration-200">
                            <Loader2 size={11} className="text-[var(--vylos-green)] animate-spin" />
                            <span className="text-[10px] font-bold text-[var(--vylos-green)]">{activity}</span>
                        </div>
                    )}
                    {currentCaption && (
                        <div className="px-4 py-3 bg-[#0d0d0d]/95 border border-[var(--vylos-grey-border)] rounded-xl shadow-2xl backdrop-blur">
                            <p className="text-xs text-gray-200 leading-relaxed">{currentCaption.slice(-220)}</p>
                        </div>
                    )}
                </div>
            )}

            {/* Orb */}
            <div className="fixed bottom-8 right-8 z-50 flex flex-col items-center animate-in fade-in duration-500">
                {isActive && sessionVoice && (
                    <div
                        title={`This session is locked to the ${sessionVoice} voice`}
                        className="mb-2 px-2.5 py-1 rounded-full bg-[#0d0d0d] border border-[var(--vylos-grey-border)] flex items-center gap-1.5"
                    >
                        <AudioLines size={11} className="text-[var(--vylos-green)]" />
                        <span className="text-[10px] font-bold text-gray-300">{sessionVoice}</span>
                    </div>
                )}
                <div
                    className={cn(
                        'relative w-16 h-16 rounded-full flex items-center justify-center cursor-pointer transition-all duration-300',
                        isActive
                            ? 'bg-[var(--vylos-green-dark)] shadow-[0_0_20px_var(--vylos-green)]'
                            : 'bg-[var(--vylos-grey-light)] hover:bg-[var(--vylos-grey-medium)]'
                    )}
                    onClick={() => {
                        if (isActive) {
                            endSession();
                        } else {
                            setShowPicker((v) => !v);
                        }
                    }}
                >
                    {status === 'live' && (
                        <>
                            <div className="absolute w-full h-full rounded-full border-2 border-[var(--vylos-green)] animate-ping opacity-50"></div>
                            <div className="absolute w-[120%] h-[120%] rounded-full border border-[var(--vylos-green)] animate-pulse opacity-30"></div>
                        </>
                    )}
                    {status === 'connecting'
                        ? <Loader2 className="text-white z-10 animate-spin" />
                        : isActive
                            ? <Mic className="text-white z-10" />
                            : <MicOff className="text-[var(--vylos-text-secondary)] z-10" />}
                </div>
                <span className="mt-2 text-[10px] font-bold text-[var(--vylos-text-secondary)] bg-[var(--vylos-black)] px-2 py-1 rounded border border-[var(--vylos-grey-border)] uppercase tracking-tighter">
                    {status === 'connecting' ? 'Connecting…' : status === 'live' ? 'Tutoring — click to end' : 'Voice Tutor (Ctrl+L)'}
                </span>
            </div>
        </>
    );
}
