import { useSyncExternalStore } from 'react';
import type { Disposable } from '../disposable';
import { Course, CourseCategory, CourseDefinition, lessonSlug } from './types';
import { BUILTIN_COURSES } from './curricula';
import { validateExercise } from '../exercises/format';

/**
 * Every course the catalog can show. The built-in curricula register here at
 * startup; course packs and extensions will register the same way, so nothing
 * else in the app should import curricula directly.
 */

export interface CourseGroup {
    category: CourseCategory;
    label: string;
    courses: Course[];
}

/** Catalog sections, in display order. */
const CATEGORY_LABELS: Record<CourseCategory, string> = {
    language: 'Languages',
    framework: 'Frameworks & Platforms',
    ai: 'AI & Data Science',
    vibe: 'Vibe Coding',
    security: 'Cybersecurity',
    essentials: 'CS Essentials',
};

const courses = new Map<string, Course>();
const listeners = new Set<() => void>();
let groups: CourseGroup[] = [];

/** Resolves lesson ids and checks the course can be tracked. Throws on a malformed course. */
function toCourse(def: CourseDefinition): Course {
    if (!def.id) throw new Error(`Course "${def.title}" has no id`);
    const seen = new Set<string>();
    const modules = def.modules.map((mod) => ({
        ...mod,
        lessons: mod.lessons.map((lesson) => {
            const { title, exercise: rawExercise } = typeof lesson === 'string' ? { title: lesson, exercise: undefined } : lesson;
            const id = (typeof lesson === 'string' ? undefined : lesson.id) ?? lessonSlug(title);
            if (!id) throw new Error(`Course "${def.id}": lesson "${title}" has an empty id`);
            if (seen.has(id)) throw new Error(`Course "${def.id}": two lessons share the id "${id}"; give one an explicit id`);
            seen.add(id);
            if (!rawExercise) return { id, title };
            const { exercise, errors } = validateExercise(rawExercise, `Course "${def.id}", lesson "${id}": exercise`);
            if (!exercise) throw new Error(errors.join('\n'));
            return { id, title, exercise };
        }),
    }));
    return { ...def, modules };
}

function changed() {
    groups = (Object.keys(CATEGORY_LABELS) as CourseCategory[])
        .map((category) => ({
            category,
            label: CATEGORY_LABELS[category],
            courses: [...courses.values()].filter((c) => !c.hidden && (c.category ?? 'language') === category),
        }))
        .filter((group) => group.courses.length > 0);
    listeners.forEach((listener) => listener());
}

/**
 * Adds a course to the catalog. A course with the same id replaces the
 * existing one (this also keeps hot reload working in development).
 */
export function registerCourse(def: CourseDefinition): Disposable {
    const course = toCourse(def);
    if (courses.has(course.id) && process.env.NODE_ENV !== 'development') {
        console.warn(`Course "${course.id}" was registered twice; the later one wins`);
    }
    courses.set(course.id, course);
    changed();
    return {
        dispose: () => {
            if (courses.get(course.id) !== course) return;
            courses.delete(course.id);
            changed();
        },
    };
}

export const getCourse = (id: string): Course | undefined => courses.get(id);

export const getCourseGroups = (): CourseGroup[] => groups;

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

/** Catalog sections that re-render when courses are added or removed. */
export const useCourseGroups = () => useSyncExternalStore(subscribe, getCourseGroups, getCourseGroups);

/** One course that re-renders when it is registered, replaced or removed (extensions load after startup). */
export function useCourse(id: string | null | undefined): Course | undefined {
    const get = () => (id ? courses.get(id) : undefined);
    return useSyncExternalStore(subscribe, get, get);
}

BUILTIN_COURSES.forEach(registerCourse);
