'use client';

import { useEffect, useState } from 'react';
import {
    ArrowRight, Award, CheckCircle2, Circle, Coins, Compass, ExternalLink, Eye, Flame, Loader2, LogIn, Sparkles, Target, Trophy, Zap,
} from 'lucide-react';
import { useAuthStore } from '@/app/lib/stores/auth-store';
import { useCourseStore } from '@/app/lib/stores/course-store';
import { comboMultiplier, useProgressStore } from '@/app/lib/stores/progress-store';
import { getCourse, useCourseGroups } from '@/app/lib/learning/course-registry';
import { courseProgress } from '@/app/lib/learning/types';
import { refreshProgress } from '@/app/lib/learning/progress-sync';
import { api, profileUrl, type LevelInfo, type MyProfile, type QuestProgress } from '@/app/lib/learning/progress-api';
import { PRACTICE_COURSE_ID } from '@/app/lib/learning/practice';
import { BackButton, Bar, Card, CardTitle, pct } from './progress-ui';
import { cn } from '@/app/lib/utils';

const GOALS = [10, 20, 30, 60] as const;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function greeting() {
    const hour = new Date().getHours();
    return hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

const levelFraction = (level: LevelInfo) =>
    level.next_level_xp == null ? 1 : (level.xp - level.level_min_xp) / Math.max(1, level.next_level_xp - level.level_min_xp);

/** Monday of this week, as YYYY-MM-DD in local time */
function weekDays(): string[] {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return WEEKDAYS.map((_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
}

/** The compact summary at the top of the catalog; opens the dashboard. */
export function ProgressCard({ onOpen }: { onOpen: () => void }) {
    const user = useAuthStore((s) => s.user);
    const progress = useProgressStore((s) => (s.progressFor === user?.id ? s.progress : null));
    useEffect(() => { if (user) void refreshProgress(); }, [user]);

    return (
        <button
            onClick={onOpen}
            className="w-full p-4 rounded-xl border border-[#27272a] hover:border-[#3f3f46] bg-[#09090b] text-left transition-all group"
        >
            {progress ? (
                <>
                    <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--vylos-green)]">
                            Level {progress.level.level} · {progress.level.title}
                        </span>
                        <span className="flex items-center gap-2 text-[10px] text-gray-400">
                            <span className="flex items-center gap-0.5"><Flame size={11} className="text-orange-400" /> {progress.streak}</span>
                            <ArrowRight size={12} className="text-gray-600 group-hover:text-[var(--vylos-green)] transition-colors" />
                        </span>
                    </div>
                    <Bar value={levelFraction(progress.level)} className="mt-2" label="Progress to the next level" />
                    <div className="mt-2 flex justify-between text-[10px] text-gray-500">
                        <span>Today {progress.today.minutes}/{progress.today.goal_minutes} min</span>
                        <span>{progress.quests.filter((q) => q.cadence === 'daily' && q.completed).length}/{progress.quests.filter((q) => q.cadence === 'daily').length} quests</span>
                    </div>
                </>
            ) : (
                <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-[11px] text-gray-300">
                        <Target size={13} className="text-[var(--vylos-green)]" /> My progress
                    </span>
                    <span className="text-[10px] text-gray-500">{user ? 'Loading…' : 'Sign in to track XP and mastery'}</span>
                </div>
            )}
        </button>
    );
}

function QuestList({ quests }: { quests: QuestProgress[] }) {
    return (
        <ul className="space-y-2">
            {quests.map((quest) => (
                <li key={quest.id} className="flex items-center gap-2 text-[11px]">
                    {quest.completed
                        ? <CheckCircle2 size={13} className="text-[var(--vylos-green)] shrink-0" />
                        : <Circle size={13} className="text-gray-600 shrink-0" />}
                    <span className={cn('flex-1', quest.completed ? 'text-gray-500 line-through' : 'text-gray-300')}>{quest.title}</span>
                    <span className="text-[10px] font-mono text-gray-500">{quest.progress}/{quest.target}</span>
                    <span className="text-[10px] font-mono text-[var(--vylos-green-accent)] w-14 text-right">+{quest.xp} XP</span>
                </li>
            ))}
        </ul>
    );
}

function ProfileSettings({ userId, profile }: { userId: string; profile: MyProfile }) {
    const [handle, setHandle] = useState(profile.handle ?? '');
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const save = async (patch: Partial<MyProfile>) => {
        setSaving(true);
        setError(await api.updateProfile(userId, patch));
        setSaving(false);
        await refreshProgress();
    };

    return (
        <Card>
            <CardTitle icon={<Eye size={10} />}>Public profile · private by default</CardTitle>
            <div className="flex gap-2">
                <input
                    value={handle}
                    onChange={(e) => setHandle(e.target.value.toLowerCase())}
                    placeholder="choose_a_handle"
                    maxLength={24}
                    className="flex-1 min-w-0 px-2.5 py-1.5 bg-black border border-[#27272a] focus:border-[var(--vylos-green)] rounded-lg text-[11px] text-white font-mono outline-none"
                />
                <button
                    onClick={() => void save({ handle: handle.trim() || null })}
                    disabled={saving || handle === (profile.handle ?? '')}
                    className="px-3 rounded-lg border border-[#27272a] text-[10px] font-bold text-gray-300 hover:text-white disabled:opacity-40"
                >
                    Save
                </button>
            </div>
            {error && <p className="mt-2 text-[10px] text-red-300">{error}</p>}
            <label className="mt-3 flex items-center gap-2 text-[11px] text-gray-300">
                <input
                    type="checkbox"
                    checked={profile.is_public}
                    disabled={saving || !profile.handle}
                    onChange={(e) => void save({ is_public: e.target.checked })}
                />
                Show my profile, verified skills and certificates on the web
            </label>
            <label className="mt-2 flex items-center gap-2 text-[11px] text-gray-300">
                <input
                    type="checkbox"
                    checked={profile.show_on_leaderboards}
                    disabled={saving || !profile.handle}
                    onChange={(e) => void save({ show_on_leaderboards: e.target.checked })}
                />
                Include me on leaderboards
            </label>
            {!profile.handle && <p className="mt-2 text-[10px] text-gray-600">Pick a handle first.</p>}
            {profile.is_public && profile.handle && (
                <a
                    href={profileUrl(profile.handle)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-[10px] text-[var(--vylos-green)] hover:underline"
                >
                    View my public profile <ExternalLink size={10} />
                </a>
            )}
        </Card>
    );
}

/** The learner's home: streak, level, daily goal, quests, skills and what to do next. */
export default function ProgressView({ onBack, onOpenCourse }: { onBack: () => void; onOpenCourse: (id: string) => void }) {
    const user = useAuthStore((s) => s.user);
    const signIn = useAuthStore((s) => s.signInViaBrowser);
    // Numbers cached for another account aren't shown
    const mine = useProgressStore((s) => !!user && s.progressFor === user.id);
    const progress = useProgressStore((s) => s.progress);
    const profile = useProgressStore((s) => s.profile);
    const combo = useProgressStore((s) => s.combo);
    const { completedLessons, activeCourseId } = useCourseStore();
    useCourseGroups(); // re-render as extension courses load
    const [recommended, setRecommended] = useState<{ path_id: string; title: string; readiness: number }[]>([]);
    const [goalSaving, setGoalSaving] = useState(false);

    useEffect(() => {
        if (!user) return;
        void refreshProgress();
        api.recommendPaths().then(setRecommended).catch(() => setRecommended([]));
    }, [user]);

    // Continue: the open course, else the course most recently worked on (most lessons done but unfinished)
    const inProgress = Object.entries(completedLessons)
        .filter(([id]) => id !== PRACTICE_COURSE_ID)
        .map(([id, done]) => ({ course: getCourse(id), done }))
        .filter((entry): entry is { course: NonNullable<typeof entry.course>; done: string[] } => !!entry.course)
        .map(({ course, done }) => ({ course, progress: courseProgress(course, done) }))
        .filter(({ progress: p }) => p.percent < 100 && p.done > 0)
        .sort((a, b) => (b.course.id === activeCourseId ? 1 : 0) - (a.course.id === activeCourseId ? 1 : 0) || b.progress.done - a.progress.done);
    const continueWith = inProgress[0];
    const days = weekDays();

    const setGoal = async (minutes: (typeof GOALS)[number]) => {
        if (!user) return;
        setGoalSaving(true);
        await api.updateProfile(user.id, { daily_goal_minutes: minutes });
        await refreshProgress();
        setGoalSaving(false);
    };

    return (
        <div className="h-full flex flex-col bg-[var(--vylos-black)]">
            <div className="p-5 pb-4 border-b border-[var(--vylos-grey-border)] bg-gradient-to-br from-[#09090b] to-black">
                <BackButton onClick={onBack}>Catalog</BackButton>
                <h1 className="mt-3 text-base font-black text-white">
                    {greeting()}{user ? `, ${user.name.split(' ')[0]}` : ''}
                </h1>
                {mine && progress && (
                    <p className="mt-1 flex items-center gap-1.5 text-[11px] text-gray-400">
                        <Flame size={12} className="text-orange-400" />
                        {progress.streak > 0 ? `${progress.streak} day streak` : 'Reach today\'s goal to start a streak'}
                    </p>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {!user && (
                    <Card>
                        <p className="text-[11px] text-gray-300 leading-relaxed">
                            Sign in to earn XP, track what you&apos;ve mastered and work toward certificates. Your lesson
                            progress on this computer comes with you.
                        </p>
                        <button
                            onClick={() => void signIn('signin')}
                            className="mt-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--vylos-green)] hover:text-[var(--vylos-green-accent)]"
                        >
                            <LogIn size={11} /> Sign in
                        </button>
                    </Card>
                )}

                {user && !(mine && progress) && (
                    <p className="flex items-center gap-2 text-[11px] text-gray-500 p-2">
                        <Loader2 size={12} className="animate-spin" /> Loading your progress…
                    </p>
                )}

                {mine && progress && (
                    <>
                        <Card>
                            <div className="flex items-baseline justify-between">
                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--vylos-green)]">Level {progress.level.level}</p>
                                <p className="flex items-center gap-1 text-[10px] text-gray-500" title="Vylos Coins: for cosmetics only">
                                    <Coins size={10} className="text-yellow-400" /> {progress.coins}
                                </p>
                            </div>
                            <p className="text-lg font-black text-white leading-tight">{progress.level.title}</p>
                            <Bar value={levelFraction(progress.level)} className="mt-3 h-2" label="Progress to the next level" />
                            <p className="mt-1.5 text-[10px] font-mono text-gray-500">
                                {progress.level.xp.toLocaleString()}
                                {progress.level.next_level_xp != null && ` / ${progress.level.next_level_xp.toLocaleString()}`} XP
                            </p>
                            {Object.keys(progress.subjects).length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                    {Object.entries(progress.subjects).map(([subject, level]) => (
                                        <span key={subject} className="px-2 py-0.5 rounded-full border border-[#27272a] text-[9px] text-gray-400">
                                            {subject === 'ai' ? 'AI' : subject[0].toUpperCase() + subject.slice(1)} · L{level.level} {level.title}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </Card>

                        <Card>
                            <CardTitle icon={<Flame size={10} />} right={<span className="text-[9px] text-gray-500">{progress.weekly_streak} week streak</span>}>
                                This week
                            </CardTitle>
                            <div className="grid grid-cols-7 gap-1 text-center">
                                {days.map((day, i) => {
                                    const met = progress.week.some((d) => d.day === day && d.goal_met);
                                    return (
                                        <div
                                            key={day}
                                            className={cn(
                                                'rounded-md py-1.5 border text-[9px]',
                                                met ? 'border-[var(--vylos-green-dark)]/50 bg-[var(--vylos-green-dark)]/15 text-[var(--vylos-green)]' : 'border-[#27272a] text-gray-600'
                                            )}
                                        >
                                            {WEEKDAYS[i]}
                                            <div className="mt-0.5">{met ? '✓' : '·'}</div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="mt-4">
                                <div className="flex justify-between text-[10px] mb-1">
                                    <span className="text-gray-400">Today</span>
                                    <span className="font-mono text-gray-500">{progress.today.minutes} / {progress.today.goal_minutes} min</span>
                                </div>
                                <Bar value={progress.today.minutes / Math.max(1, progress.today.goal_minutes)} label="Today's goal" />
                            </div>
                            <div className="mt-3 flex items-center gap-1.5">
                                <span className="text-[10px] text-gray-500 mr-1">Daily goal</span>
                                {GOALS.map((minutes) => (
                                    <button
                                        key={minutes}
                                        onClick={() => void setGoal(minutes)}
                                        disabled={goalSaving}
                                        className={cn(
                                            'px-2 py-0.5 rounded-full border text-[10px] transition-colors',
                                            profile?.daily_goal_minutes === minutes
                                                ? 'border-[var(--vylos-green)] text-[var(--vylos-green)]'
                                                : 'border-[#27272a] text-gray-500 hover:text-gray-200'
                                        )}
                                    >
                                        {minutes}m
                                    </button>
                                ))}
                            </div>
                            <p className="mt-2 text-[9px] text-gray-600 leading-relaxed">
                                Only active time counts, and time past your goal earns nothing extra: showing up most days beats marathons.
                            </p>
                        </Card>
                    </>
                )}

                {continueWith && (
                    <Card>
                        <CardTitle icon={<ArrowRight size={10} />}>Continue learning</CardTitle>
                        <p className="text-[12px] font-bold text-white">{continueWith.course.title}</p>
                        <Bar value={continueWith.progress.percent / 100} tone="sky" className="mt-2" label="Course progress" />
                        <div className="mt-2 flex items-center justify-between">
                            <span className="text-[10px] text-gray-500">{continueWith.progress.done}/{continueWith.progress.total} lessons</span>
                            <button
                                onClick={() => onOpenCourse(continueWith.course.id)}
                                className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[var(--vylos-green)] hover:text-[var(--vylos-green-accent)]"
                            >
                                Continue <ArrowRight size={11} />
                            </button>
                        </div>
                    </Card>
                )}

                {mine && progress && (
                    <>
                        <Card>
                            <CardTitle icon={<Target size={10} />}>Today&apos;s quests</CardTitle>
                            <QuestList quests={progress.quests.filter((q) => q.cadence === 'daily')} />
                        </Card>
                        <Card>
                            <CardTitle icon={<Trophy size={10} />}>Weekly quests</CardTitle>
                            <QuestList quests={progress.quests.filter((q) => q.cadence === 'weekly')} />
                        </Card>

                        {combo > 0 && (
                            <Card className="flex items-center gap-2">
                                <Zap size={14} className="text-yellow-300" />
                                <p className="text-[11px] text-gray-300">
                                    {combo} clean {combo === 1 ? 'solve' : 'solves'} in a row
                                    {comboMultiplier(combo) > 1 && <span className="text-yellow-300 font-bold"> · Learning combo ×{comboMultiplier(combo)}</span>}
                                </p>
                            </Card>
                        )}

                        <Card>
                            <CardTitle icon={<Sparkles size={10} />}>Skills · demonstrated mastery</CardTitle>
                            {progress.skills.length === 0 ? (
                                <p className="text-[11px] text-gray-500">Solve exercises, practice and explain concepts to build mastery.</p>
                            ) : (
                                <ul className="space-y-2.5">
                                    {progress.skills.slice(0, 8).map((skill) => (
                                        <li key={skill.skill_id}>
                                            <div className="flex justify-between text-[10.5px] mb-1">
                                                <span className="text-gray-300 truncate">
                                                    <span className="text-gray-600">{getCourse(skill.skill_id.split('/')[0])?.title ?? ''} · </span>{skill.name}
                                                </span>
                                                <span className="font-mono text-gray-500 ml-2">{pct(Number(skill.mastery))}</span>
                                            </div>
                                            <Bar value={Number(skill.mastery)} label={`${skill.name} mastery`} />
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Card>

                        <Card>
                            <CardTitle icon={<Award size={10} />}>Achievements</CardTitle>
                            {progress.achievements.length === 0 ? (
                                <p className="text-[11px] text-gray-500">None yet. They mark real milestones: your first project, a week of consistency, 90% mastery.</p>
                            ) : (
                                <div className="flex flex-wrap gap-1.5">
                                    {progress.achievements.map((a) => (
                                        <span key={a.id} className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[var(--vylos-green-dark)]/40 bg-[var(--vylos-green-dark)]/10 text-[10px] text-gray-200">
                                            <Trophy size={10} className="text-[var(--vylos-green)]" /> {a.name}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </Card>
                    </>
                )}

                {recommended.length > 0 && (
                    <Card>
                        <CardTitle icon={<Compass size={10} />}>Recommended next</CardTitle>
                        <p className="mb-2 text-[9.5px] text-gray-600">Based on the skills you&apos;ve demonstrated and what each course builds on.</p>
                        <ul className="space-y-1">
                            {recommended.map((rec) => (
                                <li key={rec.path_id}>
                                    <button
                                        onClick={() => onOpenCourse(rec.path_id)}
                                        className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-[#18181b] text-left text-[11px] text-gray-300"
                                    >
                                        {rec.title}
                                        <span className="text-[9px] text-gray-500">{rec.readiness >= 1 ? 'Ready' : `${pct(rec.readiness)} ready`}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </Card>
                )}

                {user && mine && profile && <ProfileSettings userId={user.id} profile={profile} />}
            </div>
        </div>
    );
}
