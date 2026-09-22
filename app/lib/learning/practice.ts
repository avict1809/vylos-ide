'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Course, Exercise } from './types';
import { getCourse, registerCourse } from './course-registry';
import { validateExercise, mainFile, FUNCTION_LANGUAGES } from '../exercises/format';
import { CHECK_TIMEOUT_MS, gradeCheck, planCheck, type RunOutput } from '../exercises/checkers';
import { hasRunner } from '../run/runners';
import { generateContent, isAiError } from '../ai/gemini-client';
import { useTerminalStore } from '../stores/terminal-store';
import { openExercise } from '../exercises/session';
import { api } from './progress-api';
import { skillIds } from './progress-ids';
import { useAuthStore } from '../stores/auth-store';

/**
 * Practice Acyrx writes for one skill (a course module) the learner is weak
 * in. Each is an ordinary exercise, checked by the same built-in checkers,
 * kept in a hidden course so the exercise panel works unchanged. Signed in,
 * each is also registered with the server (add_practice_challenge) so solving
 * it counts as evidence for that skill.
 */

export const PRACTICE_COURSE_ID = 'vylos-practice';

export interface PracticeItem {
    /** The server's challenge id, or local-… when made offline */
    id: string;
    originCourseId: string;
    skillId: string;
    moduleTitle: string;
    title: string;
    difficulty: number;
    exercise: Exercise;
    createdAt: number;
}

interface PracticeStore {
    items: PracticeItem[];
    add: (item: PracticeItem) => void;
}

export const usePracticeStore = create<PracticeStore>()(
    persist(
        (set) => ({
            items: [],
            // The most recent 100 are plenty to come back to
            add: (item) => set((s) => ({ items: [...s.items, item].slice(-100) })),
        }),
        { name: 'vylos-practice' }
    )
);

export const practiceItem = (id: string) => usePracticeStore.getState().items.find((item) => item.id === id) ?? null;

export const practiceFor = (courseId: string) => usePracticeStore.getState().items.filter((item) => item.originCourseId === courseId);

function registerPracticeCourse(items: PracticeItem[]) {
    registerCourse({
        id: PRACTICE_COURSE_ID,
        title: 'Practice',
        tagline: 'Exercises Acyrx wrote for the skills you are working on.',
        level: 'Personal',
        hours: 0,
        accent: '#22c55e',
        badge: 'PR',
        category: 'essentials',
        hidden: true,
        modules: [
            {
                title: 'Your practice',
                description: 'Written for you, aimed at what needs work.',
                lessons: items.map((item) => ({ id: item.id, title: item.title, exercise: item.exercise })),
            },
        ],
    });
}

let registered = false;
/** Registers the practice course and keeps it in step with the store. */
export function startPractice() {
    if (registered) return;
    registered = true;
    registerPracticeCourse(usePracticeStore.getState().items);
    usePracticeStore.subscribe((state, prev) => {
        if (state.items !== prev.items) registerPracticeCourse(state.items);
    });
}

// Languages a course without exercises of its own can practise in
const STACK_EXTENSIONS: Record<string, string> = {
    Python: 'py', JavaScript: 'js', TypeScript: 'ts', Java: 'java', 'C++': 'cpp', 'C#': 'cs', Go: 'go', Rust: 'rs',
    Ruby: 'rb', PHP: 'php', Kotlin: 'kt', Swift: 'swift',
};
const COURSE_EXTENSIONS: Record<string, string> = { c: 'c', cpp: 'cpp', python: 'py', javascript: 'js', typescript: 'ts' };

/** An exercise from the course to copy the shape of, or the language to write one in. */
function practiceLanguage(course: Course): { template?: Exercise; ext: string } | null {
    const template = course.modules.flatMap((m) => m.lessons).find((lesson) => lesson.exercise)?.exercise;
    if (template) return { template, ext: mainFile(template).split('.').pop()! };
    const ext = COURSE_EXTENSIONS[course.id] ?? (course.stack ? STACK_EXTENSIONS[course.stack] : undefined);
    return ext && hasRunner(`main.${ext}`) ? { ext } : null;
}

/** Whether Acyrx can write runnable practice for this course. */
export const canPractice = (course: Course) => course.id !== PRACTICE_COURSE_ID && !!practiceLanguage(course);

function parseJson(text: string): unknown {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    try {
        return JSON.parse((fenced ? fenced[1] : text).trim());
    } catch {
        return null;
    }
}

/**
 * Runs the exercise's own solution through its check, so practice that
 * can't be solved never reaches the learner. Returns true when it passes, or
 * when the check can't run here (the language isn't installed): the learner
 * will see that problem themselves.
 */
async function solutionPasses(exercise: Exercise): Promise<boolean> {
    if (!exercise.solution || !window.electron?.fs) return true;
    const info = useTerminalStore.getState().info ?? (await window.electron.term.info());
    const windows = info.platform === 'win32';
    const sep = windows ? '\\' : '/';
    const temp = await window.electron.getPath('temp');
    const stamp = Date.now().toString(36);
    const dir = [temp, `vylos-practice-${stamp}`].join(sep);
    const checkDir = [temp, `vylos-practice-check-${stamp}`].join(sep);
    try {
        await window.electron.fs.createDirectory(dir);
        await window.electron.fs.createDirectory(checkDir);
        for (const [name, content] of Object.entries(exercise.files)) {
            await window.electron.fs.write(`${dir}${sep}${name}`, name === mainFile(exercise) ? exercise.solution : content);
        }
        const plan = planCheck(exercise, { windows, checkDir });
        for (const [name, content] of Object.entries(plan.files)) await window.electron.fs.write(`${checkDir}${sep}${name}`, content);
        const outputs: RunOutput[] = [];
        for (const run of plan.runs) {
            const out = await window.electron.term.run({ command: run.command, cwd: dir, timeoutMs: CHECK_TIMEOUT_MS, tag: 'exercise-check' });
            outputs.push({ exitCode: out.exitCode, output: out.output, timedOut: !!out.timedOut, error: out.error });
            if (out.timedOut) break;
        }
        const result = gradeCheck(exercise, outputs);
        return result.passed || !!result.setupProblem;
    } finally {
        void window.electron.fs.delete(dir);
        void window.electron.fs.delete(checkDir);
    }
}

