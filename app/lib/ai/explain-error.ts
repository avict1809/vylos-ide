'use client';

import { generateContent, isAiError } from './gemini-client';
import type { TermRun } from '../stores/terminal-store';

/**
 * "Explain this error" for a run that failed: what went wrong in plain
 * words, where, and why, then hints one at a time, and the fix last. The
 * same hints-before-answers idea as the step guide.
 */

export interface ErrorExplanation {
    summary: string;
    /** Path of the file the error points at, as absolute as we could make it */
    file: string | null;
    line: number | null;
    explanation: string;
    hints: string[];
    fix: string | null;
}

const SOURCE_EXTENSIONS = 'py|js|mjs|cjs|ts|tsx|jsx|java|c|cc|cpp|cxx|h|hpp|go|rs|rb|php|cs|kt|swift|dart|lua|pl|r|jl|sh';
const OUTPUT_TAIL = 4000;
const CONTEXT_LINES = 40;

const isAbsolute = (p: string) => p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p);
const joinPath = (dir: string, p: string) => (isAbsolute(p) ? p : `${dir}${dir.includes('\\') ? '\\' : '/'}${p.replace(/^\.[\\/]/, '')}`);

/**
 * The learner's file and line an error points at. Prefers the last location
 * inside the run's folder (the learner's own code), skipping library files.
 */
export function findErrorLocation(output: string, cwd: string | null): { file: string; line: number } | null {
    const found: { file: string; line: number }[] = [];
    // Python: File "/path/main.py", line 4
    for (const m of output.matchAll(/File "([^"]+)", line (\d+)/g)) found.push({ file: m[1], line: Number(m[2]) });
    // Most compilers and runtimes: path/main.c:12:5 or main.java:3, or (/path/app.js:10:3)
    const colon = new RegExp(`(?:^|[\\s(])((?:[A-Za-z]:)?[\\w./\\\\-]+\\.(?:${SOURCE_EXTENSIONS})):(\\d+)`, 'gm');
    for (const m of output.matchAll(colon)) found.push({ file: m[1], line: Number(m[2]) });

    const libraries = /[\\/](site-packages|dist-packages|node_modules|lib[\\/]python\d|internal[\\/]modules)[\\/]|^node:|<frozen|<string>/;
    const resolved = found
        .filter((f) => !libraries.test(f.file))
        .map((f) => ({ file: cwd ? joinPath(cwd, f.file) : f.file, line: f.line }));
    const inFolder = cwd ? resolved.filter((f) => f.file.startsWith(cwd)) : resolved;
    return inFolder.at(-1) ?? resolved.at(-1) ?? null;
}

/** The source around `line`, numbered, so the model can point at it. */
export function numberedSource(content: string, line: number | null): string {
    const lines = content.split('\n');
    const from = line ? Math.max(1, line - CONTEXT_LINES) : 1;
    const to = line ? Math.min(lines.length, line + CONTEXT_LINES) : Math.min(lines.length, CONTEXT_LINES * 2);
    return lines.slice(from - 1, to).map((l, i) => `${String(from + i).padStart(4)} | ${l}`).join('\n');
}

export function buildExplainPrompt(run: Pick<TermRun, 'command' | 'exitCode' | 'output'>, source: { path: string; text: string } | null, lessonTitle?: string): string {
    return `A beginner programmer's program failed in Vylos, a learning IDE. Explain the error so they can fix it THEMSELVES.

Command: ${run.command}
Exit code: ${run.exitCode}
${lessonTitle ? `They are learning: ${lessonTitle}\n` : ''}
The end of the output:
\`\`\`
${run.output.slice(-OUTPUT_TAIL)}
\`\`\`
${source ? `\nThe file ${source.path} (line numbers on the left):\n\`\`\`\n${source.text}\n\`\`\`\n` : '\n(The source file isn\'t available.)\n'}
Reply with ONLY a JSON object, no Markdown around it:
{
  "summary": "one sentence: what went wrong, in plain words",
  "file": "the file the error is in, as it appears in the output, or null",
  "line": the line number of the mistake (not always the line in the error message), or null,
  "explanation": "2 to 4 short sentences: what the error message means and why it happened here",
  "hints": ["a gentle nudge towards the problem", "a more specific hint that still doesn't give the code"],
  "fix": "the exact change that fixes it, as a short code snippet with one sentence, or null if it can't be known from what's shown"
}

Base everything on the output and code shown; don't guess about code you can't see. If the output shows no error (the program just exited with that code), say so in the summary. Use simple English. Hints must not contain the fixed code.`;
}

/** Reads the model's JSON, tolerating a code fence or text around it. */
export function parseExplanation(text: string): Omit<ErrorExplanation, 'file'> & { file: string | null } | null {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
        const raw = JSON.parse(text.slice(start, end + 1));
        if (typeof raw.summary !== 'string' || !raw.summary.trim()) return null;
        return {
            summary: raw.summary.trim(),
            file: typeof raw.file === 'string' && raw.file.trim() ? raw.file.trim() : null,
            line: Number.isInteger(raw.line) && raw.line > 0 ? raw.line : null,
            explanation: typeof raw.explanation === 'string' ? raw.explanation.trim() : '',
            hints: Array.isArray(raw.hints) ? raw.hints.filter((h: unknown): h is string => typeof h === 'string' && !!h.trim()).slice(0, 4) : [],
            fix: typeof raw.fix === 'string' && raw.fix.trim() ? raw.fix.trim() : null,
        };
    } catch {
        return null;
    }
}

// One request per run, even if the panel asks twice while the first is in flight
const cache = new Map<number, Promise<ErrorExplanation | { error: string }>>();

export function explainRun(run: TermRun, lessonTitle?: string): Promise<ErrorExplanation | { error: string }> {
    let pending = cache.get(run.id);
    if (!pending) {
        pending = explain(run, lessonTitle);
        cache.set(run.id, pending);
        // Errors (daily limit, offline) can be retried by opening the panel again
        void pending.then((r) => { if ('error' in r) cache.delete(run.id); });
    }
    return pending;
}

async function explain(run: TermRun, lessonTitle?: string): Promise<ErrorExplanation | { error: string }> {
    const located = findErrorLocation(run.output, run.cwd);
    const path = located?.file ?? run.target ?? null;
    let source: { path: string; text: string } | null = null;
    if (path && window.electron?.fs) {
        const text = await window.electron.fs.read(path);
        if (text !== null) source = { path, text: numberedSource(text, located?.line ?? null) };
    }

    const reply = await generateContent(buildExplainPrompt(run, source, lessonTitle), 'explain-error');
    if (isAiError(reply)) return { error: reply };
    const parsed = parseExplanation(reply);
    if (!parsed) {
        // Not the JSON we asked for: still show what it said
        return { summary: 'Here is what the error means', file: path, line: located?.line ?? null, explanation: reply.trim(), hints: [], fix: null };
    }
    // Prefer the absolute path we found over the name the model repeated
    const file = parsed.file && path && path.endsWith(parsed.file.replace(/^\.[\\/]/, '')) ? path : parsed.file && run.cwd ? joinPath(run.cwd, parsed.file) : path;
    return { ...parsed, file, line: parsed.line ?? located?.line ?? null };
}
