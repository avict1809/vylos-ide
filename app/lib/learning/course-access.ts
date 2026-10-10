'use client';

import { useAuthStore } from '../stores/auth-store';
import { useProgressStore } from '../stores/progress-store';
import { refreshProgress } from './progress-sync';
import { api, reasonOf } from './progress-api';
import { unlockCost } from './progress-ids';
import { PRACTICE_COURSE_ID } from './practice';
import type { Course } from './types';

/**
 * Whether a course needs unlocking with Vylos Coins. Beginner courses are
 * free; the price rule is shared with the server's catalog (unlockCost). The
 * server is the authority: a locked course earns no XP, mastery or
 * certificate there, whatever the app shows.
 */
export interface CourseLock {
    locked: boolean;
    cost: number;
}

export function courseLock(course: Course, userId: string | null): CourseLock {
    if (course.extension || course.id === PRACTICE_COURSE_ID) return { locked: false, cost: 0 };
    const state = useProgressStore.getState();
    const row = state.progressFor === userId ? state.access?.[course.id] : undefined;
    const cost = row?.unlock_cost ?? unlockCost(course);
    return { locked: cost > 0 && !row?.unlocked, cost };
}

/** courseLock that re-renders when the account or its unlocks change. */
export function useCourseLock(course: Course | undefined): CourseLock {
    const userId = useAuthStore((s) => s.user?.id ?? null);
    useProgressStore((s) => s.access);
    useProgressStore((s) => s.progressFor);
    return course ? courseLock(course, userId) : { locked: false, cost: 0 };
}

/** Spends coins on a course. Returns an error message, or null once it's unlocked. */
export async function unlockCourse(course: Course): Promise<string | null> {
    try {
        const result = await api.unlockCourse(course.id);
        if (!result.ok) {
            return result.error === 'not_enough_coins'
                ? `You need ${result.cost} coins and have ${result.balance}. Keep learning to earn more.`
                : 'That course could not be unlocked.';
        }
        await refreshProgress();
        return null;
    } catch (error) {
        return reasonOf(error);
    }
}
