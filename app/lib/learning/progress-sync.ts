'use client';

import { useAuthStore } from '../stores/auth-store';
import { useCourseStore } from '../stores/course-store';
import { exerciseKey, useExerciseStore, type ExerciseProgress } from '../stores/exercise-store';
import { useVoiceStore } from '../stores/voice-store';
import { ACHIEVEMENT_NAMES, useProgressStore, type OutboxEvent } from '../stores/progress-store';
import type { CheckResult } from '../exercises/checkers';
import { getCourse } from './course-registry';
import type { LessonRef } from './lesson-utils';
import { api, isTransient, type Award } from './progress-api';
import { challengeDbId, lessonDbId } from './progress-ids';
import { PRACTICE_COURSE_ID, practiceItem } from './practice';

/**
 * Reports learning to the server as it happens: lessons completed (with the
 * time actually spent on them), exercise checks, active minutes toward the
 * daily goal, and the first program run. Events wait in an outbox while
 * offline or signed out and go out in order once the learner is back.
 *
 * "Active" means the window has focus and the learner has typed, clicked or
 * scrolled in the last two minutes; an app left open earns nothing.
 */

const TICK_SECONDS = 15;
const IDLE_AFTER_MS = 2 * 60 * 1000;
const FLUSH_EVERY_MS = 30 * 1000;
// A failed check sent long after the fact would read as rapid guessing
const STALE_FAILURE_MS = 10 * 60 * 1000;

let started = false;
let lastInput = Date.now();
let activeSeconds = 0;
let flushing = false;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

const userId = () => useAuthStore.getState().user?.id ?? null;

const lessonKey = (ref: LessonRef) => `${ref.courseId}/${ref.lessonId}`;

/** Whether the server's catalog has this course (extension courses aren't there). */
function isTracked(courseId: string): boolean {
    if (courseId === PRACTICE_COURSE_ID) return true;
    const tracked = useProgressStore.getState().trackedPaths;
    // Unknown until the first sign-in; built-in course ids have no dot
    return tracked ? tracked.includes(courseId) : !courseId.includes('.');
}

/** The lessons being worked on right now: open in the panel, as an exercise, or with a tutor. */
function currentLessons(): string[] {
    const refs = [
        useCourseStore.getState().openLesson,
        useExerciseStore.getState().active,
        useVoiceStore.getState().lessonContext,
    ].filter((ref): ref is LessonRef => !!ref);
    return [...new Set(refs.map(lessonKey))];
}

function tick() {
    if (!document.hasFocus() || Date.now() - lastInput > IDLE_AFTER_MS) return;
    const progress = useProgressStore.getState();
    progress.addLessonSeconds(currentLessons(), TICK_SECONDS);
    activeSeconds += TICK_SECONDS;
    const id = userId();
    if (activeSeconds >= 60 && id) {
        const minutes = Math.floor(activeSeconds / 60);
        activeSeconds -= minutes * 60;
        progress.enqueue({ type: 'minutes', minutes, at: Date.now(), userId: id });
    }
}

/** Queues newly completed lessons with the time spent on them. */
function onLessonsChanged(next: Record<string, string[]>, prev: Record<string, string[]>) {
    const id = userId();
    if (!id) return;
    for (const [courseId, lessons] of Object.entries(next)) {
        if (courseId === PRACTICE_COURSE_ID || !isTracked(courseId)) continue;
        const before = new Set(prev[courseId] ?? []);
        for (const lessonId of lessons) {
            if (before.has(lessonId)) continue;
            const seconds = useProgressStore.getState().takeLessonSeconds(`${courseId}/${lessonId}`);
            useProgressStore.getState().enqueue({ type: 'lesson', courseId, lessonId, seconds, at: Date.now(), userId: id });
        }
    }
    void flush();
}

/**
 * Called after every exercise check, with the exercise's progress from before
 * it. Also keeps the learning combo: clean first passes in a row, reset by
 * hints or trial and error.
 */
