'use client';

import React, { useEffect, useRef } from 'react';
import { AudioLines, Mic, Play, Wrench, Loader2 } from 'lucide-react';
import { useVoiceStore, TranscriptEntry } from '@/app/lib/stores/voice-store';
import { resolveLesson, resumeLessonWithTutor } from '@/app/lib/learning/lesson-utils';
import { useCourse } from '@/app/lib/learning/course-registry';
import { cn } from '@/app/lib/utils';

export default function TutorPanel() {
    const { status, transcript, currentCaption, pendingUserSpeech, activity, sessionVoice, selectedVoice, lessonContext } = useVoiceStore();
    const scrollRef = useRef<HTMLDivElement>(null);

    // An interrupted curriculum lesson the learner can pick back up. Its course
    // may come from an extension that loads after startup.
    const lessonCourse = useCourse(lessonContext?.courseId);
    const pausedLesson = status === 'idle' && lessonContext && lessonCourse ? resolveLesson(lessonContext) : null;

    // Follow the conversation as it grows
    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [transcript, currentCaption, pendingUserSpeech, activity]);

    return (
        <div className="h-full flex flex-col bg-[#000000]">
            <div className="p-6 border-b border-[#1a1a1a] flex items-center justify-between bg-gradient-to-br from-[#050505] to-black">
                <div className="flex items-center gap-2">
                    <AudioLines size={14} className="text-[var(--vylos-green)]" />
                    <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Voice Tutor</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className={cn(
                        'w-1.5 h-1.5 rounded-full',
                        status === 'live' ? 'bg-[var(--vylos-green)] animate-pulse'
                            : status === 'connecting' ? 'bg-yellow-500 animate-pulse'
                                : 'bg-gray-700'
                    )} />
                    <span className="text-[9px] uppercase tracking-widest text-gray-500 font-bold">
                        {status === 'live' ? (sessionVoice ?? selectedVoice) : status === 'connecting' ? 'Connecting' : 'Offline'}
                    </span>
                </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                {transcript.length === 0 && !currentCaption && !pendingUserSpeech && (
                    <div className="h-full flex flex-col items-center justify-center text-center px-6">
                        <div className="w-14 h-14 rounded-full bg-[var(--vylos-green)]/5 border border-[var(--vylos-green)]/20 flex items-center justify-center mb-4">
                            <Mic size={20} className="text-[var(--vylos-green)]" />
                        </div>
                        <p className="text-xs font-bold text-gray-300 mb-1">No session yet</p>
                        <p className="text-[11px] text-gray-600 leading-relaxed">
                            Click the orb in the corner (or press Ctrl+L) to start a voice lesson. Everything the tutor says appears here.
                        </p>
                    </div>
                )}

                {transcript.map((entry) => <Entry key={entry.id} entry={entry} />)}

                {/* Live, in-progress lines */}
                {pendingUserSpeech && (
                    <div className="flex justify-end">
                        <p className="max-w-[85%] px-3 py-2 rounded-xl rounded-br-sm bg-white/5 text-[11px] text-gray-400 italic leading-relaxed">
                            {pendingUserSpeech}
                        </p>
                    </div>
                )}
                {currentCaption && (
                    <div className="border-l-2 border-[var(--vylos-green)] pl-3">
                        <p className="text-xs text-gray-200 leading-relaxed">{currentCaption}</p>
                    </div>
                )}
                {activity && (
                    <div className="flex items-center gap-2 text-[var(--vylos-green)]">
                        <Loader2 size={11} className="animate-spin" />
                        <span className="text-[10px] font-bold">{activity}</span>
                    </div>
                )}
            </div>

            {status === 'live' && (
                <div className="p-3 border-t border-[#1a1a1a] flex items-center justify-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--vylos-green)] animate-pulse" />
                    <span className="text-[9px] uppercase tracking-widest text-gray-600 font-bold">Listening — just speak</span>
                </div>
            )}

            {pausedLesson && (
                <div className="p-3 border-t border-[#1a1a1a] bg-gradient-to-t from-[#050505] to-transparent">
                    <button
                        onClick={resumeLessonWithTutor}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-[var(--vylos-green)] hover:bg-[var(--vylos-green-accent)] text-black font-bold rounded-lg text-[10px] uppercase tracking-widest transition-all active:scale-[0.98] shadow-[0_0_15px_rgba(0,255,0,0.15)]"
                    >
                        <Play size={12} /> Continue Lesson {pausedLesson.number}
                    </button>
                    <p className="text-[10px] text-gray-600 text-center mt-1.5 truncate">
                        {pausedLesson.lessonTitle} · {pausedLesson.course.title}
                    </p>
                </div>
            )}
        </div>
    );
}

function Entry({ entry }: { entry: TranscriptEntry }) {
    if (entry.role === 'action') {
        return (
            <div className="flex items-center gap-2 text-gray-600">
                <Wrench size={10} className="shrink-0" />
                <span className="text-[10px] italic">{entry.text}</span>
            </div>
        );
    }
    if (entry.role === 'user') {
        return (
            <div className="flex justify-end">
                <p className="max-w-[85%] px-3 py-2 rounded-xl rounded-br-sm bg-white/5 text-[11px] text-gray-300 leading-relaxed">
                    {entry.text}
                </p>
            </div>
        );
    }
    return (
        <div className="border-l-2 border-[var(--vylos-green)]/40 pl-3">
            <p className="text-xs text-gray-300 leading-relaxed">{entry.text}</p>
        </div>
    );
}
