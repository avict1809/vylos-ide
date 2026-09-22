'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, HelpCircle, Loader2, XCircle } from 'lucide-react';
import type { Course } from '@/app/lib/learning/types';
import { useAuthStore } from '@/app/lib/stores/auth-store';
import { api, learningAi, reasonOf, type Quiz, type QuizResult } from '@/app/lib/learning/progress-api';
import { skillIds } from '@/app/lib/learning/progress-ids';
import { refreshProgress } from '@/app/lib/learning/progress-sync';
import { ACHIEVEMENT_NAMES } from '@/app/lib/stores/progress-store';
import Markdown from '../ui/Markdown';
import { BackButton, Bar, Card, PrimaryButton, pct } from './progress-ui';
import { cn } from '@/app/lib/utils';

/**
 * A module's quiz: multiple choice, graded on the server against a key the
 * app never receives. Passing every module's quiz is part of the certificate.
 */
export default function QuizView({ course, moduleIndex, onBack }: { course: Course; moduleIndex: number; onBack: () => void }) {
    const user = useAuthStore((s) => s.user);
    const mod = course.modules[moduleIndex];
    const [quiz, setQuiz] = useState<Quiz | null>(null);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [result, setResult] = useState<QuizResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const startedAt = useRef(0);

    useEffect(() => {
        if (!user || !mod) return;
        let cancelled = false;
        learningAi.getQuiz(skillIds(course)[moduleIndex]).then((res) => {
            if (cancelled) return;
            setLoading(false);
            if ('error' in res) return setError(res.error);
            setQuiz({ ...res.data, pass_mark: Number(res.data.pass_mark) });
            startedAt.current = Date.now();
        });
        return () => { cancelled = true; };
    }, [user, course, moduleIndex, mod]);

    const submit = async () => {
        if (!quiz) return;
        setSubmitting(true);
        setError(null);
        try {
            setResult(await api.submitQuiz(quiz.id, answers, (Date.now() - startedAt.current) / 1000));
            void refreshProgress();
        } catch (e) {
            setError(reasonOf(e));
        } finally {
            setSubmitting(false);
        }
    };

    const retry = () => {
        setResult(null);
        setAnswers({});
        startedAt.current = Date.now();
    };

    return (
        <div className="h-full flex flex-col bg-[var(--vylos-black)]">
            <div className="p-5 pb-4 border-b border-[var(--vylos-grey-border)] bg-gradient-to-br from-[#09090b] to-black">
                <BackButton onClick={onBack}>{course.title}</BackButton>
                <p className="mt-3 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-[var(--vylos-green-accent)]">
                    <HelpCircle size={10} /> Module quiz · {moduleIndex + 1}
                </p>
                <h2 className="mt-1 text-sm font-black text-white leading-snug">{mod?.title}</h2>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {!user && <p className="text-[11px] text-gray-400">Sign in to take quizzes.</p>}
                {user && loading && (
                    <p className="flex items-center gap-2 text-[11px] text-gray-500"><Loader2 size={12} className="animate-spin" /> Getting the quiz ready…</p>
                )}

                {quiz && !result && (
                    <>
                        {quiz.questions.map((q, i) => (
                            <Card key={q.id}>
                                <p className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-2">Question {i + 1} of {quiz.questions.length}</p>
                                <Markdown text={q.question} className="text-[11.5px] leading-relaxed text-gray-200" />
                                <div className="mt-3 space-y-1.5" role="radiogroup">
                                    {q.options.map((option) => (
                                        <button
                                            key={option.id}
                                            role="radio"
                                            aria-checked={answers[q.id] === option.id}
                                            onClick={() => setAnswers({ ...answers, [q.id]: option.id })}
                                            className={cn(
                                                'w-full flex gap-2 px-2.5 py-2 rounded-lg border text-left text-[11px] transition-colors',
                                                answers[q.id] === option.id
                                                    ? 'border-[var(--vylos-green)] bg-[var(--vylos-green-dark)]/15 text-white'
                                                    : 'border-[#27272a] text-gray-300 hover:border-[#3f3f46]'
                                            )}
                                        >
                                            <span className="font-mono text-gray-500 uppercase">{option.id}</span>
                                            <span className="flex-1 whitespace-pre-wrap">{option.text}</span>
                                        </button>
                                    ))}
                                </div>
                            </Card>
                        ))}
                        <PrimaryButton
                            onClick={() => void submit()}
                            disabled={submitting || Object.keys(answers).length < quiz.questions.length}
                            className="w-full"
                        >
                            {submitting && <Loader2 size={12} className="animate-spin" />}
                            {Object.keys(answers).length < quiz.questions.length
                                ? `Answer all ${quiz.questions.length} to submit`
                                : 'Submit answers'}
                        </PrimaryButton>
                    </>
                )}

                {result && (
                    <Card>
                        <div className="flex items-baseline justify-between">
                            <span className={cn('flex items-center gap-1.5 text-[11px] font-bold', result.passed ? 'text-[var(--vylos-green)]' : 'text-amber-300')}>
                                {result.passed ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                                {result.passed ? 'Passed' : `Not yet: ${pct(quiz?.pass_mark ?? 0.7)} needed`}
                            </span>
                            <span className="text-xl font-black text-white">{result.correct}/{result.total}</span>
                        </div>
                        <Bar value={result.score} className="mt-2" label="Quiz score" />
                        {result.xp ? <p className="mt-2 text-[11px] font-bold text-[var(--vylos-green)]">+{result.xp} XP</p> : null}
                        {result.mastery != null && (
                            <p className="mt-1 text-[10.5px] text-gray-400">Mastery · {mod?.title}: <span className="font-mono text-gray-200">{pct(Number(result.mastery))}</span></p>
                        )}
                        {(result.achievements ?? []).map((a) => (
                            <p key={a} className="mt-1 text-[10.5px] text-yellow-300">Achievement unlocked: {ACHIEVEMENT_NAMES[a] ?? a}</p>
                        ))}
                        {result.flagged && (
                            <p className="mt-2 text-[10.5px] text-amber-300/90">
                                That was very fast, or one retake too many this hour, so it didn&apos;t count. Take your time.
                            </p>
                        )}
                        {!result.passed && (
                            <button onClick={retry} className="mt-3 text-[10px] font-bold uppercase tracking-wider text-gray-400 hover:text-white">
                                Review the lessons, then try again
                            </button>
                        )}
                    </Card>
                )}
                {error && <p className="text-[10.5px] text-red-300 px-1">{error}</p>}
            </div>
        </div>
    );
}
