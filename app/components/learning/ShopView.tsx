'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Coins, Compass, Loader2, Unlock } from 'lucide-react';
import type { Course } from '@/app/lib/learning/types';
import { useAuthStore } from '@/app/lib/stores/auth-store';
import { useProgressStore } from '@/app/lib/stores/progress-store';
import { useCourseGroups } from '@/app/lib/learning/course-registry';
import { courseLock, unlockCourse } from '@/app/lib/learning/course-access';
import { api } from '@/app/lib/learning/progress-api';
import { refreshProgress } from '@/app/lib/learning/progress-sync';
import { BackButton, Card, CardTitle } from './progress-ui';
import { cn } from '@/app/lib/utils';

const EARNING: [string, string][] = [
    ['Every 10 XP you earn', '1 coin'],
    ['Complete a lesson (time spent on it)', '5'],
    ['Solve a challenge (×2 or ×3 with a combo)', '10–45'],
    ['Pass a module quiz', '7'],
    ['Complete a capstone project', '50'],
    ['Earn a certificate', '200'],
    ['Achievements and weekly quests', '10–100'],
];

function CourseRow({ course, cost, coins, recommended, onOpen }: { course: Course; cost: number; coins: number; recommended?: boolean; onOpen: (id: string) => void }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const enough = coins >= cost;
    return (
        <li className="py-2 border-b border-[#1f1f22] last:border-0">
            <div className="flex items-center gap-2">
                <div
                    className="w-7 h-7 rounded-md flex items-center justify-center text-[9px] font-black shrink-0 border"
                    style={{ backgroundColor: `${course.accent}1f`, borderColor: `${course.accent}40`, color: course.accent }}
                >
                    {course.badge}
                </div>
                <button onClick={() => onOpen(course.id)} className="flex-1 min-w-0 text-left">
                    <p className="text-[11px] font-bold text-gray-200 truncate hover:text-white">{course.title}</p>
                    <p className="text-[9px] text-gray-500 truncate">{recommended ? 'Recommended from what you know · ' : ''}{course.level}</p>
                </button>
                <button
                    onClick={async () => {
                        setBusy(true);
                        setError(await unlockCourse(course));
                        setBusy(false);
                    }}
                    disabled={!enough || busy}
                    title={enough ? `Unlock for ${cost} coins` : `${cost - coins} more coins needed`}
                    className={cn(
                        'shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border',
                        enough
                            ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300 hover:bg-yellow-500/20'
                            : 'border-[#27272a] text-gray-600 cursor-not-allowed'
                    )}
                >
                    {busy ? <Loader2 size={10} className="animate-spin" /> : <Coins size={10} />} {cost}
                </button>
            </div>
            {error && <p className="mt-1 text-[10px] text-red-300">{error}</p>}
        </li>
    );
}

/** Spend Vylos Coins on the next course. Coins are earned by learning only. */
export default function ShopView({ onBack, onOpenCourse }: { onBack: () => void; onOpenCourse: (id: string) => void }) {
    const user = useAuthStore((s) => s.user);
    const coins = useProgressStore((s) => (user && s.progressFor === user.id ? s.progress?.coins ?? 0 : 0));
    useProgressStore((s) => s.access);
    const groups = useCourseGroups();
    const [recommended, setRecommended] = useState<string[]>([]);

    useEffect(() => {
        if (!user) return;
        void refreshProgress();
        api.recommendPaths().then((rows) => setRecommended(rows.map((r) => r.path_id))).catch(() => setRecommended([]));
    }, [user]);

    const courses = groups.flatMap((g) => g.courses).filter((c) => !c.extension);
    const priced = courses.map((course) => ({ course, ...courseLock(course, user?.id ?? null) })).filter((c) => c.cost > 0);
    const locked = priced
        .filter((c) => c.locked)
        .sort((a, b) => Number(recommended.includes(b.course.id)) - Number(recommended.includes(a.course.id)) || a.cost - b.cost || a.course.title.localeCompare(b.course.title));
    const owned = priced.filter((c) => !c.locked);

    return (
        <div className="h-full flex flex-col bg-[var(--vylos-black)]">
            <div className="p-5 pb-4 border-b border-[var(--vylos-grey-border)] bg-gradient-to-br from-[#09090b] to-black">
                <BackButton onClick={onBack}>My progress</BackButton>
                <h1 className="mt-3 text-base font-black text-white">Unlock courses</h1>
                <p className="mt-1 flex items-center gap-1.5 text-[12px] text-yellow-300 font-bold">
                    <Coins size={13} /> {coins} Vylos Coins
                </p>
                <p className="mt-1 text-[10px] text-gray-500 leading-relaxed">
                    Beginner courses are always free. Everything that builds on them is unlocked with coins you earn by learning.
                </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {!user && <p className="text-[11px] text-gray-400">Sign in to earn coins and unlock courses.</p>}

                {locked.length > 0 && (
                    <Card>
                        <CardTitle icon={<Compass size={10} />}>Available to unlock</CardTitle>
                        <ul>
                            {locked.map(({ course, cost }) => (
                                <CourseRow key={course.id} course={course} cost={cost} coins={coins} recommended={recommended.includes(course.id)} onOpen={onOpenCourse} />
                            ))}
                        </ul>
                    </Card>
                )}

                <Card>
                    <CardTitle icon={<Coins size={10} />}>How you earn coins</CardTitle>
                    <ul className="space-y-1">
                        {EARNING.map(([what, amount]) => (
                            <li key={what} className="flex justify-between gap-2 text-[10.5px]">
                                <span className="text-gray-400">{what}</span>
                                <span className="font-mono text-yellow-300/90 shrink-0">{amount}</span>
                            </li>
                        ))}
                    </ul>
                    <p className="mt-2 text-[9.5px] text-gray-600 leading-relaxed">
                        Coins can&apos;t be bought, and they never buy grades, mastery or certificates.
                    </p>
                </Card>

                {owned.length > 0 && user && (
                    <Card>
                        <CardTitle icon={<Unlock size={10} />}>Unlocked</CardTitle>
                        <ul className="space-y-1">
                            {owned.map(({ course }) => (
                                <li key={course.id}>
                                    <button
                                        onClick={() => onOpenCourse(course.id)}
                                        className="w-full flex items-center gap-2 px-1 py-1 rounded hover:bg-[#18181b] text-left text-[10.5px] text-gray-300"
                                    >
                                        <CheckCircle2 size={11} className="text-[var(--vylos-green)]" /> {course.title}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </Card>
                )}
            </div>
        </div>
    );
}
