'use client';

import { useEffect, useState } from 'react';
import {
    Award, CheckCircle2, ChevronDown, Circle, ClipboardCheck, Dumbbell, FolderGit2, GitBranch, HelpCircle, Loader2, Lock, TriangleAlert,
} from 'lucide-react';
import type { Course } from '@/app/lib/learning/types';
import { useAuthStore } from '@/app/lib/stores/auth-store';
import { useCourseStore } from '@/app/lib/stores/course-store';
import { exerciseKey, useExerciseStore } from '@/app/lib/stores/exercise-store';
import { useProgressStore } from '@/app/lib/stores/progress-store';
import { api, type CertificateReadiness, type CourseMastery, type SkillNode } from '@/app/lib/learning/progress-api';
import { skillIds } from '@/app/lib/learning/progress-ids';
import { canPractice, createPractice, practiceFor, PRACTICE_COURSE_ID, usePracticeStore } from '@/app/lib/learning/practice';
import { openExercise } from '@/app/lib/exercises/session';
import { Bar, Card, CardTitle, pct } from './progress-ui';
import { cn } from '@/app/lib/utils';

export type CourseSubView = 'capstone' | 'assessment' | 'certificate' | `quiz:${number}`;

/** Lessons in a module the learner found hard: failed checks on an exercise they haven't passed, or many failures. */
function struggles(course: Course, moduleIndex: number): string[] {
    const progress = useExerciseStore.getState().progress;
    return course.modules[moduleIndex].lessons
        .filter((lesson) => {
            const p = progress[exerciseKey({ courseId: course.id, lessonId: lesson.id })];
            return p && ((p.failures > 0 && !p.passed) || p.failures >= 3 || p.hintsShown >= 2);
        })
        .map((lesson) => lesson.title);
}

function SkillIcon({ node }: { node: SkillNode }) {
    if (node.status === 'mastered') return <CheckCircle2 size={12} className="text-[var(--vylos-green)] shrink-0" />;
    if (node.status === 'locked') return <Lock size={11} className="text-gray-600 shrink-0" />;
    return <Circle size={11} className={cn('shrink-0', node.status === 'in_progress' ? 'text-sky-400' : 'text-gray-500')} />;
}

/**
 * Course progress next to knowledge mastery (never merged: finishing lessons
 * isn't the same as knowing them), the skill tree with practice for weak
 * spots, and the road to a certificate.
 */