export function reportExerciseCheck(ref: LessonRef, result: CheckResult, before: ExerciseProgress) {
    // A missing tool or file isn't an attempt, and experiments after passing aren't evidence
    if (result.setupProblem || before.passed) return;
    const store = useProgressStore.getState();

    const clean = result.passed && before.hintsShown === 0 && before.failures <= 1;
    const guessing = !result.passed && before.failures + 1 >= 3;
    if (result.passed) store.setCombo(clean ? store.combo + 1 : 0);
    else if (guessing) store.setCombo(0);

    const id = userId();
    if (!id || !isTracked(ref.courseId)) return;
    const practice = ref.courseId === PRACTICE_COURSE_ID ? practiceItem(ref.lessonId) : null;
    // Practice made while offline never got a server id, so there's nothing to report it against
    if (ref.courseId === PRACTICE_COURSE_ID && (!practice || practice.id.startsWith('local-'))) return;
    const course = getCourse(ref.courseId);
    const moduleTitle = practice?.moduleTitle
        ?? course?.modules.find((mod) => mod.lessons.some((lesson) => lesson.id === ref.lessonId))?.title
        ?? '';

    store.enqueue({
        type: 'challenge',
        challengeId: practice ? practice.id : challengeDbId(ref.courseId, ref.lessonId),
        passed: result.passed,
        hints: before.hintsShown,
        seconds: store.peekLessonSeconds(lessonKey(ref)),
        exerciseKey: exerciseKey(ref),
        skillName: moduleTitle,
        at: Date.now(),
        userId: id,
    });
    void flush();
}

/** The Run button: the first run earns Code Runner. */
export function reportProgramRun() {
    const id = userId();
    const store = useProgressStore.getState();
    if (!id || store.ranProgramFor.includes(id)) return;
    store.markRanProgram(id);
    store.enqueue({ type: 'program_run', at: Date.now(), userId: id });
    void flush();
}

function celebrate(award: Award | null | undefined) {
    if (!award) return;
    const store = useProgressStore.getState();
    if (award.xp) store.notify('xp', `+${award.xp} XP`);
    for (const id of award.achievements ?? []) store.notify('achievement', `Achievement unlocked: ${ACHIEVEMENT_NAMES[id] ?? id}`);
    if (award.flag === 'too_fast') store.notify('flag', 'That was faster than anyone could solve it, so it earned no XP.');
    if (award.flag === 'guessing') store.notify('flag', 'Lots of quick retries: slow down and reason it through. No XP for guesses.');
}

async function send(event: OutboxEvent): Promise<void> {
    const store = useProgressStore.getState();
    switch (event.type) {
        case 'lesson': {
            const award = await api.completeLesson(lessonDbId(event.courseId, event.lessonId), event.seconds);
            celebrate(award);
            return;
        }
        case 'challenge': {
            const award = await api.recordChallengeAttempt(event.challengeId, event.passed, event.hints, event.seconds);
            celebrate(award);
            if (event.passed) {
                store.setExerciseAward(event.exerciseKey, {
                    xp: award.xp ?? 0,
                    skillName: event.skillName,
                    masteryBefore: Number(award.mastery_before ?? 0),
                    masteryAfter: Number(award.mastery_after ?? 0),
                    combo: store.combo,
                    flag: award.flag ?? null,
                });
            }
            return;
        }
        case 'minutes': {
            const result = await api.logLearningTime(event.minutes);
            if (result.xp) store.notify('goal', `Daily goal reached · ${result.streak} day streak · +${result.xp} XP`);
            for (const id of result.achievements ?? []) store.notify('achievement', `Achievement unlocked: ${ACHIEVEMENT_NAMES[id] ?? id}`);
            return;
        }
        case 'program_run': {
            if (await api.recordProgramRun()) store.notify('achievement', `Achievement unlocked: ${ACHIEVEMENT_NAMES.code_runner}`);
            return;
        }
    }
}

