import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LessonRef } from '../learning/lesson-utils';
import type { CheckResult } from '../exercises/checkers';

/** Everything Vylos remembers about one exercise, stored under `<courseId>/<lessonId>`. */
export interface ExerciseProgress {
    /** Checks run, passed or not */
    attempts: number;
    /** Failed checks, which is what unlocks the solution */
    failures: number;
    passed: boolean;
    hintsShown: number;
    solutionShown: boolean;
    /** Where the learner's files are */
    dir?: string;
    lastResult?: CheckResult;
}

const EMPTY: ExerciseProgress = { attempts: 0, failures: 0, passed: false, hintsShown: 0, solutionShown: false };

export const exerciseKey = (ref: LessonRef) => `${ref.courseId}/${ref.lessonId}`;

interface ExerciseStore {
    progress: Record<string, ExerciseProgress>;
    /** The exercise shown in the learning panel */
    active: LessonRef | null;
    /** Key of the exercise being checked right now */
    checking: string | null;

    get: (ref: LessonRef) => ExerciseProgress;
    setActive: (ref: LessonRef | null) => void;
    setChecking: (key: string | null) => void;
    setDir: (ref: LessonRef, dir: string) => void;
    recordCheck: (ref: LessonRef, result: CheckResult) => void;
    showNextHint: (ref: LessonRef) => void;
    showSolution: (ref: LessonRef) => void;
}

export const useExerciseStore = create<ExerciseStore>()(
    persist(
        (set, get) => {
            const update = (ref: LessonRef, patch: (p: ExerciseProgress) => Partial<ExerciseProgress>) =>
                set((s) => {
                    const key = exerciseKey(ref);
                    const current = s.progress[key] ?? EMPTY;
                    return { progress: { ...s.progress, [key]: { ...current, ...patch(current) } } };
                });

            return {
                progress: {},
                active: null,
                checking: null,

                get: (ref) => get().progress[exerciseKey(ref)] ?? EMPTY,
                setActive: (active) => set({ active }),
                setChecking: (checking) => set({ checking }),
                setDir: (ref, dir) => update(ref, () => ({ dir })),
                recordCheck: (ref, result) =>
                    update(ref, (p) => ({
                        attempts: p.attempts + 1,
                        // A missing tool isn't a wrong answer, so it doesn't count toward the solution
                        failures: p.failures + (!result.passed && !result.setupProblem ? 1 : 0),
                        // Once passed, always passed: later experiments don't take the lesson away
                        passed: p.passed || result.passed,
                        lastResult: result,
                    })),
                showNextHint: (ref) => update(ref, (p) => ({ hintsShown: p.hintsShown + 1 })),
                showSolution: (ref) => update(ref, () => ({ solutionShown: true })),
            };
        },
        {
            name: 'vylos-exercises',
            partialize: (s) => ({ progress: s.progress, active: s.active }),
        }
    )
);
