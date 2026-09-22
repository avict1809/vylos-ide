import { Capstone, Course, lessonSlug } from './types';

/**
 * How the app's courses map onto the learning engine's catalog in Supabase
 * (supabase/migrations/*_learning_engine.sql): a course is a learning path,
 * each module is a skill, each lesson is a lesson and each exercise a
 * challenge. The catalog generator (scripts/learning-catalog.ts) and the app
 * both use these, so the ids always agree.
 */

export const pathId = (course: Course) => course.id;

/** Global lesson id: lesson ids are only unique within their course. */
export const lessonDbId = (courseId: string, lessonId: string) => `${courseId}/${lessonId}`;

/** An exercise is tracked as a challenge with its lesson's id. */
export const challengeDbId = lessonDbId;

export const capstoneId = (course: Course) => `${course.id}/capstone`;

/** One skill id per module, in module order. Repeated module titles get a numeric suffix. */
export function skillIds(course: Course): string[] {
    const seen = new Map<string, number>();
    return course.modules.map((mod, i) => {
        const slug = lessonSlug(mod.title) || `module-${i + 1}`;
        const n = (seen.get(slug) ?? 0) + 1;
        seen.set(slug, n);
        return `${course.id}/${n === 1 ? slug : `${slug}-${n}`}`;
    });
}

/** The skill (module) a lesson belongs to. */
export function skillIdForLesson(course: Course, lessonId: string): string | null {
    const index = course.modules.findIndex((mod) => mod.lessons.some((lesson) => lesson.id === lessonId));
    return index === -1 ? null : skillIds(course)[index];
}

/** Challenges a certificate needs: most of the course's exercises, not every single one. */
export const requiredChallenges = (course: Course) =>
    Math.ceil(course.modules.reduce((n, m) => n + m.lessons.filter((l) => l.exercise).length, 0) * 0.8);

export function capstoneFor(course: Course): Capstone {
    return (
        course.capstone ?? {
            title: `${course.title} capstone`,
            description:
                `Build a small but complete project of your own choosing with what you learned in ${course.title}, ` +
                'then submit it for review.',
            requirements: [
                'Solves a real problem you can describe in a sentence',
                `Uses the core ideas from at least half of the course's modules`,
                'Handles bad input and errors without crashing',
                'Organized into sensible files and functions',
                'Includes a short README explaining how to run it and your design decisions',
                'Includes at least a few tests, or a documented way to check it works',
            ],
        }
    );
}
