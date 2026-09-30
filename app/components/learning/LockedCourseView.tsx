'use client';

import { useState } from 'react';
import { Coins, Layers, Loader2, Lock, LogIn, Unlock } from 'lucide-react';
import type { Course } from '@/app/lib/learning/types';
import { useAuthStore } from '@/app/lib/stores/auth-store';
import { useProgressStore } from '@/app/lib/stores/progress-store';
import { unlockCourse } from '@/app/lib/learning/course-access';
import { BackButton, Bar, Card, CardTitle, PrimaryButton } from './progress-ui';

/** What a learner must know first, from the course's level, e.g. "Intermediate (Python required)" → "Python". */
const requiredFirst = (course: Course) => course.level.match(/\(([^)]*?) required\)/i)?.[1] ?? null;

/** A course that costs Vylos Coins: what's inside, the price, and how close the learner is. */
export default function LockedCourseView({ course, cost, onBack }: { course: Course; cost: number; onBack: () => void }) {
    const user = useAuthStore((s) => s.user);
    const signIn = useAuthStore((s) => s.signInViaBrowser);
    const coins = useProgressStore((s) => (user && s.progressFor === user.id ? s.progress?.coins ?? 0 : 0));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const before = requiredFirst(course);
    const enough = coins >= cost;

    const unlock = async () => {
        setBusy(true);
        setError(await unlockCourse(course));
        setBusy(false);
    };

    return (
        <div className="h-full flex flex-col bg-[var(--vylos-black)]">
            <div className="p-5 pb-4 border-b border-[var(--vylos-grey-border)] bg-gradient-to-br from-[#09090b] to-black">
                <BackButton onClick={onBack}>Catalog</BackButton>
                <div className="mt-3 flex items-start gap-3">
                    <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0 border"
                        style={{ backgroundColor: `${course.accent}1f`, borderColor: `${course.accent}40`, color: course.accent }}
                    >
                        {course.badge}
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-base font-black text-white leading-tight">{course.title}</h2>
                        <p className="mt-1 text-[10.5px] text-gray-400 leading-relaxed">{course.tagline}</p>
                        <p className="mt-1 text-[9px] uppercase tracking-wider text-gray-500">{course.level} · ~{course.hours}h</p>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <Card className="border-yellow-500/20">
                    <p className="flex items-center gap-1.5 text-[11px] font-bold text-yellow-300">
                        <Lock size={12} /> Unlock with {cost} Vylos Coins
                    </p>
                    <p className="mt-2 text-[10.5px] text-gray-400 leading-relaxed">
                        Coins come from learning: 1 for every 10 XP you earn, plus 200 for each certificate. Finishing a beginner
                        course{before ? ` like ${before}` : ''} earns enough to unlock the next one. They can&apos;t be bought.
                    </p>

                    {!user ? (
                        <button
                            onClick={() => void signIn('signin')}
                            className="mt-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--vylos-green)] hover:text-[var(--vylos-green-accent)]"
                        >
                            <LogIn size={11} /> Sign in to unlock
                        </button>
                    ) : (
                        <>
                            <div className="mt-3 flex justify-between text-[10px] mb-1">
                                <span className="flex items-center gap-1 text-gray-400"><Coins size={10} className="text-yellow-400" /> You have {coins}</span>
                                <span className="font-mono text-gray-500">{Math.min(coins, cost)} / {cost}</span>
                            </div>
                            <Bar value={coins / cost} tone="amber" label="Coins toward this course" />
                            <PrimaryButton onClick={() => void unlock()} disabled={!enough || busy} className="mt-3 w-full">
                                {busy ? <Loader2 size={12} className="animate-spin" /> : <Unlock size={12} />}
                                {enough ? `Unlock for ${cost} coins` : `${cost - coins} more coins to go`}
                            </PrimaryButton>
                        </>
                    )}
                    {error && <p className="mt-2 text-[10.5px] text-red-300">{error}</p>}
                </Card>

                {before && (
                    <p className="px-1 text-[10.5px] text-gray-500 leading-relaxed">
                        This course expects you to know {before} already. If you haven&apos;t learned it yet, start there: it&apos;s the
                        best way to earn the coins, too.
                    </p>
                )}

                <Card>
                    <CardTitle icon={<Layers size={10} />}>What&apos;s inside</CardTitle>
                    <ol className="space-y-1.5">
                        {course.modules.map((mod, i) => (
                            <li key={mod.title} className="flex gap-2 text-[10.5px]">
                                <span className="font-mono text-gray-600 w-4 text-right shrink-0">{i + 1}</span>
                                <span className="text-gray-300">{mod.title}</span>
                                <span className="ml-auto text-gray-600 shrink-0">{mod.lessons.length}</span>
                            </li>
                        ))}
                    </ol>
                </Card>
            </div>
        </div>
    );
}
