'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, BookOpen, Loader2, MessageSquarePlus, Send, Square, Wrench, X } from 'lucide-react';
import Markdown from './ui/Markdown';
import { newTextChat, sendTutorMessage, stopTextTutor, useTextTutorStore, voiceIsLive } from '../lib/ai/text-tutor';
import { useVoiceStore } from '../lib/stores/voice-store';
import { resolveLesson } from '../lib/learning/lesson-utils';
import { cn } from '../lib/utils';

/**
 * Vylos AI: the tutor in writing. With a lesson selected it teaches that
 * lesson step by step (teach → practice → quiz), exactly like the voice
 * tutor; without one it's a coding helper that can see and run the
 * learner's code.
 */

const SUGGESTIONS = [
    'Explain the code in the file I have open',
    'Give me a small practice task for what I\'m learning',
    'Why am I getting this error?',
];

export default function AIChatView() {
    const { entries, busy, activity } = useTextTutorStore();
    const lessonContext = useVoiceStore((s) => s.lessonContext);
    const voiceStatus = useVoiceStore((s) => s.status);
    const lesson = lessonContext ? resolveLesson(lessonContext) : null;
    const voiceLive = voiceStatus === 'live' || voiceStatus === 'connecting';
    const [input, setInput] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [entries, busy, activity]);

    // Grow the box with what's typed, up to a few lines
    useEffect(() => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    }, [input]);

    const send = (text: string) => {
        if (!text.trim() || busy || voiceIsLive()) return;
        setInput('');
        void sendTutorMessage(text);
    };

    return (
        <div className="flex flex-col h-full bg-[var(--vylos-black)] text-[var(--vylos-text-primary)]">
            <div className="px-3 py-2.5 border-b border-[var(--vylos-grey-border)] space-y-2">
                <div className="flex items-center justify-between">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--vylos-text-secondary)]">Vylos AI</h2>
                    {entries.length > 0 && (
                        <button
                            onClick={newTextChat}
                            title="Start a new conversation"
                            className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-200 transition-colors"
                        >
                            <MessageSquarePlus size={12} /> New chat
                        </button>
                    )}
                </div>
                {lesson && (
                    <div className="flex items-center gap-2 rounded-md bg-[#111113] border border-[#27272a] px-2 py-1.5">
                        <BookOpen size={12} className="text-[var(--vylos-green-accent)] shrink-0" />
                        <div className="min-w-0 flex-1">
                            <p className="text-[9px] uppercase tracking-widest text-gray-500 truncate">{lesson.course.title} · {lesson.number}</p>
                            <p className="text-[11px] text-gray-200 truncate">{lesson.lessonTitle}</p>
                        </div>
                        <button
                            onClick={() => useVoiceStore.getState().setLessonContext(null)}
                            title="Leave the lesson and chat freely"
                            className="p-0.5 text-gray-600 hover:text-gray-300"
                        >
                            <X size={12} />
                        </button>
                    </div>
                )}
            </div>

            <div ref={scrollRef} className="flex-1 p-3 overflow-y-auto space-y-3">
                {entries.length === 0 && !busy && (
                    <div className="mt-6 space-y-4 text-center">
                        {lesson ? (
                            <>
                                <p className="text-sm text-gray-400">Learn <span className="text-gray-200">{lesson.lessonTitle}</span> by chatting, step by step.</p>
                                <button
                                    onClick={() => void sendTutorMessage('Please start teaching the current lesson.', { hidden: true })}
                                    disabled={voiceLive}
                                    className="px-4 py-2 rounded-lg bg-[var(--vylos-green)] hover:bg-[var(--vylos-green-accent)] disabled:opacity-50 text-black text-[10px] font-bold uppercase tracking-widest"
                                >
                                    Start the lesson
                                </button>
                            </>
                        ) : (
                            <>
                                <p className="text-sm text-[var(--vylos-text-secondary)]">Ask about your code, or anything you&apos;re learning.</p>
                                <div className="space-y-1.5">
                                    {SUGGESTIONS.map((s) => (
                                        <button
                                            key={s}
                                            onClick={() => send(s)}
                                            className="w-full text-left px-3 py-2 rounded-lg border border-[#27272a] text-[11px] text-gray-400 hover:text-gray-100 hover:border-[#3f3f46] transition-colors"
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-[10px] text-gray-600 leading-relaxed">
                                    To be taught a course lesson in writing, open it in Learning Path and choose <span className="text-gray-400">Learn by chatting</span>.
                                </p>
                            </>
                        )}
                    </div>
                )}

                {entries.map((entry) => {
                    if (entry.role === 'action') {
                        return (
                            <p key={entry.id} className="flex items-center gap-1.5 text-[10px] text-gray-600 pl-1">
                                <Wrench size={10} className="shrink-0" /> <span className="truncate">{entry.text}</span>
                            </p>
                        );
                    }
                    if (entry.role === 'error') {
                        return (
                            <p key={entry.id} className="flex gap-1.5 text-[11px] text-red-300 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
                                <AlertTriangle size={12} className="shrink-0 mt-0.5" /> {entry.text}
                            </p>
                        );
                    }
                    return (
                        <div key={entry.id} className={cn('flex flex-col', entry.role === 'user' ? 'items-end' : 'items-start')}>
                            <div
                                className={cn(
                                    'max-w-[92%] px-3 py-2 rounded-2xl text-[12.5px] leading-relaxed',
                                    entry.role === 'user'
                                        ? 'bg-[var(--vylos-green)] text-black font-medium rounded-tr-none whitespace-pre-wrap break-words'
                                        : 'bg-[#18181b] text-gray-300 border border-[#27272a] rounded-tl-none'
                                )}
                            >
                                {entry.role === 'user' ? entry.text : <Markdown text={entry.text} />}
                            </div>
                        </div>
                    );
                })}

                {busy && (
                    <div className="flex items-center gap-2 text-[11px] text-[var(--vylos-green)]">
                        <Loader2 size={12} className="animate-spin shrink-0" />
                        <span className="truncate">{activity ?? 'Thinking…'}</span>
                        <button onClick={stopTextTutor} className="ml-auto flex items-center gap-1 text-[10px] text-gray-500 hover:text-red-300">
                            <Square size={9} fill="currentColor" /> Stop
                        </button>
                    </div>
                )}
            </div>

            <div className="p-3 border-t border-[var(--vylos-grey-border)] space-y-2">
                {voiceLive && (
                    <p className="text-[10px] text-amber-300/90 leading-relaxed">
                        The voice tutor is teaching right now. End the voice session (Ctrl+L) to continue here in writing.
                    </p>
                )}
                <form
                    onSubmit={(e) => { e.preventDefault(); send(input); }}
                    className="flex items-end gap-2 bg-[var(--vylos-black)] p-2 rounded-md border border-[var(--vylos-grey-border)] focus-within:border-[var(--vylos-green)] transition-all"
                >
                    <textarea
                        ref={inputRef}
                        rows={1}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                                e.preventDefault();
                                send(input);
                            }
                        }}
                        placeholder={lesson ? 'Answer, or ask a question…' : 'Ask about your code…'}
                        aria-label="Message the tutor"
                        className="bg-transparent border-none outline-none text-[13px] w-full resize-none leading-relaxed placeholder-[var(--vylos-text-secondary)]"
                        disabled={voiceLive}
                    />
                    <button
                        type="submit"
                        disabled={busy || voiceLive || !input.trim()}
                        title="Send (Enter)"
                        className="text-[var(--vylos-text-secondary)] hover:text-[var(--vylos-green)] disabled:opacity-30 transition-colors px-1 pb-0.5"
                    >
                        <Send size={16} />
                    </button>
                </form>
            </div>
        </div>
    );
}
