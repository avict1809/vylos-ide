export interface CourseModule {
    title: string;
    description: string;
    lessons: string[];
}

export interface Course {
    id: string;
    title: string;
    tagline: string;
    level: string;
    hours: number;
    accent: string;
    badge: string;
    /** 'language' (default) or 'framework' — controls catalog grouping */
    category?: 'language' | 'framework';
    /** For frameworks: the base language/stack shown as a tag, e.g. 'JavaScript' */
    stack?: string;
    modules: CourseModule[];
}

export const lessonId = (courseId: string, moduleIndex: number, lessonIndex: number) =>
    `${courseId}-${moduleIndex}-${lessonIndex}`;

export const moduleLessonIds = (course: Course, moduleIndex: number) =>
    course.modules[moduleIndex].lessons.map((_, li) => lessonId(course.id, moduleIndex, li));

export const totalLessons = (course: Course) =>
    course.modules.reduce((sum, m) => sum + m.lessons.length, 0);

export interface CourseProgress {
    done: number;
    total: number;
    percent: number;
}

export const courseProgress = (course: Course, completed: string[] | undefined): CourseProgress => {
    const total = totalLessons(course);
    const set = new Set(completed ?? []);
    let done = 0;
    course.modules.forEach((m, mi) =>
        m.lessons.forEach((_, li) => {
            if (set.has(lessonId(course.id, mi, li))) done++;
        })
    );
    return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
};

export const moduleProgress = (
    course: Course,
    moduleIndex: number,
    completed: string[] | undefined
): CourseProgress => {
    const set = new Set(completed ?? []);
    const total = course.modules[moduleIndex].lessons.length;
    const done = course.modules[moduleIndex].lessons.filter((_, li) =>
        set.has(lessonId(course.id, moduleIndex, li))
    ).length;
    return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
};
