'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, FolderOpen, Loader2, Send, ShieldAlert, Trophy, XCircle } from 'lucide-react';
import type { Course } from '@/app/lib/learning/types';
import { useAuthStore } from '@/app/lib/stores/auth-store';
import { useFileStore } from '@/app/lib/useFileStore';
import { api, learningAi, type ProjectReview } from '@/app/lib/learning/progress-api';
import { capstoneFor, capstoneId, skillIds } from '@/app/lib/learning/progress-ids';
import { collectProjectFiles } from '@/app/lib/learning/capstone';
import { codeHash } from '@/app/lib/learning/code-hash';
import { refreshProgress } from '@/app/lib/learning/progress-sync';
import { AiAssessmentNote, BackButton, Bar, Card, CardTitle, PrimaryButton, SecondaryButton, pct } from './progress-ui';
import { cn } from '@/app/lib/utils';

type Submission = Awaited<ReturnType<typeof api.latestSubmission>>;

const CRITERIA: [keyof ProjectReview, string][] = [
    ['correctness', 'Correctness'],
    ['code_quality', 'Code quality'],
    ['architecture', 'Architecture'],
    ['testing', 'Testing'],
    ['understanding', 'Understanding'],
];

export function ReviewReport({ review, overall, passed }: { review: ProjectReview; overall: number; passed: boolean }) {
    return (
        <div className="space-y-3">
            <Card>
                <div className="flex items-center justify-between mb-3">
                    <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-gray-500">Acyrx code review</p>
                    <span className={cn('flex items-center gap-1 text-[10px] font-bold', passed ? 'text-[var(--vylos-green)]' : 'text-amber-300')}>
                        {passed ? <Trophy size={11} /> : <XCircle size={11} />} {passed ? 'Project complete' : 'Needs work'}
                    </span>
                </div>
                <ul className="space-y-2">
                    {CRITERIA.map(([key, label]) => (
                        <li key={key} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-2 text-[10.5px]">
                            <span className="text-gray-400">{label}</span>
                            <Bar value={Number(review[key])} label={label} />
                            <span className="text-right font-mono text-gray-300">{pct(Number(review[key]))}</span>
                        </li>
                    ))}
                </ul>
                <div className="mt-4 pt-3 border-t border-[#1f1f22] flex items-baseline justify-between">
                    <span className="text-[10px] text-gray-400">Overall demonstrated mastery</span>
                    <span className="text-lg font-black text-white">{pct(overall)}</span>
                </div>
                <AiAssessmentNote className="mt-2" />
            </Card>
            {review.summary && <p className="text-[11.5px] leading-relaxed text-gray-300 px-1">{review.summary}</p>}
            {review.requirements?.length > 0 && (
                <Card>
                    <CardTitle>Requirements</CardTitle>
                    <ul className="space-y-1.5">
                        {review.requirements.map((r) => (
                            <li key={r.requirement} className="flex gap-2 text-[10.5px]">
                                {r.met ? <CheckCircle2 size={12} className="text-[var(--vylos-green)] shrink-0 mt-px" /> : <Circle size={12} className="text-gray-600 shrink-0 mt-px" />}
                                <div>
                                    <p className="text-gray-200">{r.requirement}</p>
                                    {r.note && <p className="text-gray-500">{r.note}</p>}
                                </div>
                            </li>
                        ))}
                    </ul>
                </Card>
            )}
            {(review.strengths?.length > 0 || review.improvements?.length > 0) && (
                <Card>
                    {review.strengths?.length > 0 && (
                        <>
                            <CardTitle>What&apos;s good</CardTitle>
                            <ul className="mb-3 space-y-1 list-disc pl-4 text-[10.5px] text-gray-300">
                                {review.strengths.map((s) => <li key={s}>{s}</li>)}
                            </ul>
                        </>
                    )}
                    {review.improvements?.length > 0 && (
                        <>
                            <CardTitle>To improve</CardTitle>
                            <ul className="space-y-1 list-disc pl-4 text-[10.5px] text-gray-300">
                                {review.improvements.map((s) => <li key={s}>{s}</li>)}
                            </ul>
                        </>
                    )}
                </Card>
            )}
        </div>
    );
}

