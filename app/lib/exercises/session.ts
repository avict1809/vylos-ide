'use client';

import type { Exercise } from '../learning/types';
import { resolveLesson, type LessonRef, type ResolvedLesson } from '../learning/lesson-utils';
import { useCourseStore } from '../stores/course-store';
import { exerciseKey, useExerciseStore } from '../stores/exercise-store';
import { useTerminalStore } from '../stores/terminal-store';
import { useFileStore } from '../useFileStore';
import { CHECK_TIMEOUT_MS, gradeCheck, planCheck, type CheckResult, type RunOutput } from './checkers';
import { mainFile } from './format';
import { reportExerciseCheck } from '../learning/progress-sync';

/**
 * Opening, resetting and checking exercises in the desktop app. Each exercise
 * gets its own folder, ~/vylos-exercises/<course>/<lesson>, so the learner's
 * work survives restarts and never mixes with their own projects. Checks run
 * the learner's saved files with a harness from a temporary folder, so the
 * tests themselves never appear next to their code.
 */

export interface ExerciseInfo {
    lesson: ResolvedLesson;
    exercise: Exercise;
}

export function exerciseFor(ref: LessonRef): ExerciseInfo | null {
    const lesson = resolveLesson(ref);
    const exercise = lesson?.course.modules[lesson.moduleIndex].lessons[lesson.lessonIndex].exercise;
    return lesson && exercise ? { lesson, exercise } : null;
}

async function platform() {
    const info = useTerminalStore.getState().info ?? (await window.electron.term.info());
    const windows = info.platform === 'win32';
    return { windows, sep: windows ? '\\' : '/' };
}

// Course ids of installed packs contain a dot (publisher.course); both are safe folder names
const safeSegment = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '-');

export async function exerciseDir(ref: LessonRef): Promise<string> {
    const saved = useExerciseStore.getState().get(ref).dir;
    if (saved) return saved;
    const { sep } = await platform();
    const home = await window.electron.getPath('home');
    return [home, 'vylos-exercises', safeSegment(ref.courseId), safeSegment(ref.lessonId)].join(sep);
}

/** Replaces the text of any open editor tab for `path`, so it matches the file on disk. */
function refreshOpenTab(path: string, content: string) {
    useFileStore.setState((s) => ({
        openFiles: s.openFiles.map((f) => (f.path === path ? { ...f, content, originalContent: content, isDirty: false } : f)),
    }));
}

/**
 * Creates the exercise's folder and starter files (keeping any the learner
 * already changed), opens the main file, and shows the exercise in the
 * learning panel.
 */
export async function openExercise(ref: LessonRef): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
    const info = exerciseFor(ref);
    if (!info) return { ok: false, error: 'This lesson has no exercise.' };
    if (!window.electron?.fs) return { ok: false, error: 'Exercises need the Vylos desktop app.' };

    const dir = await exerciseDir(ref);
    const { sep } = await platform();
    if (!(await window.electron.fs.createDirectory(dir))) return { ok: false, error: `Couldn't create ${dir}` };
    for (const [name, content] of Object.entries(info.exercise.files)) {
        const path = `${dir}${sep}${name}`;
        if ((await window.electron.fs.read(path)) === null) await window.electron.fs.write(path, content);
    }

    const store = useExerciseStore.getState();
    store.setDir(ref, dir);
    store.setActive(ref);
    useCourseStore.getState().setActiveCourse(ref.courseId);
    const files = useFileStore.getState();
    // Show the task, unless the learner is talking to a tutor: then keep the conversation on screen
    if (files.activeView !== 'ai' && files.activeView !== 'tutor') files.setActiveView('learning');
    const main = `${dir}${sep}${mainFile(info.exercise)}`;
    await files.openFileByPath(main);
    return { ok: true, path: main };
}

/** Puts the starter files back, replacing the learner's changes. */
export async function resetExercise(ref: LessonRef) {
    const info = exerciseFor(ref);
    if (!info) return;
    const dir = await exerciseDir(ref);
    const { sep } = await platform();
    await window.electron.fs.createDirectory(dir);
    for (const [name, content] of Object.entries(info.exercise.files)) {
        const path = `${dir}${sep}${name}`;
        await window.electron.fs.write(path, content);
        refreshOpenTab(path, content);
    }
}

/** Saves unsaved editor changes to the exercise's files, so the check sees what's on screen. */
async function saveExerciseTabs(dir: string, sep: string) {
    for (const tab of useFileStore.getState().openFiles) {
        if (!tab.isDirty || !tab.path.startsWith(dir + sep)) continue;
        if (await window.electron.fs.write(tab.path, tab.content)) refreshOpenTab(tab.path, tab.content);
    }
}

/**
 * Grades the learner's code. A pass completes the lesson: that's the rule
 * core applies, whoever asked for the check (the Check button or the tutor).
 */
export async function checkExercise(ref: LessonRef): Promise<CheckResult> {
    const info = exerciseFor(ref);
    if (!info) return { passed: false, cases: [], summary: 'Not checked', problem: 'This lesson has no exercise.', setupProblem: true };
    const store = useExerciseStore.getState();
    const key = exerciseKey(ref);
    if (store.checking === key) return { passed: false, cases: [], summary: 'Not checked', problem: 'A check is already running.', setupProblem: true };

    store.setChecking(key);
    const { windows, sep } = await platform();
    const dir = await exerciseDir(ref);
    const checkDir = [await window.electron.getPath('temp'), `vylos-check-${Date.now().toString(36)}`].join(sep);
    try {
        await saveExerciseTabs(dir, sep);
        if ((await window.electron.fs.read(`${dir}${sep}${mainFile(info.exercise)}`)) === null) {
            const result: CheckResult = {
                passed: false, cases: [], summary: 'Not checked', setupProblem: true,
                problem: `${mainFile(info.exercise)} is missing from the exercise folder. Use Reset to get the starter files back.`,
            };
            store.recordCheck(ref, result);
            return result;
        }

        const plan = planCheck(info.exercise, { windows, checkDir });
        await window.electron.fs.createDirectory(checkDir);
        for (const [name, content] of Object.entries(plan.files)) await window.electron.fs.write(`${checkDir}${sep}${name}`, content);

        const outputs: RunOutput[] = [];
        for (const run of plan.runs) {
            // Not tied to a terminal tab: checks run quietly and report in the exercise panel
            const out = await window.electron.term.run({ command: run.command, cwd: dir, timeoutMs: CHECK_TIMEOUT_MS, tag: 'exercise-check' });
            outputs.push({ exitCode: out.exitCode, output: out.output, timedOut: !!out.timedOut, error: out.error });
            if (out.timedOut) break;
        }

        const result = gradeCheck(info.exercise, outputs);
        const before = useExerciseStore.getState().get(ref);
        useExerciseStore.getState().recordCheck(ref, result);
        reportExerciseCheck(ref, result, before);
        if (result.passed) useCourseStore.getState().completeLessons(ref.courseId, [ref.lessonId]);
        return result;
    } finally {
        void window.electron.fs.delete(checkDir);
        useExerciseStore.getState().setChecking(null);
    }
}
