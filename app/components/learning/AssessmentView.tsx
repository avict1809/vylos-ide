'use client';

import { useState } from 'react';
import { CheckCircle2, ClipboardCheck, Loader2, XCircle } from 'lucide-react';
import type { Course } from '@/app/lib/learning/types';
import { useAuthStore } from '@/app/lib/stores/auth-store';
import { learningAi, type AssessmentQuestion, type AssessmentResult } from '@/app/lib/learning/progress-api';
import { refreshProgress } from '@/app/lib/learning/progress-sync';
import Markdown from '../ui/Markdown';
import { AiAssessmentNote, BackButton, Bar, Card, PrimaryButton, pct } from './progress-ui';
import { cn } from '@/app/lib/utils';

const draftKey = (sessionId: string) => `vylos-assessment-${sessionId}`;

function loadDraft(sessionId: string): Record<string, string> {
    try {
        return JSON.parse(localStorage.getItem(draftKey(sessionId)) ?? '{}');
    } catch {
        return {};
    }
}

/**
 * The course's final assessment: one question per module, written fresh for
 * this learner and graded on the server against a rubric the app never sees.
 * One graded attempt a day, so it can't be retaken until the questions are easy.
 */
export default function AssessmentView({ course, onBack }: { course: Course; onBack: () => void }) {
    const user = useAuthStore((s) => s.user);
    const [session, setSession] = useState<{ id: string; questions: AssessmentQuestion[]; passMark: number } | null>(null);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [result, setResult] = useState<AssessmentResult | null>(null);
    const [busy, setBusy] = useState<'starting' | 'grading' | null>(null);
    const [error, setError] = useState<string | null>(null);

    const start = async () => {
        setBusy('starting');
        setError(null);
        const res = await learningAi.startAssessment(course.id);
        setBusy(null);
        if ('error' in res) return setError(res.error);
        setSession({ id: res.data.session_id, questions: res.data.questions, passMark: res.data.pass_mark });
        setAnswers(loadDraft(res.data.session_id));
    };

    const answer = (id: string, text: string) => {
        const next = { ...answers, [id]: text };
        setAnswers(next);
        try {
            if (session) localStorage.setItem(draftKey(session.id), JSON.stringify(next));
        } catch { /* storage full: the answer is still on screen */ }
    };

    const submit = async () => {
        if (!session) return;
        setBusy('grading');
        setError(null);
        const res = await learningAi.submitAssessment(session.id, answers);
        setBusy(null);
        if ('error' in res) return setError(res.error);
        setResult(res.data);
        try { localStorage.removeItem(draftKey(session.id)); } catch { /* nothing to clean */ }
        void refreshProgress();
    };

    const unanswered = session ? session.questions.filter((q) => !answers[q.id]?.trim()).length : 0;

    return (
        <div className="h-full flex flex-col bg-[var(--vylos-black)]">
            <div className="p-5 pb-4 border-b border-[var(--vylos-grey-border)] bg-gradient-to-br from-[#09090b] to-black">
                <BackButton onClick={onBack}>{course.title}</BackButton>
                <p className="mt-3 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-[var(--vylos-green-accent)]">
                    <ClipboardCheck size={10} /> Final assessment
                </p>
                <h2 className="mt-1 text-sm font-black text-white leading-snug">{course.title}</h2>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {!user && <p className="text-[11px] text-gray-400">Sign in to take the assessment.</p>}

                {user && !session && !result && (
                    <Card>
                        <ul className="space-y-1.5 text-[11px] text-gray-300 leading-relaxed list-disc pl-4">
                            <li>One question for each part of the course, written for you when you start.</li>
                            <li>Answer in your own words or with a short snippet of code. Understanding counts, not length.</li>
                            <li>You have 3 hours once you start. Your answers are saved as you type.</li>
                            <li>One graded attempt a day. It needs every lesson done first.</li>
                        </ul>
                        <PrimaryButton onClick={() => void start()} disabled={!!busy} className="mt-4 w-full">
                            {busy === 'starting' ? <Loader2 size={12} className="animate-spin" /> : <ClipboardCheck size={12} />}
                            {busy === 'starting' ? 'Writing your questions…' : 'Start the assessment'}
                        </PrimaryButton>
                    </Card>
                )}

                {session && !result && (
                    <>
                        {session.questions.map((q, i) => (
                            <Card key={q.id}>
                                <p className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-2">
                                    Question {i + 1} of {session.questions.length} · {q.skill_name}
                                </p>
                                <Markdown text={q.question} className="text-[11.5px] leading-relaxed text-gray-200" />
                                <textarea
                                    value={answers[q.id] ?? ''}
                                    onChange={(e) => answer(q.id, e.target.value)}
                                    rows={5}
                                    maxLength={4000}
                                    placeholder="Your answer"
                                    className="mt-3 w-full px-2.5 py-2 bg-black border border-[#27272a] focus:border-[var(--vylos-green)] rounded-lg text-[11px] text-white font-mono outline-none resize-y"
                                />
                            </Card>
                        ))}
                        <PrimaryButton onClick={() => void submit()} disabled={!!busy} className="w-full">
                            {busy === 'grading' ? <Loader2 size={12} className="animate-spin" /> : null}
                            {busy === 'grading' ? 'Grading…' : unanswered ? `Submit (${unanswered} unanswered)` : 'Submit answers'}
                        </PrimaryButton>
                    </>
                )}

                {result && (
                    <>
                        <Card>
                            <div className="flex items-baseline justify-between">
                                <span className={cn('flex items-center gap-1.5 text-[11px] font-bold', result.passed ? 'text-[var(--vylos-green)]' : 'text-amber-300')}>
                                    {result.passed ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                                    {result.passed ? 'Passed' : `Not yet: ${pct(result.pass_mark)} needed`}
                                </span>
                                <span className="text-xl font-black text-white">{pct(result.score)}</span>
                            </div>
                            <Bar value={result.score} className="mt-2" label="Assessment score" />
                            <AiAssessmentNote className="mt-2" />
                        </Card>
                        {result.results.map((r, i) => (
                            <Card key={r.id}>
                                <div className="flex justify-between text-[10px] mb-1">
                                    <span className="text-gray-400">Question {i + 1} · {r.skill_name}</span>
                                    <span className="font-mono text-gray-300">{pct(r.score)}</span>
                                </div>
                                <p className="text-[11px] text-gray-300 leading-relaxed">{r.feedback}</p>
                            </Card>
                        ))}
                        {!result.passed && (
                            <p className="text-[10.5px] text-gray-500 px-1">
                                Practise the parts that scored lowest (the dumbbell next to each skill in the course), then try again tomorrow.
                            </p>
                        )}
                    </>
                )}
                {error && <p className="text-[10.5px] text-red-300 px-1">{error}</p>}
            </div>
        </div>
    );
}
