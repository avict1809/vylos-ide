'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Personal tutoring: learning something on your own terms, with the same tutor
 * that teaches the courses. A course hands the tutor a fixed curriculum; a
 * personal topic hands it only the learner's goal, where they are starting
 * from, and what has been covered so far — the tutor decides the next step
 * each session and writes back what stuck.
 *
 * A learner can keep several topics; one is active at a time and that is the
 * one the tutor teaches (a course lesson, when one is open, still wins).
 */

export type PersonalLevel = 'new' | 'some' | 'confident';

export const PERSONAL_LEVELS: { id: PersonalLevel; label: string; hint: string }[] = [
    { id: 'new', label: 'Brand new', hint: 'Never touched it' },
    { id: 'some', label: 'Some basics', hint: 'Know a bit, gaps everywhere' },
    { id: 'confident', label: 'Confident', hint: 'Want the deeper parts' },
];

export const LEVEL_DESCRIPTIONS: Record<PersonalLevel, string> = {
    new: 'a complete beginner at this — start from the very basics and assume nothing',
    some: 'knows some basics but has gaps — check what they know before building on it',
    confident: 'already comfortable with the basics — go deeper and move faster, but still verify',
};

/** Notes kept per topic; the oldest are dropped so the prompt stays small. */
const MAX_NOTES = 40;
export const MAX_TOPIC_CHARS = 120;
export const MAX_GOAL_CHARS = 280;

export interface PersonalPlan {
    id: string;
    /** What they want to learn, in their words */
    topic: string;
    level: PersonalLevel;
    /** Why they want it. Optional. */
    goal: string;
    createdAt: number;
    lastSeenAt: number;
    /** What the tutor taught and the learner actually understood, oldest first */
    covered: string[];
    /** What they still find hard */
    struggling: string[];
}

export interface ProgressNote {
    covered?: string;
    struggling?: string;
    /** Something from `struggling` they have now got — moves it to `covered` */
    resolved?: string;
}

interface PersonalTutorState {
    plans: PersonalPlan[];
    /** The topic the tutor teaches when no course lesson is open */
    activeId: string | null;

    createPlan: (input: { topic: string; level: PersonalLevel; goal?: string }) => PersonalPlan;
    setActivePlan: (id: string | null) => void;
    updatePlan: (id: string, patch: Partial<Pick<PersonalPlan, 'topic' | 'level' | 'goal'>>) => void;
    deletePlan: (id: string) => void;
    /** Marks a topic as taught just now (called when a session starts). */
    touchPlan: (id: string) => void;
    /** What the tutor learned about the learner this session. */
    recordProgress: (id: string, note: ProgressNote) => void;
    /** Forgets what was covered without deleting the topic. */
    resetProgress: (id: string) => void;
}

const newId = () =>
    globalThis.crypto?.randomUUID?.() ?? `personal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const clean = (text: string, max: number) => text.trim().replace(/\s+/g, ' ').slice(0, max);

/** Appends a note unless it is blank or already there (ignoring case). */
function addNote(notes: string[], note: string): string[] {
    const trimmed = clean(note, 200);
    if (!trimmed) return notes;
    const lower = trimmed.toLowerCase();
    if (notes.some((n) => n.toLowerCase() === lower)) return notes;
    return [...notes, trimmed].slice(-MAX_NOTES);
}

const without = (notes: string[], note: string) => {
    const lower = clean(note, 200).toLowerCase();
    return notes.filter((n) => n.toLowerCase() !== lower);
};

export const usePersonalTutorStore = create<PersonalTutorState>()(
    persist(
        (set) => ({
            plans: [],
            activeId: null,

            createPlan: ({ topic, level, goal }) => {
                const now = Date.now();
                const plan: PersonalPlan = {
                    id: newId(),
                    topic: clean(topic, MAX_TOPIC_CHARS),
                    level,
                    goal: clean(goal ?? '', MAX_GOAL_CHARS),
                    createdAt: now,
                    lastSeenAt: now,
                    covered: [],
                    struggling: [],
                };
                set((s) => ({ plans: [...s.plans, plan], activeId: plan.id }));
                return plan;
            },

            setActivePlan: (activeId) => set({ activeId }),

            updatePlan: (id, patch) =>
                set((s) => ({
                    plans: s.plans.map((p) =>
                        p.id !== id
                            ? p
                            : {
                                ...p,
                                ...patch,
                                ...(patch.topic !== undefined ? { topic: clean(patch.topic, MAX_TOPIC_CHARS) } : {}),
                                ...(patch.goal !== undefined ? { goal: clean(patch.goal, MAX_GOAL_CHARS) } : {}),
                            }
                    ),
                })),

            deletePlan: (id) =>
                set((s) => ({
                    plans: s.plans.filter((p) => p.id !== id),
                    activeId: s.activeId === id ? null : s.activeId,
                })),

            touchPlan: (id) =>
                set((s) => ({ plans: s.plans.map((p) => (p.id === id ? { ...p, lastSeenAt: Date.now() } : p)) })),

            recordProgress: (id, note) =>
                set((s) => ({
                    plans: s.plans.map((p) => {
                        if (p.id !== id) return p;
                        let covered = p.covered;
                        let struggling = p.struggling;
                        if (note.covered) {
                            covered = addNote(covered, note.covered);
                            // Something taught successfully is no longer a gap
                            struggling = without(struggling, note.covered);
                        }
                        if (note.resolved) {
                            struggling = without(struggling, note.resolved);
                            covered = addNote(covered, note.resolved);
                        }
                        if (note.struggling) struggling = addNote(struggling, note.struggling);
                        return { ...p, covered, struggling, lastSeenAt: Date.now() };
                    }),
                })),

            resetProgress: (id) =>
                set((s) => ({
                    plans: s.plans.map((p) => (p.id === id ? { ...p, covered: [], struggling: [] } : p)),
                })),
        }),
        { name: 'vylos-personal-tutor' }
    )
);

/** The topic being tutored right now, if any. */
export function activePersonalPlan(): PersonalPlan | null {
    const { plans, activeId } = usePersonalTutorStore.getState();
    return plans.find((p) => p.id === activeId) ?? null;
}

/** React binding for {@link activePersonalPlan}. */
export function useActivePersonalPlan(): PersonalPlan | null {
    return usePersonalTutorStore((s) => s.plans.find((p) => p.id === s.activeId) ?? null);
}