export default function CourseMasteryPanel({ course, onOpenSub }: { course: Course; onOpenSub: (view: CourseSubView) => void }) {
    const user = useAuthStore((s) => s.user);
    const tracked = useProgressStore((s) => !s.trackedPaths || s.trackedPaths.includes(course.id));
    // Refetch whenever the server's numbers move (after each synced activity)
    const serverProgress = useProgressStore((s) => s.progress);
    const completed = useCourseStore((s) => s.completedLessons[course.id]);
    usePracticeStore((s) => s.items);
    const [mastery, setMastery] = useState<CourseMastery | null>(null);
    const [tree, setTree] = useState<SkillNode[] | null>(null);
    const [readiness, setReadiness] = useState<CertificateReadiness | null>(null);
    const [showTree, setShowTree] = useState(false);
    const [practising, setPractising] = useState<number | null>(null);
    const [practiceError, setPracticeError] = useState<string | null>(null);

    useEffect(() => {
        if (!user || !tracked || course.extension) return;
        let cancelled = false;
        Promise.all([api.courseMastery(course.id), api.skillTree(course.id), api.certificateReadiness(course.id)])
            .then(([m, t, r]) => {
                if (cancelled) return;
                setMastery(m);
                setTree(t);
                setReadiness(r);
            })
            .catch(() => { /* offline: the panel stays hidden */ });
        return () => { cancelled = true; };
    }, [user, tracked, course.id, course.extension, serverProgress, completed]);

    if (course.extension || course.id === PRACTICE_COURSE_ID) return null;
    if (!user) {
        return (
            <p className="text-[10px] text-gray-600 leading-relaxed">
                Sign in to see how well you know each part of this course, not just how much you&apos;ve covered.
            </p>
        );
    }
    if (!mastery || !tree) return null;

    const ids = skillIds(course);
    const practicable = canPractice(course);
    const practice = practiceFor(course.id);

    const practise = async (moduleIndex: number) => {
        const node = tree.find((n) => n.skill_id === ids[moduleIndex]);
        setPractising(moduleIndex);
        setPracticeError(null);
        const result = await createPractice(course, moduleIndex, node?.mastery ?? 0, struggles(course, moduleIndex));
        setPractising(null);
        if (!result.ok) setPracticeError(result.error);
    };

    // Weakest skill among those the learner has started (or the first unmastered one)
    const reached = tree.filter((n) => n.evidence_count > 0 || (completed ?? []).some((id) => course.modules[ids.indexOf(n.skill_id)]?.lessons.some((l) => l.id === id)));
    const weakest = [...(reached.length ? reached : tree)].filter((n) => n.status !== 'mastered').sort((a, b) => a.mastery - b.mastery)[0];
    const weakestIndex = weakest ? ids.indexOf(weakest.skill_id) : -1;

    const steps = readiness && [
        { label: `Lessons ${readiness.lessons.done}/${readiness.lessons.total}`, met: readiness.lessons.met },
        { label: `Module quizzes ${readiness.quizzes.passed}/${readiness.quizzes.total}`, met: readiness.quizzes.met },
        { label: `Challenges ${Math.min(readiness.challenges.passed, readiness.challenges.required)}/${readiness.challenges.required}`, met: readiness.challenges.met },
        { label: 'Capstone project', met: readiness.capstone.met, open: 'capstone' as const },
        {
            label: readiness.assessment.score != null ? `Final assessment · ${pct(readiness.assessment.score)}` : 'Final assessment',
            met: readiness.assessment.met,
            open: 'assessment' as const,
        },
    ];
    const ready = !!readiness && Object.values(readiness).every((r) => r.met);

    return (
        <div className="space-y-3">
            <Card className="p-3">
                <div className="flex justify-between text-[10px] mb-1">
                    <span className="text-gray-400">Course progress</span>
                    <span className="font-mono text-sky-300">{pct(mastery.course_progress)}</span>
                </div>
                <Bar value={mastery.course_progress} tone="sky" label="Course progress" />
                <div className="flex justify-between text-[10px] mt-3 mb-1">
                    <span className="text-gray-400">Knowledge mastery</span>
                    <span className="font-mono text-[var(--vylos-green)]">{pct(mastery.knowledge_mastery)}</span>
                </div>
                <Bar value={mastery.knowledge_mastery} label="Knowledge mastery" />
                <p className="mt-2 text-[9px] text-gray-600 leading-relaxed">
                    Mastery grows only from what you show: exercises, practice, explanations, your capstone and the final assessment.
                </p>
                {(mastery.strong.length > 0 || mastery.needs_practice.length > 0) && (
                    <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                        <div>
                            <p className="text-[8.5px] font-bold uppercase tracking-widest text-gray-600 mb-1">Strong</p>
                            {mastery.strong.slice(0, 4).map((name) => (
                                <p key={name} className="flex items-center gap-1 text-gray-300 truncate"><CheckCircle2 size={10} className="text-[var(--vylos-green)] shrink-0" /> {name}</p>
                            ))}
                            {mastery.strong.length === 0 && <p className="text-gray-600">Nothing yet</p>}
                        </div>
                        <div>
                            <p className="text-[8.5px] font-bold uppercase tracking-widest text-gray-600 mb-1">Needs practice</p>
                            {mastery.needs_practice.slice(0, 4).map((name) => (
                                <p key={name} className="flex items-center gap-1 text-gray-300 truncate"><TriangleAlert size={10} className="text-amber-400 shrink-0" /> {name}</p>
                            ))}
                            {mastery.needs_practice.length === 0 && <p className="text-gray-600">Nothing flagged</p>}
                        </div>
                    </div>
                )}
                {practicable && weakestIndex !== -1 && (
                    <button
                        onClick={() => void practise(weakestIndex)}
                        disabled={practising !== null}
                        className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-[#27272a] hover:border-[var(--vylos-green-dark)] text-[10px] font-bold uppercase tracking-wider text-gray-300 hover:text-white disabled:opacity-50"
                    >
                        {practising === weakestIndex ? <Loader2 size={11} className="animate-spin" /> : <Dumbbell size={11} />}
                        {practising === weakestIndex ? 'Acyrx is writing an exercise…' : `Practice my weak spot: ${course.modules[weakestIndex].title}`}
                    </button>
                )}
                {practiceError && <p className="mt-2 text-[10px] text-red-300">{practiceError}</p>}
            </Card>

            <Card className="p-3">
                <button onClick={() => setShowTree(!showTree)} className="w-full flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-gray-500">
                        <GitBranch size={10} /> Skill tree
                    </span>
                    <ChevronDown size={12} className={cn('text-gray-600 transition-transform', showTree && 'rotate-180')} />
                </button>
                {showTree && (
                    <>
                        <p className="mt-2 text-[9px] text-gray-600 leading-relaxed">
                            A skill unlocks once you&apos;ve shown enough of the ones before it. Locks are advice, not a wall: every lesson stays open.
                            <HelpCircle size={9} className="inline mx-0.5" /> takes a skill&apos;s quiz, <Dumbbell size={9} className="inline mx-0.5" /> practises it.
                        </p>
                        <ul className="mt-2 space-y-1.5">
                            {tree.map((node) => {
                                const index = ids.indexOf(node.skill_id);
                                return (
                                    <li key={node.skill_id} className="flex items-center gap-2 text-[10.5px]">
                                        <SkillIcon node={node} />
                                        <span
                                            className={cn('flex-1 truncate', node.status === 'locked' ? 'text-gray-600' : 'text-gray-300')}
                                            title={node.status === 'locked' ? `Build on first: ${node.missing_prerequisites.map((id) => tree.find((n) => n.skill_id === id)?.name ?? id).join(', ')}` : undefined}
                                        >
                                            {node.name}
                                        </span>
                                        {node.evidence_count > 0 && <Bar value={node.mastery} className="w-12" label={`${node.name} mastery`} />}
                                        <span className="w-8 text-right font-mono text-[9px] text-gray-500">{node.evidence_count > 0 ? pct(node.mastery) : ''}</span>
                                        {index !== -1 && (
                                            <button
                                                onClick={() => onOpenSub(`quiz:${index}`)}
                                                title={`${node.name} quiz`}
                                                className="p-0.5 text-gray-600 hover:text-[var(--vylos-green)]"
                                            >
                                                <HelpCircle size={11} />
                                            </button>
                                        )}
                                        {practicable && index !== -1 && (
                                            <button
                                                onClick={() => void practise(index)}
                                                disabled={practising !== null}
                                                title={`Practice ${node.name}`}
                                                className="p-0.5 text-gray-600 hover:text-[var(--vylos-green)] disabled:opacity-40"
                                            >
                                                {practising === index ? <Loader2 size={11} className="animate-spin" /> : <Dumbbell size={11} />}
                                            </button>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </>
                )}
                {practice.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-[#1f1f22]">
                        <p className="text-[8.5px] font-bold uppercase tracking-widest text-gray-600 mb-1.5">Your practice</p>
                        <ul className="space-y-0.5">
                            {practice.slice(-5).reverse().map((item) => (
                                <PracticeRow key={item.id} id={item.id} title={item.title} module={item.moduleTitle} />
                            ))}
                        </ul>
                    </div>
                )}
            </Card>

            {steps && (
                <Card className="p-3">
                    <CardTitle icon={<Award size={10} />}>Certificate</CardTitle>
                    <ul className="space-y-1.5">
                        {steps.map((step) => (
                            <li key={step.label} className="flex items-center gap-2 text-[10.5px]">
                                {step.met ? <CheckCircle2 size={12} className="text-[var(--vylos-green)] shrink-0" /> : <Circle size={12} className="text-gray-600 shrink-0" />}
                                <span className={cn('flex-1', step.met ? 'text-gray-400' : 'text-gray-300')}>{step.label}</span>
                                {step.open && (
                                    <button
                                        onClick={() => onOpenSub(step.open)}
                                        className="flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-wider text-[var(--vylos-green)] hover:text-[var(--vylos-green-accent)]"
                                    >
                                        {step.open === 'capstone' ? <FolderGit2 size={10} /> : <ClipboardCheck size={10} />} Open
                                    </button>
                                )}
                            </li>
                        ))}
                        {!readiness.integrity.met && (
                            <li className="flex items-start gap-2 text-[10px] text-amber-300/90">
                                <TriangleAlert size={12} className="shrink-0 mt-px" />
                                Some activity was flagged (answers too fast, or many rapid retries) and is waiting for a person to review it.
                            </li>
                        )}
                    </ul>
                    <button
                        onClick={() => onOpenSub('certificate')}
                        className={cn(
                            'mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider',
                            ready ? 'bg-[var(--vylos-green)] text-black hover:bg-[var(--vylos-green-accent)]' : 'border border-[#27272a] text-gray-400 hover:text-gray-200'
                        )}
                    >
                        <Award size={11} /> {ready ? 'Claim your certificate' : 'About the certificate'}
                    </button>
                </Card>
            )}
        </div>
    );
}

function PracticeRow({ id, title, module }: { id: string; title: string; module: string }) {
    const passed = useExerciseStore((s) => !!s.progress[exerciseKey({ courseId: PRACTICE_COURSE_ID, lessonId: id })]?.passed);
    return (
        <li>
            <button
                onClick={() => void openExercise({ courseId: PRACTICE_COURSE_ID, lessonId: id })}
                className="w-full flex items-center gap-2 px-1.5 py-1 rounded hover:bg-[#18181b] text-left text-[10.5px]"
            >
                {passed ? <CheckCircle2 size={11} className="text-[var(--vylos-green)] shrink-0" /> : <Dumbbell size={11} className="text-gray-500 shrink-0" />}
                <span className="flex-1 truncate text-gray-300">{title}</span>
                <span className="text-[9px] text-gray-600 truncate max-w-[40%]">{module}</span>
            </button>
        </li>
    );
}
