'use client';

import { useState } from 'react';
import {
    ArrowLeft,
    CheckCircle,
    Circle,
    ChevronDown,
    Clock,
    Layers,
    Mic,
    RotateCcw,
    Trophy,
    CheckCheck,
    Puzzle,
    Dumbbell,
    MessageSquare,
} from 'lucide-react';
import { Course, courseProgress, moduleLessonIds, moduleProgress } from '@/app/lib/learning/types';
import { firstIncompleteLesson, startLessonWithTutor } from '@/app/lib/learning/lesson-utils';
import { useCourseStore } from '@/app/lib/stores/course-store';
import { useVoiceStore } from '@/app/lib/stores/voice-store';
import { exerciseKey, useExerciseStore } from '@/app/lib/stores/exercise-store';
import { openExercise } from '@/app/lib/exercises/session';
import { startTextLesson } from '@/app/lib/ai/text-tutor';
import SetupCard from './SetupCard';
import { cn } from '@/app/lib/utils';

interface CourseViewProps {
    course: Course;
    onBack: () => void;
}

export default function CourseView({ course, onBack }: CourseViewProps) {
    const { completedLessons, toggleLesson, completeLessons, resetCourse, setOpenLesson } = useCourseStore();
    const { lessonContext, status: voiceStatus } = useVoiceStore();
    const completed = completedLessons[course.id] ?? [];
    const done = new Set(completed);
    const progress = courseProgress(course, completed);
    const exerciseProgress = useExerciseStore((s) => s.progress);
    const exerciseCount = course.modules.reduce((n, m) => n + m.lessons.filter((l) => l.exercise).length, 0);

    const isTeaching = (lessonId: string) =>
        voiceStatus !== 'idle' &&
        lessonContext?.courseId === course.id &&
        lessonContext.lessonId === lessonId;

    const startTutorAtNext = () => {
        const ref = firstIncompleteLesson(course, completed);
        if (ref) startLessonWithTutor(ref);
    };

    const firstIncomplete = course.modules.findIndex((mod) => mod.lessons.some((lesson) => !done.has(lesson.id)));
    const [expanded, setExpanded] = useState<number | null>(firstIncomplete === -1 ? null : firstIncomplete);

    return (
        <div className="h-full flex flex-col bg-[var(--vylos-black)]">
            {/* Header */}
            <div className="p-5 border-b border-[var(--vylos-grey-border)] bg-gradient-to-br from-[#09090b] to-black">
                <div className="flex items-center justify-between mb-3">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-[var(--vylos-green)] transition-colors"
                    >
                        <ArrowLeft size={11} /> Catalog
                    </button>
                    {progress.done > 0 && (
                        <button
                            onClick={() => resetCourse(course.id)}
                            title="Reset progress"
                            className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-gray-600 hover:text-red-400 transition-colors"
                        >
                            <RotateCcw size={10} /> Reset
                        </button>
                    )}
                </div>

                <div className="flex items-start gap-3">
                    <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0 border"
                        style={{
                            backgroundColor: `${course.accent}1f`,
                            borderColor: `${course.accent}40`,
                            color: course.accent,
                        }}
                    >
                        {course.badge}
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-base font-black text-white leading-tight">{course.title}</h2>
                        {course.extension && (
                            <p className="flex items-center gap-1 mt-1 text-[10px] text-gray-500" title={course.extension.id}>
                                <Puzzle size={10} className="text-[var(--vylos-green-accent)] shrink-0" />
                                <span className="truncate">From {course.extension.displayName} by {course.extension.publisher}</span>
                            </p>
                        )}
                        <div className="flex items-center gap-3 mt-1 text-[9px] text-gray-500 font-medium uppercase tracking-wider">
                            <span className="flex items-center gap-1">
                                <Layers size={9} /> {course.modules.length} modules
                            </span>
                            <span className="flex items-center gap-1">
                                <Clock size={9} /> ~{course.hours}h
                            </span>
                            {exerciseCount > 0 && (
                                <span className="flex items-center gap-1" title="Lessons with a coding exercise that's checked automatically">
                                    <Dumbbell size={9} /> {exerciseCount} exercises
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="space-y-1.5 mt-4">
                    <div className="flex justify-between items-end">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                            {progress.done} / {progress.total} lessons
                        </span>
                        <span className="text-xs font-mono text-[var(--vylos-green)]">{progress.percent}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-[#18181b] rounded-full overflow-hidden border border-[#27272a]">
                        <div
                            className="h-full bg-[var(--vylos-green)] transition-all duration-700 ease-out shadow-[0_0_10px_rgba(0,255,0,0.3)]"
                            style={{ width: `${progress.percent}%` }}
                        />
                    </div>
                </div>

                {progress.percent < 100 && (
                    <button
                        onClick={startTutorAtNext}
                        className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 bg-[var(--vylos-green)] hover:bg-[var(--vylos-green-accent)] text-black font-bold rounded-lg text-[10px] uppercase tracking-widest transition-all active:scale-[0.98] shadow-[0_0_15px_rgba(0,255,0,0.15)]"
                    >
                        <Mic size={13} />
                        {progress.done > 0 ? 'Continue with Voice Tutor' : 'Learn with Voice Tutor'}
                    </button>
                )}
                {progress.percent < 100 && (
                    <button
                        onClick={() => {
                            const ref = firstIncompleteLesson(course, completed);
                            if (ref) void startTextLesson(ref);
                        }}
                        className="mt-2 w-full flex items-center justify-center gap-2 py-2 border border-[#27272a] hover:border-[#3f3f46] text-gray-300 hover:text-white font-bold rounded-lg text-[10px] uppercase tracking-widest transition-colors"
                    >
                        <MessageSquare size={12} /> {progress.done > 0 ? 'Continue by chatting' : 'Learn by chatting'}
                    </button>
                )}
            </div>

            {/* Modules */}
            <div className="flex-1 overflow-y-auto">
            <SetupCard course={course} />
            <div className="p-4 space-y-2">
                {course.modules.map((mod, mi) => {
                    const mp = moduleProgress(course, mi, completed);
                    const isOpen = expanded === mi;
                    const isComplete = mp.done === mp.total;
                    return (
                        <div
                            key={mi}
                            className={cn(
                                'rounded-xl border transition-all duration-300 overflow-hidden',
                                isComplete
                                    ? 'bg-[var(--vylos-green-dark)]/5 border-[var(--vylos-green-dark)]/20'
                                    : 'bg-[#09090b] border-[#27272a]',
                                isOpen && !isComplete && 'border-[#3f3f46]'
                            )}
                        >
                            {/* Module header */}
                            <button
                                onClick={() => setExpanded(isOpen ? null : mi)}
                                className="w-full flex items-center gap-3 p-3.5 text-left group"
                            >
                                <span
                                    className={cn(
                                        'w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black font-mono shrink-0 border',
                                        isComplete
                                            ? 'bg-[var(--vylos-green)] text-black border-transparent'
                                            : 'bg-[#18181b] text-gray-500 border-[#27272a]'
                                    )}
                                >
                                    {isComplete ? <CheckCircle size={13} strokeWidth={3} /> : String(mi + 1).padStart(2, '0')}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <h3
                                        className={cn(
                                            'text-xs font-bold tracking-tight truncate',
                                            isComplete ? 'text-[var(--vylos-green-accent)]' : 'text-gray-200 group-hover:text-white'
                                        )}
                                    >
                                        {mod.title}
                                    </h3>
                                    <span className="text-[9px] text-gray-600 font-mono">
                                        {mp.done}/{mp.total} lessons
                                    </span>
                                </div>
                                <ChevronDown
                                    size={14}
                                    className={cn('text-gray-600 transition-transform duration-300 shrink-0', isOpen && 'rotate-180')}
                                />
                            </button>

                            {/* Lessons */}
                            {isOpen && (
                                <div className="px-3.5 pb-3.5 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <p className="text-[10px] text-gray-500 leading-relaxed mb-3 pl-10">{mod.description}</p>
                                    <div className="space-y-0.5 border-t border-[#27272a]/50 pt-2">
                                        {mod.lessons.map((lesson, li) => {
                                            const isDone = done.has(lesson.id);
                                            const teaching = isTeaching(lesson.id);
                                            return (
                                                <div
                                                    key={lesson.id}
                                                    className={cn(
                                                        'w-full flex items-start rounded-lg transition-colors group/lesson',
                                                        teaching ? 'bg-[var(--vylos-green-dark)]/10' : 'hover:bg-[#18181b]'
                                                    )}
                                                >
                                                    <button
                                                        onClick={() => toggleLesson(course.id, lesson.id)}
                                                        title={isDone ? 'Mark as not done' : 'Mark as done'}
                                                        aria-label={isDone ? `Mark ${lesson.title} as not done` : `Mark ${lesson.title} as done`}
                                                        className="pl-2 pr-1 py-1.5 shrink-0"
                                                    >
                                                        {isDone ? (
                                                            <CheckCircle size={13} className="text-[var(--vylos-green)] mt-0.5" strokeWidth={2.5} />
                                                        ) : (
                                                            <Circle size={13} className="text-gray-700 group-hover/lesson:text-gray-500 hover:!text-[var(--vylos-green)] mt-0.5 transition-colors" />
                                                        )}
                                                    </button>
                                                    <button
                                                        onClick={() => setOpenLesson({ courseId: course.id, lessonId: lesson.id })}
                                                        title="Open the lesson: notes, and learn it by chatting, by voice or with practice"
                                                        className="flex-1 flex items-start pr-1 py-1.5 text-left min-w-0"
                                                    >
                                                        <span
                                                            className={cn(
                                                                'text-[11px] leading-relaxed transition-colors',
                                                                isDone ? 'text-gray-600 line-through decoration-[var(--vylos-green-dark)]' : 'text-gray-400 group-hover/lesson:text-gray-200'
                                                            )}
                                                        >
                                                            <span className="text-gray-700 font-mono mr-1.5">{mi + 1}.{li + 1}</span>
                                                            {lesson.title}
                                                        </span>
                                                    </button>
                                                    {lesson.exercise && (() => {
                                                        const passed = exerciseProgress[exerciseKey({ courseId: course.id, lessonId: lesson.id })]?.passed;
                                                        return (
                                                            <button
                                                                onClick={() => void openExercise({ courseId: course.id, lessonId: lesson.id })}
                                                                title={passed ? 'Exercise passed. Open it again' : 'Practice: a coding exercise, checked automatically'}
                                                                className={cn(
                                                                    'flex items-center gap-1 px-1.5 my-1 h-5 rounded shrink-0 text-[9px] font-bold uppercase tracking-wider border transition-colors',
                                                                    passed
                                                                        ? 'text-[var(--vylos-green)] border-[var(--vylos-green-dark)]/50 bg-[var(--vylos-green-dark)]/10'
                                                                        : 'text-gray-400 border-[#27272a] hover:text-white hover:border-[#3f3f46]'
                                                                )}
                                                            >
                                                                <Dumbbell size={10} /> {passed ? 'Done' : 'Practice'}
                                                            </button>
                                                        );
                                                    })()}
                                                    <button
                                                        onClick={() => startLessonWithTutor({ courseId: course.id, lessonId: lesson.id })}
                                                        title="Teach me this lesson (voice tutor)"
                                                        className={cn(
                                                            'px-2 py-1.5 shrink-0 transition-all',
                                                            teaching
                                                                ? 'text-[var(--vylos-green)]'
                                                                : 'text-gray-700 opacity-0 group-hover/lesson:opacity-100 hover:text-[var(--vylos-green)]'
                                                        )}
                                                    >
                                                        <Mic size={13} className={teaching ? 'animate-pulse' : ''} />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {!isComplete && (
                                        <button
                                            onClick={() => completeLessons(course.id, moduleLessonIds(course, mi))}
                                            className="mt-2 ml-2 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-gray-600 hover:text-[var(--vylos-green)] transition-colors"
                                        >
                                            <CheckCheck size={11} /> Mark module complete
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            </div>

            {progress.percent === 100 && (
                <div className="p-4 bg-[var(--vylos-green-dark)]/20 border-t border-[var(--vylos-green-dark)]/30 flex items-center justify-center gap-2">
                    <Trophy size={16} className="text-[var(--vylos-green)]" />
                    <span className="text-[10px] font-black text-[var(--vylos-green)] uppercase tracking-[0.2em]">
                        {course.title} — Mastery Achieved
                    </span>
                </div>
            )}
        </div>
    );
}
