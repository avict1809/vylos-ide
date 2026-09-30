import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CourseAccess, MyProfile, MyProgress } from '../learning/progress-api';

/**
 * The learner's side of the learning engine: what to send (an outbox that
 * survives going offline and restarts), how long they've actively spent on
 * each lesson, and the last numbers the server sent back. XP, levels and
 * mastery always come from the server; nothing here decides them.
 */

export type OutboxEvent = { at: number; userId: string } & (
    | { type: 'lesson'; courseId: string; lessonId: string; seconds: number }
    | { type: 'challenge'; challengeId: string; passed: boolean; hints: number; seconds: number; exerciseKey: string; skillName: string }
    | { type: 'minutes'; minutes: number }
    | { type: 'program_run' }
);

/** Something to celebrate, shown briefly as a toast. */
export interface RewardNotice {
    id: number;
    kind: 'xp' | 'achievement' | 'goal' | 'flag';
    text: string;
}

/** What the last check of an exercise earned, shown in the exercise panel. */
export interface ExerciseAward {
    xp: number;
    skillName: string;
    masteryBefore: number;
    masteryAfter: number;
    combo: number;
    /** XP multiplier the combo earned on this solve */
    multiplier: number;
    flag: string | null;
}

// Mirrors public.achievements in the learning engine migration
export const ACHIEVEMENT_NAMES: Record<string, string> = {
    first_steps: 'First Steps',
    code_runner: 'Code Runner',
    debugger: 'Debugger',
    no_hints: 'No Hints',
    consistency: 'Consistency',
    builder: 'Builder',
    mastery: 'Mastery',
    teacher: 'Teacher',
    night_coder: 'Night Coder',
    weekly_champion: 'Weekly Champion',
    api_builder: 'API Builder',
};

/**
 * A learning combo counts exercises solved cleanly in a row: passed without
 * hints and without guessing (at most one failed check first). Hints or
 * trial-and-error reset it, since they mean the understanding isn't there yet.
 * The server keeps the count and applies the XP multiplier; this mirrors it.
 */
export const comboMultiplier = (combo: number) => (combo >= 5 ? 3 : combo >= 3 ? 2 : 1);

interface ProgressStore {
    outbox: OutboxEvent[];
    /** Active seconds per `<courseId>/<lessonId>` since it was last reported */
    lessonSeconds: Record<string, number>;
    /** Accounts whose on-device progress has been imported */
    importedFor: string[];
    /** Accounts that already earned Code Runner */
    ranProgramFor: string[];
    combo: number;
    trackedPaths: string[] | null;
    /** Which paid courses this account has unlocked, by course id */
    access: Record<string, CourseAccess> | null;
    progress: MyProgress | null;
    profile: MyProfile | null;
    /** Whose progress and profile these are */
    progressFor: string | null;
    notices: RewardNotice[];
    exerciseAwards: Record<string, ExerciseAward>;

    enqueue: (event: OutboxEvent) => void;
    /** Drops the first `count` events, once they've been sent */
    shift: (count: number) => void;
    addLessonSeconds: (keys: string[], seconds: number) => void;
    takeLessonSeconds: (key: string) => number;
    peekLessonSeconds: (key: string) => number;
    markImported: (userId: string) => void;
    markRanProgram: (userId: string) => void;
    setCombo: (combo: number) => void;
    setTrackedPaths: (paths: string[]) => void;
    setAccess: (userId: string, rows: CourseAccess[]) => void;
    setProgress: (userId: string, progress: MyProgress) => void;
    setProfile: (userId: string, profile: MyProfile | null) => void;
    notify: (kind: RewardNotice['kind'], text: string) => void;
    dismiss: (id: number) => void;
    setExerciseAward: (key: string, award: ExerciseAward) => void;
}

let noticeId = 0;

export const useProgressStore = create<ProgressStore>()(
    persist(
        (set, get) => ({
            outbox: [],
            lessonSeconds: {},
            importedFor: [],
            ranProgramFor: [],
            combo: 0,
            trackedPaths: null,
            access: null,
            progress: null,
            profile: null,
            progressFor: null,
            notices: [],
            exerciseAwards: {},

            enqueue: (event) =>
                set((s) => {
                    // Active minutes add up in one pending event instead of one per minute
                    const last = s.outbox[s.outbox.length - 1];
                    if (event.type === 'minutes' && last?.type === 'minutes' && last.userId === event.userId) {
                        return { outbox: [...s.outbox.slice(0, -1), { ...last, minutes: last.minutes + event.minutes }] };
                    }
                    // Bounded, so a long time offline can't grow storage forever
                    return { outbox: [...s.outbox, event].slice(-500) };
                }),
            shift: (count) => set((s) => ({ outbox: s.outbox.slice(count) })),
            addLessonSeconds: (keys, seconds) =>
                set((s) => {
                    const next = { ...s.lessonSeconds };
                    for (const key of keys) next[key] = Math.min((next[key] ?? 0) + seconds, 4 * 3600);
                    return { lessonSeconds: next };
                }),
            takeLessonSeconds: (key) => {
                const seconds = get().lessonSeconds[key] ?? 0;
                set((s) => {
                    const next = { ...s.lessonSeconds };
                    delete next[key];
                    return { lessonSeconds: next };
                });
                return seconds;
            },
            peekLessonSeconds: (key) => get().lessonSeconds[key] ?? 0,
            markImported: (userId) => set((s) => ({ importedFor: [...s.importedFor, userId] })),
            markRanProgram: (userId) => set((s) => ({ ranProgramFor: [...s.ranProgramFor, userId] })),
            setCombo: (combo) => set({ combo }),
            setTrackedPaths: (trackedPaths) => set({ trackedPaths }),
            setAccess: (userId, rows) => set({ access: Object.fromEntries(rows.map((row) => [row.path_id, row])), progressFor: userId }),
            setProgress: (userId, progress) => set({ progress, progressFor: userId }),
            setProfile: (userId, profile) => set({ profile, progressFor: userId }),
            notify: (kind, text) => {
                const id = ++noticeId;
                set((s) => ({ notices: [...s.notices, { id, kind, text }].slice(-4) }));
                setTimeout(() => get().dismiss(id), kind === 'achievement' ? 7000 : 4000);
            },
            dismiss: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
            setExerciseAward: (key, award) => set((s) => ({ exerciseAwards: { ...s.exerciseAwards, [key]: award } })),
        }),
        {
            name: 'vylos-progress',
            partialize: (s) => ({
                outbox: s.outbox,
                lessonSeconds: s.lessonSeconds,
                importedFor: s.importedFor,
                ranProgramFor: s.ranProgramFor,
                combo: s.combo,
                trackedPaths: s.trackedPaths,
                access: s.access,
                // Last known numbers, so the dashboard has something to show offline
                progress: s.progress,
                profile: s.profile,
                progressFor: s.progressFor,
            }),
        }
    )
);
