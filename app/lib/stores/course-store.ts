import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CourseState {
    activeCourseId: string | null;
    completedLessons: Record<string, string[]>;
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
            setActiveCourse: (id) => set({ activeCourseId: id }),
            backToCatalog: () => set({ activeCourseId: null }),
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
        }
    )
);
