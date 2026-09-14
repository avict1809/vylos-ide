export interface Lesson {
    /** Unique within its course. Progress is stored by this id, never by position. */
    id: string;
    title: string;
}

export interface CourseModule {
    title: string;
    description: string;
    lessons: Lesson[];
}

export type CourseCategory = 'language' | 'framework' | 'ai' | 'security' | 'essentials';

export interface Course {
    id: string;
    title: string;
    tagline: string;
    level: string;
    hours: number;
    accent: string;
    badge: string;
    /** Controls catalog grouping; defaults to 'language' */
    category?: CourseCategory;
    /** The base language/stack shown as a tag, e.g. 'JavaScript' */
    stack?: string;
    /**
     * Course-specific rules for the AI tutor: tooling to verify before use,
     * facts it must not guess, safety and ethics boundaries.
     */
    tutorGuidelines?: string[];
    /** Set for courses from an installed extension; built-in courses have none. */
    extension?: { id: string; displayName: string; publisher: string };
    modules: CourseModule[];
}

/**
 * A lesson as written in a curriculum. A bare title gets the title's slug as
 * its id, so lessons can be added, removed or reordered without touching
 * anyone's progress. To reword a title and keep its progress, write
 * `{ id: '<the old slug>', title: 'New title' }`.
 */
export type LessonDefinition = string | { id: string; title: string };

export interface CourseModuleDefinition extends Omit<CourseModule, 'lessons'> {
    lessons: LessonDefinition[];
}

/** A course as written in a curriculum file; the course registry turns it into a Course. */
export interface CourseDefinition extends Omit<Course, 'modules'> {
    modules: CourseModuleDefinition[];
}

/** 'Installing Python 3 on your machine' → 'installing-python-3-on-your-machine' */
export const lessonSlug = (title: string) =>
    title
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '') // accents: 'é' → 'e'
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

export const moduleLessonIds = (course: Course, moduleIndex: number) =>
    course.modules[moduleIndex].lessons.map((lesson) => lesson.id);

export const totalLessons = (course: Course) =>
    course.modules.reduce((sum, m) => sum + m.lessons.length, 0);

export interface CourseProgress {
    done: number;
    total: number;
    percent: number;
}

const progressOf = (lessons: Lesson[], completed: string[] | undefined): CourseProgress => {
    const set = new Set(completed ?? []);
    const total = lessons.length;
    const done = lessons.filter((lesson) => set.has(lesson.id)).length;
    return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
};

export const courseProgress = (course: Course, completed: string[] | undefined): CourseProgress =>
    progressOf(course.modules.flatMap((m) => m.lessons), completed);

export const moduleProgress = (
    course: Course,
    moduleIndex: number,
    completed: string[] | undefined
): CourseProgress => progressOf(course.modules[moduleIndex].lessons, completed);
