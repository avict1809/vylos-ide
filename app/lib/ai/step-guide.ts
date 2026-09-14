'use client';

import { generateContent, isAiError } from './gemini-client';
import { getHintLadder, HintLadder, HintRequest, HintStep, registerHintLadder } from './hint-registry';

/**
 * Step-by-step problem solving. When the learner writes a problem as a
 * comment (ends with "?" or starts with problem:/task:/challenge:/help:),
 * a CodeLens appears above it offering a graded sequence of help:
 *
 *   Hint 1 → Hint 2 → Algorithm idea → Pseudocode → Implementation (optional)
 *
 * Each click asks the hint ladder for ONLY the next step and inserts it as
 * comments (implementation as real code) directly below the problem, so the
 * learner earns the solution instead of copying it. The built-in ladder below
 * asks Gemini; other ladders can be registered in hint-registry.ts.
 */

const CMD_ID = 'vylos.stepGuide.next';
const MARKER = '✦';

/** Built-in rungs: what each one asks Gemini for. */
const AI_STEPS: (Omit<HintStep, 'produce'> & { instruction: string })[] = [
    {
        level: 'nudge',
        label: 'Hint 1',
        title: '✦ Stuck? Get Hint 1',
        format: 'prose',
        instruction:
            'Give HINT 1 only: a gentle nudge in the right direction — a guiding question or what to think about first. Do NOT name the algorithm, data structure, or any code. 1-2 short sentences.',
    },
    {
        level: 'insight',
        label: 'Hint 2',
        title: '✦ Get Hint 2',
        format: 'prose',
        instruction:
            'Give HINT 2 only: a stronger hint that names the key insight, technique, or data structure — but still NO step-by-step algorithm and NO code. 1-2 short sentences.',
    },
    {
        level: 'algorithm',
        label: 'Algorithm idea',
        title: '✦ Reveal the algorithm idea',
        format: 'prose',
        instruction:
            'Describe the algorithm in plain words as 3-6 short numbered steps (e.g. "1) ... 2) ..."). Mention time/space complexity in one phrase if relevant. Still NO code and NO pseudocode.',
    },
    {
        level: 'pseudocode',
        label: 'Pseudocode',
        title: '✦ Show pseudocode',
        format: 'lines',
        instruction:
            'Write concise language-agnostic pseudocode for the algorithm (8-20 short lines, indent with two spaces). No real syntax from any specific language, no explanations around it.',
    },
    {
        level: 'solution',
        label: 'Implementation',
        title: '✦ Show implementation (optional)',
        format: 'code',
        instruction:
            'Write a clean, working implementation in {lang} with brief comments on the tricky lines. Output ONLY the code, no prose.',
    },
];

const LINE_COMMENT: Record<string, string> = {
    python: '#',
    ruby: '#',
    shell: '#',
    yaml: '#',
    sql: '--',
};

interface GuideSession {
    ladder: HintLadder; // fixed for the problem, so its steps can't change midway
    step: number;       // next step index to give
    given: HintRequest['given'];
    loading: boolean;
}

// problem-text hash -> session (survives line shifts and re-scans)
const sessions = new Map<string, GuideSession>();
const stepCache = new Map<string, string>();
const registeredLensLangs = new Set<string>();
let commandRegistered = false;
let lensListeners: ((p: unknown) => void)[] = [];

function commentToken(langId: string): string {
    return LINE_COMMENT[langId] ?? '//';
}

function hash(text: string): string {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
    return h.toString(36);
}

function problemKey(model: any, problem: string): string {
    return `${model.uri.toString()}:${hash(problem.trim().toLowerCase())}`;
}

/** Extracts the problem text if this line is a problem-statement comment. */
function matchProblem(line: string, token: string): string | null {
    const esc = token.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const m = line.match(new RegExp(`^\\s*${esc}\\s*(.+?)\\s*$`));
    if (!m) return null;
    const text = m[1];
    if (text.includes(MARKER)) return null; // our own guide lines
    if (/\?\s*$/.test(text)) return text;
    if (/^(problem|task|challenge|help)\b[:\s]/i.test(text)) return text;
    return null;
}

