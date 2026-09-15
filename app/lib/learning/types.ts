export interface Lesson {
    /** Unique within its course. Progress is stored by this id, never by position. */
    id: string;
    title: string;
    /** Hands-on practice graded by a built-in checker; passing it completes the lesson. */
    exercise?: Exercise;
}

/**
 * Checks the program's output. Each case runs the main file with `input` as
 * what the learner would type, and compares what it prints with `expected`.
 */
export interface OutputCheck {
    type: 'output';
    cases: {
        name?: string;
        /** Typed into the program (input(), Scanner, cin); lines separated by \n */
        input?: string;
        expected: string;
        /** exact (default): the whole output, ignoring trailing spaces; contains; regex */
        match?: 'exact' | 'contains' | 'regex';
    }[];
}

/** Calls a function in the main file (Python or JavaScript) and compares what it returns. */
export interface FunctionCheck {
    type: 'function';
    function: string;
    cases: { name?: string; args: unknown[]; expected: unknown }[];
}

export type ExerciseCheck = OutputCheck | FunctionCheck;

export interface Exercise {
    /** What to build, in a few sentences. `code` in backticks is shown as code. */
    prompt: string;
    /** Starter files by name. The first is the main file: it opens in the editor and it's what gets checked. */
    files: Record<string, string>;
    check: ExerciseCheck;
    /** From a gentle nudge to nearly the answer, one revealed at a time */
    hints?: string[];
    /** The main file, solved. Shown only after `solutionAfter` failed checks and an explicit request. */
    solution?: string;
    /** Failed checks before the solution can be shown. Default 3. */
    solutionAfter?: number;
}

export interface CourseModule {
    title: string;
    description: string;
    lessons: Lesson[];
}

export type CourseCategory = 'language' | 'framework' | 'ai' | 'vibe' | 'security' | 'essentials';

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
    /**
     * Tools the learner needs installed (ids from app/lib/setup/tools.ts, e.g.
     * 'python', 'java'). The course page checks for them and explains how to
     * install what's missing.
     */
    requires?: string[];
    /** Set for courses from an installed extension; built-in courses have none. */
    extension?: { id: string; displayName: string; publisher: string };
    modules: CourseModule[];
}

/**
 * A lesson as written in a curriculum. A bare title gets the title's slug as
 * its id, so lessons can be added, removed or reordered without touching
 * anyone's progress. To reword a title and keep its progress, write
 * `{ id: '<the old slug>', title: 'New title' }`. Turning a title into
 * `{ title, exercise }` keeps its id, so adding an exercise keeps progress too.
 */
export type LessonDefinition = string | { id?: string; title: string; exercise?: Exercise };

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
