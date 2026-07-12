import { Course, lessonId } from './types';
import { getCourse } from './curricula';

/** Points at one lesson inside a curated course. */
export interface LessonRef {
    courseId: string;
    moduleIndex: number;
    lessonIndex: number;
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

export function resolveLesson(ref: LessonRef): ResolvedLesson | null {
    const course = getCourse(ref.courseId);
    const mod = course?.modules[ref.moduleIndex];
    const lesson = mod?.lessons[ref.lessonIndex];
    if (!course || !mod || lesson === undefined) return null;
    return {
        course,
        moduleIndex: ref.moduleIndex,
        lessonIndex: ref.lessonIndex,
        moduleTitle: mod.title,
        moduleDescription: mod.description,
        lessonTitle: lesson,
        number: `${ref.moduleIndex + 1}.${ref.lessonIndex + 1}`,
        lessonId: lessonId(ref.courseId, ref.moduleIndex, ref.lessonIndex),
    };
}

export function nextLessonRef(course: Course, ref: LessonRef): LessonRef | null {
    if (ref.lessonIndex + 1 < course.modules[ref.moduleIndex].lessons.length) {
        return { ...ref, lessonIndex: ref.lessonIndex + 1 };
    }
    if (ref.moduleIndex + 1 < course.modules.length) {
        return { courseId: ref.courseId, moduleIndex: ref.moduleIndex + 1, lessonIndex: 0 };
    }
    return null;
}

export function firstIncompleteLesson(course: Course, completed: string[] | undefined): LessonRef | null {
    const done = new Set(completed ?? []);
    for (let mi = 0; mi < course.modules.length; mi++) {
        for (let li = 0; li < course.modules[mi].lessons.length; li++) {
            if (!done.has(lessonId(course.id, mi, li))) {
                return { courseId: course.id, moduleIndex: mi, lessonIndex: li };
            }
        }
    }
    return null;
}

/** Asks the voice tutor to start (or restart) a session teaching this lesson. */
export function startLessonWithTutor(ref: LessonRef) {
    window.dispatchEvent(new CustomEvent('vylos:start-lesson', { detail: ref }));
}

/** Resumes the interrupted lesson session, keeping the chat and picking up where it left off. */
export function resumeLessonWithTutor() {
    window.dispatchEvent(new CustomEvent('vylos:resume-lesson'));
}