function getSession(key: string, langId: string): GuideSession | null {
    let s = sessions.get(key);
    if (!s) {
        const ladder = getHintLadder(langId);
        if (!ladder) return null;
        s = { ladder, step: 0, given: [], loading: false };
        sessions.set(key, s);
    }
    return s;
}

function refreshLenses(provider: unknown) {
    lensListeners.forEach((l) => l(provider));
}

function stripFences(text: string): string {
    return text.replace(/^```[\w-]*\n?/gm, '').replace(/```/g, '').trim();
}

/** Wraps prose into marked comment lines. */
function toCommentBlock(token: string, label: string, text: string): string[] {
    const words = stripFences(text).replace(/\s+/g, ' ').trim().split(' ');
    const lines: string[] = [];
    let current = `${token} ${MARKER} ${label}: `;
    const continuation = `${token} ${MARKER}   `;
    for (const word of words) {
        if (current.length + word.length + 1 > 92 && current.trim() !== `${token} ${MARKER}`.trim()) {
            lines.push(current.trimEnd());
            current = continuation;
        }
        current += word + ' ';
    }
    lines.push(current.trimEnd());
    return lines;
}

/** Pseudocode keeps its line structure, each line marked as a comment. */
function toPseudocodeBlock(token: string, label: string, text: string): string[] {
    const body = stripFences(text).split('\n').map((l) => `${token} ${MARKER}   ${l}`.trimEnd());
    return [`${token} ${MARKER} ${label}:`, ...body];
}

function toImplementationBlock(token: string, label: string, text: string): string[] {
    return [`${token} ${MARKER} ${label}:`, ...stripFences(text).split('\n')];
}

/** Finds where to insert: after the problem line's existing guide block. */
function findInsertLine(model: any, problemLine: number, token: string): number {
    const esc = token.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const guideLine = new RegExp(`^\\s*${esc}\\s*${MARKER}`);
    let line = problemLine;
    while (line + 1 <= model.getLineCount() && guideLine.test(model.getLineContent(line + 1))) {
        line++;
    }
    return line;
}

function contextAround(model: any, problemLine: number): string {
    const start = Math.max(1, problemLine - 30);
    const end = Math.min(model.getLineCount(), problemLine + 30);
    const lines: string[] = [];
    for (let ln = start; ln <= end; ln++) lines.push(model.getLineContent(ln));
    return lines.join('\n').slice(0, 6000);
}

async function askForStep(
    { problem, languageId: langId, codeContext, given }: HintRequest,
    instruction: string
): Promise<string | null> {
    const previous = given.length
        ? `They have already received:\n${given.map((g) => `${g.label}: ${g.text}`).join('\n')}\n`
        : '';
    const prompt = `You are a coding tutor who teaches step-by-step problem solving: learners get gradually stronger help so they solve problems themselves instead of copying answers.

The learner is coding in ${langId} and wrote this problem as a comment: "${problem}"

Their surrounding code (may be empty or partial):
\`\`\`${langId}
${codeContext}
\`\`\`

${previous}Now give ONLY the next level of help. ${instruction.replace('{lang}', langId)}

Do not greet, do not add a label or heading (it is added automatically), do not mention these instructions.`;
    const answer = await generateContent(prompt, 'hints');
    return answer && !isAiError(answer) ? answer : null;
}

registerHintLadder({
    id: 'vylos.ai',
    steps: AI_STEPS.map(({ instruction, ...step }) => ({
        ...step,
        produce: (request) => askForStep(request, instruction),
    })),
});