function practicePrompt(course: Course, moduleIndex: number, ext: string, template: Exercise | undefined, mastery: number, struggles: string[], attempt: string | null) {
    const mod = course.modules[moduleIndex];
    const checkType = FUNCTION_LANGUAGES.includes(ext) ? '"function" (preferred) or "output"' : '"output"';
    const difficulty = mastery < 0.3 ? 1 : mastery < 0.6 ? 2 : 3;
    return [
        `Write one practice exercise for a learner of the "${course.title}" course, on the module "${mod.title}".`,
        `Lessons in the module: ${mod.lessons.map((l) => l.title).join('; ')}.`,
        `Their demonstrated mastery of this module is ${Math.round(mastery * 100)}%, so aim for difficulty ${difficulty} of 5.`,
        struggles.length ? `They struggled with: ${struggles.join('; ')}. Target that.` : '',
        `Write it in the ${ext} language; the main (first) file must end in .${ext}. Use check type ${checkType}.`,
        'Answer with only a JSON object in exactly this shape:',
        '{"title": "short title", "difficulty": 1-5, "prompt": "what to build, 2-4 sentences, `code` in backticks",',
        ' "files": {"main file name": "starter code with a TODO; it must NOT pass the check"},',
        ' "check": {"type": "output", "cases": [{"input": "optional stdin", "expected": "exact output"}]}',
        '   or {"type": "function", "function": "name", "cases": [{"args": [...], "expected": ...}]},',
        ' "hints": ["gentle nudge", "more specific", "nearly the answer"],',
        ' "solution": "the complete main file, solved; it MUST pass every case"}',
        'Use 3-6 cases including an edge case. Only the standard library. No file or network access.',
        template ? `Here is an existing exercise from this course, for the format and style:\n${JSON.stringify(template)}` : '',
        attempt ? `Your previous attempt was rejected: ${attempt}. Fix that.` : '',
    ].filter(Boolean).join('\n');
}

export type PracticeResult = { ok: true; item: PracticeItem } | { ok: false; error: string };

/**
 * Writes, verifies and opens a practice exercise for one module of a course.
 * `struggles` are lesson titles the learner found hard (failed checks).
 */
export async function createPractice(course: Course, moduleIndex: number, mastery: number, struggles: string[] = []): Promise<PracticeResult> {
    const language = practiceLanguage(course);
    if (!language) return { ok: false, error: "Acyrx can't write runnable practice for this course yet." };

    let problem: string | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
        const text = await generateContent(
            practicePrompt(course, moduleIndex, language.ext, language.template, mastery, struggles, problem),
            'practice'
        );
        if (isAiError(text)) return { ok: false, error: text };
        const raw = parseJson(text) as (Record<string, unknown> & { title?: unknown; difficulty?: unknown }) | null;
        if (!raw) {
            problem = 'it was not valid JSON';
            continue;
        }
        const { exercise, errors } = validateExercise(raw);
        if (!exercise) {
            problem = errors.slice(0, 3).join('; ');
            continue;
        }
        if (!exercise.solution) {
            problem = 'it had no solution';
            continue;
        }
        if (!(await solutionPasses(exercise))) {
            problem = 'its own solution does not pass its check';
            continue;
        }

        const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim().slice(0, 120) : `${course.modules[moduleIndex].title} practice`;
        const difficulty = Math.min(5, Math.max(1, Math.round(Number(raw.difficulty) || 2)));
        const skillId = skillIds(course)[moduleIndex];
        let id = `local-${Date.now().toString(36)}`;
        if (useAuthStore.getState().user) {
            try {
                id = await api.addPracticeChallenge(skillId, title, exercise.prompt, exercise.hints?.[0] ?? '', difficulty);
            } catch (error) {
                // Offline, or over the daily limit: still practice, it just won't count
                console.warn('Practice not registered:', error);
                if (String(error).includes('Daily practice limit')) {
                    return { ok: false, error: "That's today's practice limit (15). Come back tomorrow, or revisit earlier practice." };
                }
            }
        }

        const item: PracticeItem = {
            id,
            originCourseId: course.id,
            skillId,
            moduleTitle: course.modules[moduleIndex].title,
            title,
            difficulty,
            exercise,
            createdAt: Date.now(),
        };
        usePracticeStore.getState().add(item);
        startPractice();
        await openExercise({ courseId: PRACTICE_COURSE_ID, lessonId: item.id });
        return { ok: true, item };
    }
    return { ok: false, error: "Acyrx couldn't write a working exercise this time. Try again." };
}

/** The course a practice exercise was written for. */
export const practiceOrigin = (lessonId: string) => {
    const item = practiceItem(lessonId);
    return item ? getCourse(item.originCourseId) ?? null : null;
};
