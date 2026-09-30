import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getCourse } from '../learning/course-registry';
import type { LessonRef } from '../learning/lesson-utils';

interface CourseState {
    activeCourseId: string | null;
    completedLessons: Record<string, string[]>;
    /** The lesson open in the learning panel (its notes and ways to learn it) */
    openLesson: LessonRef | null;
    setOpenLesson: (ref: LessonRef | null) => void;
    setActiveCourse: (id: string) => void;
    backToCatalog: () => void;
    toggleLesson: (courseId: string, lessonId: string) => void;
    completeLessons: (courseId: string, lessonIds: string[]) => void;
    resetCourse: (courseId: string) => void;
}

export const useCourseStore = create<CourseState>()(
    persist(
        (set) => ({
            activeCourseId: null,
            completedLessons: {},
            openLesson: null,
            setOpenLesson: (openLesson) => set({ openLesson }),
            setActiveCourse: (id) => set((s) => ({ activeCourseId: id, openLesson: s.openLesson?.courseId === id ? s.openLesson : null })),
            backToCatalog: () => set({ activeCourseId: null, openLesson: null }),
            toggleLesson: (courseId, lessonId) =>
                set((state) => {
                    const done = state.completedLessons[courseId] ?? [];
                    const next = done.includes(lessonId)
                        ? done.filter((l) => l !== lessonId)
                        : [...done, lessonId];
                    return { completedLessons: { ...state.completedLessons, [courseId]: next } };
                }),
            completeLessons: (courseId, lessonIds) =>
                set((state) => {
                    const done = new Set(state.completedLessons[courseId] ?? []);
                    lessonIds.forEach((l) => done.add(l));
                    return {
                        completedLessons: { ...state.completedLessons, [courseId]: Array.from(done) },
                    };
                }),
            resetCourse: (courseId) =>
                set((state) => {
                    const next = { ...state.completedLessons };
                    delete next[courseId];
                    return { completedLessons: next };
                }),
        }),
        {
            name: 'vylos-courses',
            version: 1,
            migrate: (persisted, version) => {
                const state = persisted as Pick<CourseState, 'activeCourseId' | 'completedLessons' | 'openLesson'>;
                if (version < 1 && state?.completedLessons) {
                    state.completedLessons = fromPositionalIds(state.completedLessons);
                }
                return state as CourseState;
            },
        }
    )
);

/**
 * Version 0 stored progress by position (`python-2-3` = module 3, lesson 4),
 * which pointed at the wrong lessons as soon as a course changed. Maps those
 * ids to lesson ids using the courses as they are now, which is how they were
 * when that progress was saved.
 */
function fromPositionalIds(completed: Record<string, string[]>): Record<string, string[]> {
    const migrated: Record<string, string[]> = {};
    for (const [courseId, ids] of Object.entries(completed)) {
        const course = getCourse(courseId);
        if (!course) {
            migrated[courseId] = ids;
            continue;
        }
        migrated[courseId] = ids.flatMap((id) => {
            const pos = id.startsWith(`${courseId}-`) ? id.slice(courseId.length + 1).match(/^(\d+)-(\d+)$/) : null;
            if (!pos) return [id];
            const lesson = course.modules[Number(pos[1])]?.lessons[Number(pos[2])];
            return lesson ? [lesson.id] : [];
        });
    }
    return migrated;
}