/** The course's final project: build it anywhere, then send it to Acyrx for review. */
export default function CapstoneView({ course, onBack }: { course: Course; onBack: () => void }) {
    const user = useAuthStore((s) => s.user);
    const projectRoot = useFileStore((s) => s.projectRoot);
    const capstone = capstoneFor(course);
    const [folder, setFolder] = useState<string | null>(projectRoot);
    const [repoUrl, setRepoUrl] = useState('');
    const [submission, setSubmission] = useState<Submission>(null);
    const [loaded, setLoaded] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [gains, setGains] = useState<Record<string, { before: number; after: number }> | null>(null);
    const [resubmitting, setResubmitting] = useState(false);

    useEffect(() => {
        if (!user) return;
        api.latestSubmission(user.id, capstoneId(course))
            .then(setSubmission)
            .catch(() => setSubmission(null))
            .finally(() => setLoaded(true));
    }, [user, course]);

    const chooseFolder = async () => {
        const dir = await window.electron?.dialog.openDirectory();
        if (dir) setFolder(dir);
    };

    const submit = async () => {
        if (!user || !folder) return;
        setError(null);
        setGains(null);
        const url = repoUrl.trim();
        if (url && !/^https:\/\//.test(url)) return setError('The repository link must start with https://');

        setBusy('Reading your project…');
        const { files, skipped } = await collectProjectFiles(folder);
        if (Object.keys(files).length === 0) {
            setBusy(null);
            return setError('No source files found in that folder.');
        }
        if (skipped.length) console.info('Capstone review skipped (size limits):', skipped);

        try {
            setBusy('Submitting…');
            const hash = await codeHash(files);
            const submitted = await api.submitProject(capstoneId(course), url || null, hash);
            if (submitted.status === 'flagged') {
                setSubmission(await api.latestSubmission(user.id, capstoneId(course)));
                setBusy(null);
                return;
            }
            setBusy('Acyrx is reviewing your code…');
            const result = await learningAi.reviewProject(submitted.submission_id, files);
            if ('error' in result) {
                setError(result.error);
            } else {
                setGains(result.data.result?.skills ?? null);
                setResubmitting(false);
                void refreshProgress();
            }
            setSubmission(await api.latestSubmission(user.id, capstoneId(course)));
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(null);
        }
    };

    const reviewed = submission?.reviewed_at && submission.review;
    const showForm = !submission || resubmitting || (!reviewed && submission.status !== 'flagged');

    return (
        <div className="h-full flex flex-col bg-[var(--vylos-black)]">
            <div className="p-5 pb-4 border-b border-[var(--vylos-grey-border)] bg-gradient-to-br from-[#09090b] to-black">
                <BackButton onClick={onBack}>{course.title}</BackButton>
                <p className="mt-3 text-[9px] font-bold uppercase tracking-widest text-[var(--vylos-green-accent)]">Final capstone</p>
                <h2 className="mt-1 text-sm font-black text-white leading-snug">{capstone.title}</h2>
                <p className="mt-1 text-[11px] text-gray-400 leading-relaxed">{capstone.description}</p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {!user && <p className="text-[11px] text-gray-400">Sign in to submit your capstone for review.</p>}

                <Card>
                    <CardTitle>Requirements</CardTitle>
                    <ul className="space-y-1.5">
                        {capstone.requirements.map((r) => (
                            <li key={r} className="flex gap-2 text-[10.5px] text-gray-300"><Circle size={10} className="text-gray-600 shrink-0 mt-[3px]" /> {r}</li>
                        ))}
                    </ul>
                    <p className="mt-3 text-[9.5px] text-gray-500 leading-relaxed">
                        Acyrx looks at correctness, code quality, architecture, testing, and how well your README explains your decisions.
                        Build it in its own folder, with a README.
                    </p>
                </Card>

                {user && loaded && submission?.status === 'flagged' && (
                    <Card className="border-amber-500/30">
                        <p className="flex gap-2 text-[11px] text-amber-200">
                            <ShieldAlert size={13} className="shrink-0 mt-px" />
                            This submission is identical to another learner&apos;s, so it&apos;s waiting for a person to review it. If that&apos;s a mistake, it will be cleared.
                        </p>
                    </Card>
                )}

                {user && reviewed && !resubmitting && (
                    <>
                        <ReviewReport review={submission.review!} overall={submission.overall_score ?? 0} passed={submission.status === 'passed'} />
                        {gains && Object.keys(gains).length > 0 && (
                            <Card>
                                <CardTitle>Skill progress</CardTitle>
                                <ul className="space-y-1 text-[10.5px]">
                                    {Object.entries(gains).map(([skill, g]) => (
                                        <li key={skill} className="flex justify-between text-gray-300">
                                            <span>{course.modules[skillIds(course).indexOf(skill)]?.title ?? skill}</span>
                                            <span className="font-mono text-[var(--vylos-green)]">{pct(g.before)} → {pct(g.after)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </Card>
                        )}
                        {submission.status === 'passed' && (
                            <label className="flex items-center gap-2 px-1 text-[11px] text-gray-300">
                                <input
                                    type="checkbox"
                                    checked={submission.is_public}
                                    onChange={async (e) => {
                                        await api.setSubmissionPublic(submission.id, e.target.checked);
                                        setSubmission({ ...submission, is_public: e.target.checked });
                                    }}
                                />
                                Share this project on my public profile
                            </label>
                        )}
                        <SecondaryButton onClick={() => setResubmitting(true)} className="w-full">
                            {submission.status === 'passed' ? 'Submit an improved version' : 'Submit a new version'}
                        </SecondaryButton>
                    </>
                )}

                {user && loaded && showForm && (
                    <Card>
                        <CardTitle>{submission && !reviewed && submission.status !== 'flagged' ? 'Finish your submission' : 'Submit for review'}</CardTitle>
                        <div className="flex items-center gap-2">
                            <p className="flex-1 min-w-0 truncate font-mono text-[10px] text-gray-400" title={folder ?? ''}>{folder ?? 'No folder chosen'}</p>
                            <SecondaryButton onClick={() => void chooseFolder()} disabled={!!busy}><FolderOpen size={11} /> Folder</SecondaryButton>
                        </div>
                        <input
                            value={repoUrl}
                            onChange={(e) => setRepoUrl(e.target.value)}
                            placeholder="Repository or live link (optional, https://…)"
                            className="mt-2 w-full px-2.5 py-1.5 bg-black border border-[#27272a] focus:border-[var(--vylos-green)] rounded-lg text-[11px] text-white outline-none"
                        />
                        <PrimaryButton onClick={() => void submit()} disabled={!folder || !!busy} className="mt-3 w-full">
                            {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} {busy ?? 'Submit for review'}
                        </PrimaryButton>
                        <p className="mt-2 text-[9px] text-gray-600 leading-relaxed">
                            Your source files (not dependencies or build output) are sent to Vylos AI for the review. Each review uses one AI request.
                        </p>
                        {resubmitting && (
                            <button onClick={() => setResubmitting(false)} className="mt-2 text-[10px] text-gray-500 hover:text-gray-300">Cancel</button>
                        )}
                    </Card>
                )}
                {error && <p className="text-[10.5px] text-red-300 px-1">{error}</p>}
            </div>
        </div>
    );
}
