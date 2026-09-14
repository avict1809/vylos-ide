import { Course } from './types';
import { getCourse } from './course-registry';

/** Points at one lesson inside a curated course. */
export interface LessonRef {
    courseId: string;
    lessonId: string;
}

export interface ResolvedLesson {
    course: Course;
    moduleIndex: number;
    lessonIndex: number;
    moduleTitle: string;
    moduleDescription: string;
    lessonTitle: string;
    /** e.g. "3.2" */
    number: string;
    lessonId: string;
}

/** Where a lesson sits in its course right now; positions change as courses are updated. */
export function locateLesson(course: Course, lessonId: string): { moduleIndex: number; lessonIndex: number } | null {
    for (let mi = 0; mi < course.modules.length; mi++) {
        const li = course.modules[mi].lessons.findIndex((lesson) => lesson.id === lessonId);
        if (li !== -1) return { moduleIndex: mi, lessonIndex: li };
    }
    return null;
}

export function resolveLesson(ref: LessonRef): ResolvedLesson | null {
    const course = getCourse(ref.courseId);
    const at = course && locateLesson(course, ref.lessonId);
    if (!course || !at) return null;
    const mod = course.modules[at.moduleIndex];
    return {
        course,
        ...at,
        moduleTitle: mod.title,
        moduleDescription: mod.description,
        lessonTitle: mod.lessons[at.lessonIndex].title,
        number: `${at.moduleIndex + 1}.${at.lessonIndex + 1}`,
        lessonId: ref.lessonId,
    };
}

export function nextLessonRef(course: Course, ref: LessonRef): LessonRef | null {
    const at = locateLesson(course, ref.lessonId);
    if (!at) return null;
    const next =
        course.modules[at.moduleIndex].lessons[at.lessonIndex + 1] ??
        course.modules[at.moduleIndex + 1]?.lessons[0];
    return next ? { courseId: course.id, lessonId: next.id } : null;
}

export function firstIncompleteLesson(course: Course, completed: string[] | undefined): LessonRef | null {
    const done = new Set(completed ?? []);
    const lesson = course.modules.flatMap((m) => m.lessons).find((l) => !done.has(l.id));
    return lesson ? { courseId: course.id, lessonId: lesson.id } : null;
}

/** Asks the voice tutor to start (or restart) a session teaching this lesson. */
export function startLessonWithTutor(ref: LessonRef) {
    window.dispatchEvent(new CustomEvent('vylos:start-lesson', { detail: ref }));
}

/** Resumes the interrupted lesson session, keeping the chat and picking up where it left off. */
export function resumeLessonWithTutor() {
    window.dispatchEvent(new CustomEvent('vylos:resume-lesson'));
}
