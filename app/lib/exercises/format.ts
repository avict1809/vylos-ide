import type { Exercise, ExerciseCheck } from '../learning/types';
import { extensionOf, hasRunner } from '../run/runners';

/**
 * Validates an exercise, whether it's built in or comes from a course pack.
 * The rules are also what keeps a pack from running anything but the
 * learner's own code: file names are plain names (no paths, nothing a shell
 * would interpret), the main file must be a language Vylos has a fixed run
 * command for, and every value a check uses is written to a file, never
 * pasted into a command.
 */

const FILE_NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/;
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/;
/** Languages the `function` check can call into */
export const FUNCTION_LANGUAGES = ['py', 'js', 'cjs', 'mjs'];

const MAX_FILES = 10;
const MAX_FILE_CHARS = 50_000;
const MAX_CASES = 50;
const MAX_HINTS = 10;

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

export interface ExerciseCheckResult {
    exercise?: Exercise;
    errors: string[];
}

/** `where` prefixes every message, e.g. `modules[0].lessons[2].exercise`. */
export function validateExercise(value: unknown, where = 'exercise'): ExerciseCheckResult {
    const errors: string[] = [];
    const error = (at: string, message: string) => errors.push(`${where}${at ? `.${at}` : ''}: ${message}`);
    const text = (v: unknown, at: string, max: number) => {
        if (typeof v !== 'string' || !v.trim()) error(at, 'must be a non-empty string');
        else if (v.length > max) error(at, `must be at most ${max} characters`);
        else return v;
        return undefined;
    };

    if (!isObject(value)) {
        error('', 'must be an object with "prompt", "files" and "check"');
        return { errors };
    }

    const prompt = text(value.prompt, 'prompt', 4000);

    const files: Record<string, string> = {};
    if (!isObject(value.files) || Object.keys(value.files).length === 0) {
        error('files', 'must be an object of starter files, e.g. { "main.py": "..." }');
    } else if (Object.keys(value.files).length > MAX_FILES) {
        error('files', `at most ${MAX_FILES} files`);
    } else {
        for (const [name, content] of Object.entries(value.files)) {
            if (!FILE_NAME.test(name)) error(`files.${name}`, 'use a plain file name: letters, digits, dots, dashes and underscores, no folders');
            else if (typeof content !== 'string') error(`files.${name}`, 'must be the file\'s text');
            else if (content.length > MAX_FILE_CHARS) error(`files.${name}`, `must be at most ${MAX_FILE_CHARS} characters`);
            else files[name] = content;
        }
    }
    const main = Object.keys(files)[0];
    if (main && !hasRunner(main)) error(`files.${main}`, `Vylos can't run .${extensionOf(main)} files, so it can't check them`);

    let check: ExerciseCheck | undefined;
    const c = value.check;
    if (!isObject(c)) {
        error('check', 'must be an object with "type" and "cases"');
    } else if (!Array.isArray(c.cases) || c.cases.length === 0 || c.cases.length > MAX_CASES) {
        error('check.cases', `must list 1 to ${MAX_CASES} cases`);
    } else if (c.type === 'output') {
        const cases = c.cases.flatMap((raw, i) => {
            const at = `check.cases[${i}]`;
            if (!isObject(raw)) { error(at, 'must be an object with "expected"'); return []; }
            if (typeof raw.expected !== 'string') { error(`${at}.expected`, 'must be the text the program should print'); return []; }
            if (raw.input !== undefined && typeof raw.input !== 'string') { error(`${at}.input`, 'must be a string'); return []; }
            if (raw.name !== undefined && typeof raw.name !== 'string') { error(`${at}.name`, 'must be a string'); return []; }
            const match = (raw.match ?? 'exact') as 'exact' | 'contains' | 'regex';
            if (match !== 'exact' && match !== 'contains' && match !== 'regex') { error(`${at}.match`, 'must be "exact", "contains" or "regex"'); return []; }
            if (match === 'regex') {
                try { new RegExp(raw.expected, 'm'); } catch { error(`${at}.expected`, 'is not a valid regular expression'); return []; }
            }
            return [{ name: raw.name as string | undefined, input: raw.input as string | undefined, expected: raw.expected, match }];
        });
        check = { type: 'output', cases };
    } else if (c.type === 'function') {
        if (typeof c.function !== 'string' || !IDENTIFIER.test(c.function)) error('check.function', 'must be the name of a function, e.g. "total"');
        if (main && !FUNCTION_LANGUAGES.includes(extensionOf(main))) {
            error('check.type', `"function" checks work for Python and JavaScript files; use "output" for .${extensionOf(main)}`);
        }
        const cases = c.cases.flatMap((raw, i) => {
            const at = `check.cases[${i}]`;
            if (!isObject(raw) || !Array.isArray(raw.args) || !('expected' in raw)) { error(at, 'must be an object with "args" (a list) and "expected"'); return []; }
            if (raw.name !== undefined && typeof raw.name !== 'string') { error(`${at}.name`, 'must be a string'); return []; }
            return [{ name: raw.name as string | undefined, args: raw.args, expected: raw.expected }];
        });
        check = { type: 'function', function: String(c.function), cases };
    } else {
        error('check.type', 'must be "output" or "function"');
    }

    let hints: string[] | undefined;
    if (value.hints !== undefined) {
        if (!Array.isArray(value.hints) || value.hints.length > MAX_HINTS) error('hints', `must be a list of up to ${MAX_HINTS} hints`);
        else hints = value.hints.flatMap((h, i) => (text(h, `hints[${i}]`, 1000) ? [h as string] : []));
    }
    const solution = value.solution === undefined ? undefined : text(value.solution, 'solution', MAX_FILE_CHARS);
    let solutionAfter: number | undefined;
    if (value.solutionAfter !== undefined) {
        if (!Number.isInteger(value.solutionAfter) || (value.solutionAfter as number) < 1 || (value.solutionAfter as number) > 20) {
            error('solutionAfter', 'must be a whole number from 1 to 20');
        } else solutionAfter = value.solutionAfter as number;
    }

    const known = ['prompt', 'files', 'check', 'hints', 'solution', 'solutionAfter'];
    for (const key of Object.keys(value)) if (!known.includes(key)) error(key, 'unknown field');

    if (errors.length || !prompt || !check || !main) return { errors };
    return { exercise: { prompt, files, check, hints, solution, solutionAfter }, errors };
}

/** The file that opens in the editor and gets checked. */
export const mainFile = (exercise: Exercise) => Object.keys(exercise.files)[0];
