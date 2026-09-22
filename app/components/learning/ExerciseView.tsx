'use client';

import { Fragment, useState, type ReactNode } from 'react';
import {
    ArrowLeft, ArrowRight, CheckCircle2, ChevronRight, CircleAlert, Dumbbell, FileCode2, Lightbulb, Loader2,
    Lock, Mic, Play, RotateCcw, XCircle,
} from 'lucide-react';
import type { LessonRef } from '@/app/lib/learning/lesson-utils';
import { nextLessonRef, startLessonWithTutor } from '@/app/lib/learning/lesson-utils';
import { exerciseKey, useExerciseStore } from '@/app/lib/stores/exercise-store';
import { checkExercise, exerciseFor, openExercise, resetExercise } from '@/app/lib/exercises/session';
import { mainFile } from '@/app/lib/exercises/format';
import type { CheckResult } from '@/app/lib/exercises/checkers';
import { useFileStore } from '@/app/lib/useFileStore';
import { cn } from '@/app/lib/utils';
import { useProgressStore } from '@/app/lib/stores/progress-store';
import { PRACTICE_COURSE_ID, practiceOrigin } from '@/app/lib/learning/practice';

const DEFAULT_SOLUTION_AFTER = 3;

/** `code` in backticks becomes <code>; blank lines separate paragraphs. */
function RichText({ text, className }: { text: string; className?: string }) {
    return (
        <>
            {text.split(/\n{2,}/).map((para, i) => (
                <p key={i} className={className}>
                    {para.split(/(`[^`]+`)/g).map((part, j) =>
                        part.startsWith('`') && part.endsWith('`') && part.length > 2 ? (
                            <code key={j} className="px-1 py-px rounded bg-[#18181b] border border-[#27272a] text-[var(--vylos-green-accent)] font-mono text-[0.92em]">
                                {part.slice(1, -1)}
                            </code>
                        ) : (
                            <Fragment key={j}>{part}</Fragment>
                        )
                    )}
                </p>
            ))}
        </>
    );
}

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
    return (
        <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-gray-500">
                {icon} {title}
            </h3>
            {children}
        </section>
    );
}

function Results({ result }: { result: CheckResult }) {
    return (
        <div
            className={cn(
                'rounded-lg border p-3 space-y-2',
                result.passed ? 'border-[var(--vylos-green-dark)]/40 bg-[var(--vylos-green-dark)]/10' : 'border-red-500/25 bg-red-500/5'
            )}
            role="status"
        >
            <p className={cn('flex items-center gap-1.5 text-[11px] font-bold', result.passed ? 'text-[var(--vylos-green)]' : 'text-red-300')}>
                {result.passed ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                {result.passed ? `Passed: ${result.summary.toLowerCase()}` : result.summary}
            </p>
            {result.problem && (
                <p className="flex gap-1.5 text-[10.5px] leading-relaxed text-amber-200/90 whitespace-pre-wrap break-words">
                    <CircleAlert size={12} className="shrink-0 mt-0.5" />
                    <span>{result.problem}</span>
                </p>
            )}
            {result.cases.length > 0 && (
                <ul className="space-y-1.5">
                    {result.cases.map((c, i) => (
                        <li key={i} className="text-[10.5px] leading-relaxed">
                            <div className="flex gap-1.5">
                                {c.passed
                                    ? <CheckCircle2 size={11} className="text-[var(--vylos-green)] shrink-0 mt-[3px]" />
                                    : <XCircle size={11} className="text-red-400 shrink-0 mt-[3px]" />}
                                <div className="min-w-0">
                                    <p className="font-mono text-gray-300 break-words">{c.name}</p>
                                    <p className={cn('break-words', c.passed ? 'text-gray-500' : 'text-gray-400')}>{c.message}</p>
                                </div>
                            </div>
                            {c.compare && c.expected !== undefined && c.actual !== undefined && (
                                <div className="mt-1 ml-4 grid gap-1">
                                    <OutputBlock label="Expected" text={c.expected} />
                                    <OutputBlock label="Your program printed" text={c.actual} />
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function OutputBlock({ label, text }: { label: string; text: string }) {
    return (
        <div>
            <p className="text-[8.5px] uppercase tracking-widest text-gray-600 font-bold mb-0.5">{label}</p>
            <pre className="max-h-32 overflow-auto rounded bg-black/60 border border-[#27272a] px-2 py-1 font-mono text-[10px] text-gray-300 whitespace-pre-wrap break-words">{text}</pre>
        </div>
    );
}

export default function ExerciseView({ lessonRef, onBack }: { lessonRef: LessonRef; onBack: () => void }) {
    const info = exerciseFor(lessonRef);
    const progress = useExerciseStore((s) => s.progress[exerciseKey(lessonRef)]);
    const checking = useExerciseStore((s) => s.checking === exerciseKey(lessonRef));
    const { showNextHint, showSolution } = useExerciseStore();
    const openFileByPath = useFileStore((s) => s.openFileByPath);
    const award = useProgressStore((s) => s.exerciseAwards[exerciseKey(lessonRef)]);
    const [confirm, setConfirm] = useState<'reset' | 'solution' | null>(null);
    const [error, setError] = useState<string | null>(null);

    if (!info) {
        return (
            <div className="p-5 text-xs text-gray-500">
                This exercise isn&apos;t available any more.{' '}
                <button onClick={onBack} className="text-[var(--vylos-green)] hover:underline">Back to the course</button>
            </div>
        );
    }

    const { lesson, exercise } = info;
    const hints = exercise.hints ?? [];
    const hintsShown = Math.min(progress?.hintsShown ?? 0, hints.length);
    const failures = progress?.failures ?? 0;
    const solutionAfter = exercise.solutionAfter ?? DEFAULT_SOLUTION_AFTER;
    const solutionUnlocked = failures >= solutionAfter || !!progress?.passed;
    const result = progress?.lastResult;
    const next = nextLessonRef(lesson.course, lessonRef);
    const nextHasExercise = !!(next && exerciseFor(next));

    const run = async () => {
        setError(null);
        const opened = await openExercise(lessonRef);
        if (!opened.ok) return setError(opened.error);
        await checkExercise(lessonRef);
    };

    const openFile = async (name: string) => {
        const opened = await openExercise(lessonRef);
        if (!opened.ok) return setError(opened.error);
        // Sibling of the main file, whatever the path separator
        if (name !== mainFile(exercise)) await openFileByPath(opened.path.slice(0, -mainFile(exercise).length) + name);
    };

    return (
        <div className="h-full flex flex-col bg-[var(--vylos-black)]">
            {/* Header */}
            <div className="p-5 pb-4 border-b border-[var(--vylos-grey-border)] bg-gradient-to-br from-[#09090b] to-black space-y-3">
                <div className="flex items-center justify-between">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-[var(--vylos-green)] transition-colors"
                    >
                        <ArrowLeft size={11} /> {lesson.course.id === PRACTICE_COURSE_ID ? practiceOrigin(lessonRef.lessonId)?.title ?? 'Practice' : lesson.course.title}
                    </button>
                    <button
                        onClick={() => startLessonWithTutor(lessonRef)}
                        title="Learn this lesson with the voice tutor"
                        className="p-1 text-gray-600 hover:text-[var(--vylos-green)] transition-colors"
                    >
                        <Mic size={13} />
                    </button>
                </div>
                <div>
                    <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-[var(--vylos-green-accent)]">
                        <Dumbbell size={10} /> {lesson.course.id === PRACTICE_COURSE_ID ? 'Practice · written for you by Acyrx' : `Exercise · ${lesson.number}`}
                    </p>
                    <h2 className="mt-1 text-sm font-black text-white leading-snug">{lesson.lessonTitle}</h2>
                    <p className="mt-1 text-[10px] text-gray-500">
                        {progress?.passed
                            ? <span className="text-[var(--vylos-green)] font-semibold">Passed ✓</span>
                            : progress?.attempts ? `${progress.attempts} ${progress.attempts === 1 ? 'check' : 'checks'} so far` : 'Not checked yet'}
                    </p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
                <RichText text={exercise.prompt} className="text-[12px] leading-relaxed text-gray-300" />

                <Section title="Files" icon={<FileCode2 size={10} />}>
                    <ul className="space-y-0.5">
                        {Object.keys(exercise.files).map((name) => (
                            <li key={name}>
                                <button
                                    onClick={() => void openFile(name)}
                                    className="w-full flex items-center gap-2 px-2 py-1 rounded text-left font-mono text-[11px] text-gray-300 hover:bg-[#18181b] hover:text-white transition-colors group"
                                >
                                    <FileCode2 size={12} className="text-gray-600 group-hover:text-[var(--vylos-green-accent)]" />
                                    {name}
                                    <ChevronRight size={11} className="ml-auto text-gray-700 group-hover:text-gray-400" />
                                </button>
                            </li>
                        ))}
                    </ul>
                    {progress?.dir && (
                        <p className="px-2 text-[9px] text-gray-600 font-mono truncate" title={progress.dir}>
                            {progress.dir.includes('vylos-exercises') ? `…${progress.dir.slice(progress.dir.indexOf('vylos-exercises') - 1)}` : progress.dir}
                        </p>
                    )}
                </Section>

                <div className="flex gap-2">
                    <button
                        onClick={() => void run()}
                        disabled={checking}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[var(--vylos-green)] hover:bg-[var(--vylos-green-accent)] disabled:opacity-60 text-black font-bold text-[10px] uppercase tracking-widest transition-all active:scale-[0.98]"
                    >
                        {checking ? <Loader2 size={13} className="animate-spin" /> : <Play size={12} fill="currentColor" />}
                        {checking ? 'Checking…' : 'Check my code'}
                    </button>
                    <button
                        onClick={() => setConfirm(confirm === 'reset' ? null : 'reset')}
                        title="Start over with the starter files"
                        className="px-3 rounded-lg border border-[#27272a] text-gray-500 hover:text-gray-200 hover:border-[#3f3f46] transition-colors"
                    >
                        <RotateCcw size={13} />
                    </button>
                </div>
                {confirm === 'reset' && (
                    <div className="rounded-lg border border-[#3f3f46] p-3 text-[10.5px] text-gray-400 space-y-2">
                        <p>Put the starter files back? Your changes to this exercise will be lost.</p>
                        <div className="flex gap-2">
                            <button
                                onClick={async () => { setConfirm(null); await resetExercise(lessonRef); }}
                                className="px-2.5 py-1 rounded bg-red-500/15 text-red-300 hover:bg-red-500/25 font-semibold"
                            >
                                Reset
                            </button>
                            <button onClick={() => setConfirm(null)} className="px-2.5 py-1 rounded text-gray-400 hover:text-gray-200">Cancel</button>
                        </div>
                    </div>
                )}
                {error && <p className="text-[10.5px] text-red-300">{error}</p>}

                {result && !checking && <Results result={result} />}

                {progress?.passed && (
                    <div className="rounded-lg border border-[var(--vylos-green-dark)]/40 bg-[var(--vylos-green-dark)]/10 p-3 space-y-2">
                        <p className="text-[11px] text-gray-300">{lesson.course.id === PRACTICE_COURSE_ID ? 'Solved. Nice work!' : 'Lesson complete. Nice work!'}</p>
                        {award && (
                            <div className="space-y-0.5 text-[10.5px]">
                                {award.xp > 0 && <p className="font-bold text-[var(--vylos-green)]">+{award.xp} XP</p>}
                                {award.skillName && award.masteryAfter > award.masteryBefore && (
                                    <p className="text-gray-400">
                                        Mastery · {award.skillName}{' '}
                                        <span className="font-mono text-gray-200">{Math.round(award.masteryBefore * 100)}% → {Math.round(award.masteryAfter * 100)}%</span>
                                    </p>
                                )}
                                {award.multiplier > 1 ? (
                                    <p className="text-yellow-300 font-semibold">Learning combo ×{award.multiplier} XP · {award.combo} clean solves in a row</p>
                                ) : award.combo > 0 && (
                                    <p className="text-gray-500">Combo {award.combo}: {award.combo < 3 ? `${3 - award.combo} more clean solve${3 - award.combo === 1 ? '' : 's'} for ×2 XP` : ''}</p>
                                )}
                            </div>
                        )}
                        {next && lesson.course.id !== PRACTICE_COURSE_ID && (
                            <button
                                onClick={() => (nextHasExercise ? void openExercise(next) : onBack())}
                                className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--vylos-green)] hover:text-[var(--vylos-green-accent)]"
                            >
                                {nextHasExercise ? 'Next exercise' : 'Back to the course'} <ArrowRight size={11} />
                            </button>
                        )}
                    </div>
                )}

                {hints.length > 0 && (
                    <Section title={`Hints · ${hintsShown} of ${hints.length}`} icon={<Lightbulb size={10} />}>
                        {hintsShown > 0 && (
                            <ol className="space-y-1.5">
                                {hints.slice(0, hintsShown).map((hint, i) => (
                                    <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-gray-400">
                                        <span className="font-mono text-gray-600 shrink-0">{i + 1}.</span>
                                        <div><RichText text={hint} /></div>
                                    </li>
                                ))}
                            </ol>
                        )}
                        {hintsShown < hints.length && (
                            <button
                                onClick={() => showNextHint(lessonRef)}
                                className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-300/90 hover:text-amber-200"
                            >
                                <Lightbulb size={11} /> {hintsShown === 0 ? 'Get a hint' : 'Another hint'}
                            </button>
                        )}
                    </Section>
                )}

                {exercise.solution && (
                    <Section title="Solution" icon={<Lock size={10} />}>
                        {progress?.solutionShown ? (
                            <pre className="rounded-lg bg-black border border-[#27272a] p-3 font-mono text-[10.5px] leading-relaxed text-gray-300 overflow-x-auto">{exercise.solution}</pre>
                        ) : !solutionUnlocked ? (
                            <p className="text-[10.5px] text-gray-600">
                                Unlocks after {solutionAfter} checks that don&apos;t pass ({failures} so far). Try the hints first.
                            </p>
                        ) : confirm === 'solution' ? (
                            <div className="rounded-lg border border-[#3f3f46] p-3 text-[10.5px] text-gray-400 space-y-2">
                                <p>You learn the most from the last push. Sure you want to see the answer?</p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => { setConfirm(null); showSolution(lessonRef); }}
                                        className="px-2.5 py-1 rounded bg-[#27272a] text-gray-200 hover:bg-[#3f3f46] font-semibold"
                                    >
                                        Show me
                                    </button>
                                    <button onClick={() => setConfirm(null)} className="px-2.5 py-1 rounded text-gray-400 hover:text-gray-200">I&apos;ll keep trying</button>
                                </div>
                            </div>
                        ) : (
                            <button onClick={() => setConfirm('solution')} className="text-[10px] font-semibold text-gray-400 hover:text-gray-200">
                                Show the solution
                            </button>
                        )}
                    </Section>
                )}
            </div>
        </div>
    );
}
