import { useState, useEffect, useCallback } from 'react';
import { Mic, MicOff, BookOpen, X as CloseIcon } from 'lucide-react';
import { cn } from '@/app/lib/utils';
import { useRoadmapStore } from '@/app/lib/stores/roadmap-store';
import { startVoiceSession, stopVoiceSession } from '@/app/lib/ai/gemini-live';

export default function VoiceOrb() {
    const [isActive, setIsActive] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [showNotice, setShowNotice] = useState(false);
    const { currentRoadmap } = useRoadmapStore();

    const toggleVoice = useCallback(async () => {
        if (!currentRoadmap) {
            setShowNotice(true);
            setTimeout(() => setShowNotice(false), 5000);
            return;
        }

        if (isActive) {
            stopVoiceSession();
            setIsActive(false);
            setIsListening(false);
        } else {
            setIsActive(true);
            setIsListening(true);
            await startVoiceSession((text) => {
                console.log("Tutor said:", text);
            });
        }
    }, [currentRoadmap, isActive]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
                e.preventDefault();
                toggleVoice();
            }
        };

        const handleCustomEvent = () => {
            toggleVoice();
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('vylos:toggle-voice', handleCustomEvent);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('vylos:toggle-voice', handleCustomEvent);
        };
    }, [toggleVoice]);

    return (
        <>
            {/* Gating Notice - Custom UI with Timer */}
            {showNotice && (
                <div className="fixed bottom-24 right-8 z-[60] w-72 bg-[#18181b] border border-[var(--vylos-green)] rounded-lg shadow-2xl overflow-hidden animate-in slide-in-from-bottom-5 duration-300">
                    <div className="p-4 relative">
                        <div className="flex items-start gap-4">
                            <div className="p-2 bg-[var(--vylos-green-dark)] rounded-md text-white">
                                <BookOpen size={18} />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-sm font-bold text-white">Learning Path Required</h3>
                                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                                    Please select a roadmap in the Learning view to unlock the Voice Tutor.
                                </p>
                            </div>
                            <button onClick={() => setShowNotice(false)} className="text-gray-500 hover:text-white transition-colors">
                                <CloseIcon size={14} />
                            </button>
                        </div>
                    </div>
                    {/* Timer Slide (Progress Bar) */}
                    <div className="h-1 bg-[var(--vylos-green)] animate-progress-timer"></div>
                </div>
            )}

            {/* Orb Container - Only visible if roadmap exists */}
            {currentRoadmap && (
                <div className="fixed bottom-8 right-8 z-50 flex flex-col items-center animate-in fade-in duration-500">
                    <div
                        className={cn(
                            "relative w-16 h-16 rounded-full flex items-center justify-center cursor-pointer transition-all duration-300",
                            isActive ? "bg-[var(--vylos-green-dark)] shadow-[0_0_20px_var(--vylos-green)]" : "bg-[var(--vylos-grey-light)] hover:bg-[var(--vylos-grey-medium)]"
                        )}
                        onClick={toggleVoice}
                    >
                        {isActive && (
                            <>
                                <div className="absolute w-full h-full rounded-full border-2 border-[var(--vylos-green)] animate-ping opacity-50"></div>
                                <div className="absolute w-[120%] h-[120%] rounded-full border border-[var(--vylos-green)] animate-pulse opacity-30"></div>
                            </>
                        )}
                        {isActive ? <Mic className="text-white z-10" /> : <MicOff className="text-[var(--vylos-text-secondary)] z-10" />}
                    </div>
                    <span className="mt-2 text-[10px] font-bold text-[var(--vylos-text-secondary)] bg-[var(--vylos-black)] px-2 py-1 rounded border border-[var(--vylos-grey-border)] uppercase tracking-tighter">
                        {isActive ? (isListening ? "Listening..." : "Thinking...") : "Voice Tutor (Cmd+L)"}
                    </span>
                </div>
            )}
        </>
    );
}