/** Sends queued events in order. Stops at the first network failure and tries again later. */
export async function flush(): Promise<void> {
    const id = userId();
    if (flushing || !id || !navigator.onLine) return;
    flushing = true;
    let sent = 0;
    try {
        for (;;) {
            const store = useProgressStore.getState();
            const event = store.outbox[0];
            if (!event) break;
            const stale = event.type === 'challenge' && !event.passed && Date.now() - event.at > STALE_FAILURE_MS;
            // Another account's events wait until that account signs back in
            if (event.userId !== id) {
                if (store.outbox.every((e) => e.userId !== id)) break;
                store.shift(1);
                store.enqueue(event);
                continue;
            }
            if (!stale) {
                try {
                    await send(event);
                    sent++;
                } catch (error) {
                    if (isTransient(error)) break;
                    // Something the server will never accept (e.g. a lesson it doesn't know): drop it
                    console.warn('Progress event dropped:', error);
                }
            }
            useProgressStore.getState().shift(1);
        }
    } finally {
        flushing = false;
    }
    if (sent > 0) scheduleRefresh();
}

function scheduleRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => void refreshProgress(), 800);
}

/** Fetches the dashboard numbers and profile from the server. */
export async function refreshProgress(): Promise<void> {
    const id = userId();
    if (!id) return;
    try {
        const [progress, profile] = await Promise.all([api.myProgress(), api.myProfile(id)]);
        const store = useProgressStore.getState();
        store.setProgress(id, progress);
        store.setProfile(id, profile);
    } catch (error) {
        if (!isTransient(error)) console.warn('Could not load progress:', error);
    }
}

/**
 * On sign-in: learn which courses the server tracks, bring over lessons
 * completed on this device before progress was synced (recorded, but earning
 * nothing), then send whatever is waiting.
 */
async function onSignedIn(id: string) {
    try {
        useProgressStore.getState().setTrackedPaths(await api.trackedPaths());
    } catch (error) {
        if (!isTransient(error)) console.warn('Could not load the course catalog:', error);
        return;
    }
    const store = useProgressStore.getState();
    if (!store.importedFor.includes(id)) {
        const lessonIds = Object.entries(useCourseStore.getState().completedLessons)
            .filter(([courseId]) => courseId !== PRACTICE_COURSE_ID && isTracked(courseId))
            .flatMap(([courseId, lessons]) => lessons.map((lessonId) => lessonDbId(courseId, lessonId)));
        try {
            for (let i = 0; i < lessonIds.length; i += 1000) await api.importLessonProgress(lessonIds.slice(i, i + 1000));
            store.markImported(id);
        } catch (error) {
            if (!isTransient(error)) console.warn('Could not import lesson progress:', error);
        }
    }
    await flush();
    await refreshProgress();
}

/** Starts tracking and syncing; safe to call more than once. */
export function startProgressSync() {
    if (started || typeof window === 'undefined') return;
    started = true;

    const touch = () => { lastInput = Date.now(); };
    for (const type of ['keydown', 'mousedown', 'wheel', 'touchstart'] as const) {
        window.addEventListener(type, touch, { passive: true, capture: true });
    }
    setInterval(tick, TICK_SECONDS * 1000);
    setInterval(() => void flush(), FLUSH_EVERY_MS);
    window.addEventListener('online', () => void flush());

    useCourseStore.subscribe((state, prev) => {
        if (state.completedLessons !== prev.completedLessons) onLessonsChanged(state.completedLessons, prev.completedLessons);
    });

    let signedInAs: string | null = null;
    const onAuth = () => {
        const id = userId();
        if (id === signedInAs) return;
        // A combo belongs to whoever earned it
        if (id && useProgressStore.getState().progressFor !== id) useProgressStore.getState().setCombo(0);
        signedInAs = id;
        if (id) void onSignedIn(id);
    };
    useAuthStore.subscribe(onAuth);
    onAuth();
}
