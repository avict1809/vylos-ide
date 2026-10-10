'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { generateContent, isAiError } from '../ai/gemini-client';
import { resolveLesson, type LessonRef } from './lesson-utils';

/**
 * Short written notes for a lesson, so every lesson can be read, not only
 * heard. Curricula only have lesson titles, so notes are written by Vylos AI
 * the first time a lesson is opened and kept on this computer after that.
 * The UI says who wrote them.
 */

export interface LessonNotes {
    text: string;
    createdAt: number;
}

interface NotesStore {
    notes: Record<string, LessonNotes>;
    loading: Record<string, boolean>;
    errors: Record<string, string>;
}

const MAX_SAVED = 300;
const key = (ref: LessonRef) => `${ref.courseId}/${ref.lessonId}`;

export const useLessonNotesStore = create<NotesStore>()(
    persist(
        (): NotesStore => ({ notes: {}, loading: {}, errors: {} }),
        {
            name: 'vylos-lesson-notes',
            // Keep the most recent notes; they can always be written again
            partialize: (s) => ({
                notes: Object.fromEntries(Object.entries(s.notes).sort(([, a], [, b]) => b.createdAt - a.createdAt).slice(0, MAX_SAVED)),
            }),
        }
    )
);

export function buildNotesPrompt(ref: LessonRef): string | null {
    const lesson = resolveLesson(ref);
    if (!lesson) return null;
    const { course } = lesson;
    const mod = course.modules[lesson.moduleIndex];
    const prev = mod.lessons[lesson.lessonIndex - 1]?.title;
    const next = mod.lessons[lesson.lessonIndex + 1]?.title;
    const exercise = mod.lessons[lesson.lessonIndex].exercise;

    return `Write short study notes for ONE lesson of a course in Vylos, a learning IDE.

Course: ${course.title} (${course.level}${course.stack ? `, ${course.stack}` : ''})
Module ${lesson.moduleIndex + 1}: ${lesson.moduleTitle}: ${lesson.moduleDescription}
This lesson (${lesson.number}): ${lesson.lessonTitle}
${prev ? `The lesson before it: ${prev}\n` : ''}${next ? `The lesson after it: ${next}\n` : ''}${course.tutorGuidelines?.length ? `\nCourse guidelines (follow them):\n${course.tutorGuidelines.map((g) => `- ${g}`).join('\n')}\n` : ''}${exercise ? `\nThe lesson ends with this exercise, which the learner must solve themselves: "${exercise.prompt}" Prepare them for it, but NEVER show its solution or code that solves it.\n` : ''}
Write in Markdown, 150 to 350 words, in plain, simple English for a learner at this level. Use exactly these sections:
## The idea
What this is and why it matters, in 2-4 short sentences.
## Example
One small, complete example (under 15 lines) in a fenced code block with the language name, then one or two sentences about what it does. If it prints something, show the output in a comment.
## Common mistakes
2 or 3 bullet points.
## Check yourself
1 or 2 short questions the learner can answer in their head. No answers.

Only cover this lesson's topic; the lessons before and after it are there so you know where it stops. Use only standard, well-established features. Don't mention version numbers unless the topic needs them, and don't include links. Output only the notes.`;
}

/** The lesson's notes, writing them if there are none yet (or `refresh` is set). */
export async function loadLessonNotes(ref: LessonRef, opts: { refresh?: boolean } = {}): Promise<void> {
    const k = key(ref);
    const state = useLessonNotesStore.getState();
    if (state.loading[k] || (state.notes[k] && !opts.refresh)) return;
    const prompt = buildNotesPrompt(ref);
    if (!prompt) return;

    useLessonNotesStore.setState((s) => ({ loading: { ...s.loading, [k]: true }, errors: { ...s.errors, [k]: '' } }));
    const text = await generateContent(prompt, 'lesson-notes');
    useLessonNotesStore.setState((s) => {
        const loading = { ...s.loading, [k]: false };
        // Errors are shown, never saved as notes
        if (isAiError(text)) return { loading, errors: { ...s.errors, [k]: text } };
        return { loading, notes: { ...s.notes, [k]: { text: text.trim(), createdAt: Date.now() } } };
    });
}

export const notesKey = key;
