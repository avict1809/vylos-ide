'use client';

import { useState } from 'react';
import { GraduationCap, Loader2 } from 'lucide-react';
import type { ResolvedLesson } from '@/app/lib/learning/lesson-utils';
import { useAuthStore } from '@/app/lib/stores/auth-store';
import { useProgressStore } from '@/app/lib/stores/progress-store';
import { learningAi } from '@/app/lib/learning/progress-api';
import { skillIds } from '@/app/lib/learning/progress-ids';
import { refreshProgress } from '@/app/lib/learning/progress-sync';
import { AiAssessmentNote, pct } from './progress-ui';
import { cn } from '@/app/lib/utils';

/**
 * "Teach it back": the learner explains the lesson's idea in their own words
 * and Acyrx judges how well it shows understanding. A good explanation is
 * evidence of mastery, which a finished lesson alone is not.
 */
export default function ExplainBack({ lesson }: { lesson: ResolvedLesson }) {
    const user = useAuthStore((s) => s.user);
    const tracked = useProgressStore((s) => !s.trackedPaths || s.trackedPaths.includes(lesson.course.id));
    const [open, setOpen] = useState(false);
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<{ score: number; feedback: string; misconceptions: string[]; xp: number } | null>(null);
    const [error, setError] = useState<string | null>(null);

    if (!user || !tracked || lesson.course.extension) return null;

    const submit = async () => {
        setBusy(true);
        setError(null);
        const res = await learningAi.scoreExplanation(skillIds(lesson.course)[lesson.moduleIndex], lesson.lessonTitle, text);
        setBusy(false);
        if ('error' in res) return setError(res.error);
        setResult({ ...res.data, xp: res.data.result?.xp ?? 0 });
        void refreshProgress();
    };

    if (!open) {
        return (
            <button
                onClick={() => setOpen(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-[#27272a] hover:border-[var(--vylos-green-dark)] text-[10px] font-bold uppercase tracking-wider text-gray-400 hover:text-white"
            >
                <GraduationCap size={12} /> Explain it back to Acyrx
            </button>
        );
    }

    return (
        <div className="rounded-xl border border-[#27272a] bg-[#09090b] p-3 space-y-2">
            <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-gray-500">
                <GraduationCap size={10} /> Teach it back
            </p>
            <p className="text-[10.5px] text-gray-400 leading-relaxed">
                Explain <span className="text-gray-200">{lesson.lessonTitle}</span> as if teaching a friend: what it is, why it matters, and an example.
            </p>
            {!result && (
                <>
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        rows={5}
                        maxLength={4000}
                        placeholder="In my own words…"
                        className="w-full px-2.5 py-2 bg-black border border-[#27272a] focus:border-[var(--vylos-green)] rounded-lg text-[11px] text-white outline-none resize-y"
                    />
                    <div className="flex items-center justify-between">
                        <span className="text-[9px] text-gray-600">{text.trim().length < 40 ? 'A few sentences, please' : `${text.length} characters`}</span>
                        <button
                            onClick={() => void submit()}
                            disabled={busy || text.trim().length < 40}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--vylos-green)] hover:bg-[var(--vylos-green-accent)] disabled:opacity-40 text-black text-[10px] font-bold uppercase tracking-wider"
                        >
                            {busy && <Loader2 size={11} className="animate-spin" />} Check my explanation
                        </button>
                    </div>
                </>
            )}
            {result && (
                <div className="space-y-2">
                    <p className={cn('text-[11px] font-bold', result.score >= 0.7 ? 'text-[var(--vylos-green)]' : 'text-amber-300')}>
                        {pct(result.score)} understanding{result.xp ? ` · +${result.xp} XP` : ''}
                    </p>
                    <p className="text-[11px] text-gray-300 leading-relaxed">{result.feedback}</p>
                    {result.misconceptions.length > 0 && (
                        <ul className="list-disc pl-4 text-[10.5px] text-amber-200/90 space-y-0.5">
                            {result.misconceptions.map((m) => <li key={m}>{m}</li>)}
                        </ul>
                    )}
                    <AiAssessmentNote />
                    <button onClick={() => { setResult(null); setText(''); }} className="text-[10px] text-gray-500 hover:text-gray-300">Try again</button>
                </div>
            )}
            {error && <p className="text-[10.5px] text-red-300">{error}</p>}
        </div>
    );
}
