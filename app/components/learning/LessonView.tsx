'use client';

import { useEffect } from 'react';
import { ArrowLeft, CheckCircle, ChevronLeft, ChevronRight, Circle, Dumbbell, Loader2, MessageSquare, Mic, RefreshCw, Sparkles } from 'lucide-react';
import Markdown from '../ui/Markdown';
import { resolveLesson, startLessonWithTutor, type LessonRef } from '@/app/lib/learning/lesson-utils';
import { loadLessonNotes, notesKey, useLessonNotesStore } from '@/app/lib/learning/lesson-notes';
import { useCourseStore } from '@/app/lib/stores/course-store';
import { exerciseKey, useExerciseStore } from '@/app/lib/stores/exercise-store';
import { openExercise } from '@/app/lib/exercises/session';
import { startTextLesson } from '@/app/lib/ai/text-tutor';
import { cn } from '@/app/lib/utils';
import ExplainBack from './ExplainBack';

/** One lesson: written notes, and every way to learn it (chat, voice, practice). */
export default function LessonView({ lessonRef, onBack }: { lessonRef: LessonRef; onBack: () => void }) {
    const lesson = resolveLesson(lessonRef);
    const k = notesKey(lessonRef);
    const notes = useLessonNotesStore((s) => s.notes[k]);
    const loading = useLessonNotesStore((s) => !!s.loading[k]);
    const error = useLessonNotesStore((s) => s.errors[k]);
    const done = useCourseStore((s) => (s.completedLessons[lessonRef.courseId] ?? []).includes(lessonRef.lessonId));
    const { toggleLesson, setOpenLesson } = useCourseStore();
    const exercisePassed = useExerciseStore((s) => !!s.progress[exerciseKey(lessonRef)]?.passed);

    useEffect(() => { void loadLessonNotes(lessonRef); }, [lessonRef]);

    if (!lesson) {
        return (
            <div className="p-5 text-xs text-gray-500">
                This lesson isn&apos;t in the course any more.{' '}
                <button onClick={onBack} className="text-[var(--vylos-green)] hover:underline">Back to the course</button>
            </div>
        );
    }

    const lessons = lesson.course.modules.flatMap((m) => m.lessons);
    const at = lessons.findIndex((l) => l.id === lessonRef.lessonId);
    const go = (i: number) => lessons[i] && setOpenLesson({ courseId: lesson.course.id, lessonId: lessons[i].id });
    const exercise = lesson.course.modules[lesson.moduleIndex].lessons[lesson.lessonIndex].exercise;

    return (
        <div className="h-full flex flex-col bg-[var(--vylos-black)]">
            <div className="p-5 pb-4 border-b border-[var(--vylos-grey-border)] bg-gradient-to-br from-[#09090b] to-black space-y-3">
                <button
                    onClick={onBack}
                    className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-[var(--vylos-green)] transition-colors"
                >
                    <ArrowLeft size={11} /> {lesson.course.title}
                </button>
                <div>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-gray-500 truncate">
                        Lesson {lesson.number} · {lesson.moduleTitle}
                    </p>
                    <h2 className="mt-1 text-sm font-black text-white leading-snug">{lesson.lessonTitle}</h2>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={() => void startTextLesson(lessonRef)}
                        title="The tutor teaches this lesson step by step, in writing"
                        className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[var(--vylos-green)] hover:bg-[var(--vylos-green-accent)] text-black text-[10px] font-bold uppercase tracking-wider"
                    >
                        <MessageSquare size={12} /> Learn by chatting
                    </button>
                    <button
                        onClick={() => startLessonWithTutor(lessonRef)}
                        title="The tutor teaches this lesson by voice"
                        className="flex items-center justify-center gap-1.5 py-2 rounded-lg border border-[#27272a] hover:border-[#3f3f46] text-gray-300 hover:text-white text-[10px] font-bold uppercase tracking-wider"
                    >
                        <Mic size={12} /> By voice
                    </button>
                    {exercise && (
                        <button
                            onClick={() => void openExercise(lessonRef)}
                            className={cn(
                                'col-span-2 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-[10px] font-bold uppercase tracking-wider',
                                exercisePassed
                                    ? 'border-[var(--vylos-green-dark)]/50 text-[var(--vylos-green)] bg-[var(--vylos-green-dark)]/10'
                                    : 'border-[#27272a] hover:border-[#3f3f46] text-gray-300 hover:text-white'
                            )}
                        >
                            <Dumbbell size={12} /> {exercisePassed ? 'Exercise passed · open it' : 'Practice exercise'}
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {loading && !notes && (
                    <p className="flex items-center gap-2 text-[11px] text-gray-500">
                        <Loader2 size={12} className="animate-spin" /> Writing notes for this lesson…
                    </p>
                )}
                {error && !loading && (
                    <div className="text-[11px] text-red-300 space-y-2">
                        <p>{error}</p>
                        <button onClick={() => void loadLessonNotes(lessonRef, { refresh: true })} className="text-gray-400 hover:text-gray-200 underline">Try again</button>
                    </div>
                )}
                {notes && (
                    <>
                        <Markdown text={notes.text} className="text-[12px] leading-relaxed text-gray-300" />
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#1f1f22]">
                            <p className="flex items-center gap-1 text-[9px] text-gray-600">
                                <Sparkles size={9} /> Written by Vylos AI. It can make mistakes: run the example to check.
                            </p>
                            <button
                                onClick={() => void loadLessonNotes(lessonRef, { refresh: true })}
                                disabled={loading}
                                title="Write these notes again"
                                className="shrink-0 p-1 text-gray-600 hover:text-gray-300 disabled:opacity-50"
                            >
                                <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
                            </button>
                        </div>
                    </>
                )}
                <ExplainBack key={k} lesson={lesson} />
            </div>

            <div className="px-5 py-3 border-t border-[var(--vylos-grey-border)] flex items-center justify-between gap-2">
                <button
                    onClick={() => go(at - 1)}
                    disabled={at <= 0}
                    className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-200 disabled:opacity-30"
                >
                    <ChevronLeft size={12} /> Previous
                </button>
                <button
                    onClick={() => toggleLesson(lesson.course.id, lessonRef.lessonId)}
                    title={exercise && !done ? 'Passing the exercise also marks it done' : undefined}
                    className={cn('flex items-center gap-1.5 text-[10px] font-semibold', done ? 'text-[var(--vylos-green)]' : 'text-gray-400 hover:text-gray-100')}
                >
                    {done ? <CheckCircle size={12} /> : <Circle size={12} />} {done ? 'Done' : 'Mark as done'}
                </button>
                <button
                    onClick={() => go(at + 1)}
                    disabled={at === -1 || at >= lessons.length - 1}
                    className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-200 disabled:opacity-30"
                >
                    Next <ChevronRight size={12} />
                </button>
            </div>
        </div>
    );
}