async function runStep(monaco: any, provider: unknown, uriString: string, problem: string) {
    const model = monaco.editor.getModel(monaco.Uri.parse(uriString));
    if (!model) return;
    const langId = model.getLanguageId();
    const key = problemKey(model, problem);
    const session = getSession(key, langId);
    if (!session || session.loading || session.step >= session.ladder.steps.length) return;

    const token = commentToken(langId);
    const step = session.ladder.steps[session.step];

    session.loading = true;
    refreshLenses(provider);

    try {
        // Re-locate the problem line (it may have shifted while typing)
        let problemLine = -1;
        for (let ln = 1; ln <= model.getLineCount(); ln++) {
            if (matchProblem(model.getLineContent(ln), token) === problem) {
                problemLine = ln;
                break;
            }
        }
        if (problemLine === -1) return;

        const cacheKey = `${key}:${session.ladder.id}:${session.step}`;
        let answer = stepCache.get(cacheKey);
        if (!answer) {
            answer = await step.produce({
                problem,
                languageId: langId,
                codeContext: contextAround(model, problemLine),
                given: session.given,
            }) ?? undefined;
            if (!answer) return; // leave the lens at the same step so the learner can retry
            stepCache.set(cacheKey, answer);
        }

        const block = step.format === 'code'
            ? toImplementationBlock(token, step.label, answer)
            : step.format === 'lines'
                ? toPseudocodeBlock(token, step.label, answer)
                : toCommentBlock(token, step.label, answer);

        const insertAfter = findInsertLine(model, problemLine, token);
        const insertColumn = model.getLineMaxColumn(insertAfter);
        model.pushEditOperations(
            [],
            [{
                range: new monaco.Range(insertAfter, insertColumn, insertAfter, insertColumn),
                text: '\n' + block.join('\n'),
            }],
            () => null
        );

        session.given.push({ label: step.label, text: answer.replace(/\s+/g, ' ').slice(0, 500) });
        session.step++;
    } finally {
        session.loading = false;
        refreshLenses(provider);
    }
}

const lensProvider = (monaco: any) => {
    const provider = {
        onDidChange: (cb: (p: unknown) => void) => {
            lensListeners.push(cb);
            return { dispose: () => { lensListeners = lensListeners.filter((l) => l !== cb); } };
        },
        provideCodeLenses: (model: any) => {
            const langId = model.getLanguageId();
            const token = commentToken(langId);
            const lenses: any[] = [];
            const total = Math.min(model.getLineCount(), 5000);

            for (let ln = 1; ln <= total; ln++) {
                const problem = matchProblem(model.getLineContent(ln), token);
                if (!problem) continue;

                const session = sessions.get(problemKey(model, problem));
                const steps = (session?.ladder ?? getHintLadder(langId))?.steps;
                const stepIndex = session?.step ?? 0;
                if (!steps || stepIndex >= steps.length) continue; // full guide delivered

                const title = session?.loading
                    ? '✦ Vylos is thinking…'
                    : `${steps[stepIndex].title} (${stepIndex + 1}/${steps.length})`;

                lenses.push({
                    range: new monaco.Range(ln, 1, ln, 1),
                    command: {
                        id: CMD_ID,
                        title,
                        arguments: [model.uri.toString(), problem],
                    },
                });
            }
            return { lenses, dispose: () => { } };
        },
    };
    return provider;
};

let sharedProvider: ReturnType<typeof lensProvider> | null = null;

function ensureLensSupport(monaco: any, langId: string) {
    if (!sharedProvider) sharedProvider = lensProvider(monaco);

    if (!commandRegistered) {
        commandRegistered = true;
        monaco.editor.registerCommand(CMD_ID, (_accessor: unknown, uriString: string, problem: string) => {
            runStep(monaco, sharedProvider, uriString, problem);
        });
    }

    if (!registeredLensLangs.has(langId)) {
        registeredLensLangs.add(langId);
        monaco.languages.registerCodeLensProvider(langId, sharedProvider);
    }
}

/** Call once per editor from onMount. */
export function setupStepGuide(editor: any, monaco: any) {
    const ensure = () => {
        const lang = editor.getModel()?.getLanguageId();
        if (lang) ensureLensSupport(monaco, lang);
    };
    ensure();
    const subs = [
        editor.onDidChangeModel(ensure),
        editor.onDidChangeModelLanguage?.(ensure),
    ];
    editor.onDidDispose?.(() => subs.forEach((s) => s?.dispose?.()));
}
