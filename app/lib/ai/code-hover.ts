'use client';

import { generateContent } from './gemini-client';

/**
 * AI code hints: function/class definitions get a dotted underline, and
 * hovering one shows a Gemini-written explanation of what that block does
 * in the editor's native hover tooltip. Explanations are cached per block
 * so repeat hovers are instant and cheap.
 */

interface Hint {
    range: any; // monaco.Range of the definition name
    name: string;
    line: number;
}

const modelHints = new WeakMap<object, Hint[]>();
const collections = new WeakMap<object, any>(); // editor -> decorations collection
const registeredLangs = new Set<string>();
const explainCache = new Map<string, string>();
const pendingExplains = new Map<string, Promise<string>>();

const MAX_HINTS = 300;
const MAX_SCAN_LINES = 5000;
const MAX_BLOCK_LINES = 60;
const MAX_CACHE = 200;

// Words a definition regex must never treat as a name
const KEYWORDS = new Set([
    'if', 'else', 'elif', 'for', 'foreach', 'while', 'do', 'switch', 'match', 'when', 'case',
    'catch', 'try', 'finally', 'return', 'new', 'delete', 'defer', 'select', 'with', 'except',
    'until', 'unless', 'begin', 'loop', 'sizeof', 'typeof', 'using', 'lock', 'synchronized',
    'assert', 'yield', 'await', 'raise', 'throw', 'print', 'super', 'this', 'in', 'of', 'not',
]);

// Definitions worth underlining, per Monaco language id
const jsPatterns = [
    /\bfunction\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/,
    /^\s*(?:export\s+)?(?:default\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b|\(|[A-Za-z_$][\w$]*\s*=>)/,
    /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/,
    /^\s{2,}(?:public\s+|private\s+|protected\s+|static\s+|async\s+|override\s+|\*\s*)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{\s*$/,
];
const braceMethodPatterns = [
    /^\s*(?:[\w<>\[\]?,.&*\s]+\s)\**([A-Za-z_]\w*)\s*\([^;]*\)\s*\{?\s*$/,
    /^\s*(?:public\s+|private\s+|protected\s+|internal\s+|abstract\s+|final\s+|sealed\s+|partial\s+)*(?:class|struct|interface|record|enum)\s+([A-Za-z_]\w*)/,
];

const DEF_PATTERNS: Record<string, RegExp[]> = {
    python: [/^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/, /^\s*class\s+([A-Za-z_]\w*)/],
    javascript: jsPatterns,
    typescript: jsPatterns,
    java: braceMethodPatterns,
    csharp: braceMethodPatterns,
    c: braceMethodPatterns,
    cpp: braceMethodPatterns,
    go: [/^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*\(/, /^\s*type\s+([A-Za-z_]\w*)\s+(?:struct|interface)\b/],
    rust: [/^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+([A-Za-z_]\w*)/, /^\s*(?:pub\s+)?(?:struct|enum|trait)\s+([A-Za-z_]\w*)/],
    kotlin: [/^\s*(?:\w+\s+)*fun\s+(?:<[^>]*>\s*)?([A-Za-z_]\w*)/, /^\s*(?:\w+\s+)*(?:class|object|interface)\s+([A-Za-z_]\w*)/],
    swift: [/^\s*(?:\w+\s+)*func\s+([A-Za-z_]\w*)/, /^\s*(?:\w+\s+)*(?:class|struct|enum|protocol|actor)\s+([A-Za-z_]\w*)/, /^\s*(?:\w+\s+)*init\s*\(/],
    ruby: [/^\s*def\s+(?:self\.)?([A-Za-z_]\w*[?!]?)/, /^\s*(?:class|module)\s+([A-Z]\w*)/],
    php: [/function\s+&?([A-Za-z_]\w*)\s*\(/, /^\s*(?:abstract\s+|final\s+)?(?:class|interface|trait|enum)\s+([A-Za-z_]\w*)/],
    sql: [/^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE|TRIGGER|VIEW|TABLE)\s+`?"?([\w.]+)/i],
};

const INDENT_LANGS = new Set(['python', 'ruby']);

function hash(text: string): string {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
    return h.toString(36);
}

function trimCache() {
    while (explainCache.size > MAX_CACHE) {
        const oldest = explainCache.keys().next().value;
        if (oldest === undefined) break;
        explainCache.delete(oldest);
    }
}

/** Grabs the code block starting at a definition line (indent- or brace-delimited). */
function extractBlock(model: any, startLine: number, langId: string): string {
    const total = model.getLineCount();
    const limit = Math.min(total, startLine + MAX_BLOCK_LINES);
    const lines: string[] = [model.getLineContent(startLine)];

    if (INDENT_LANGS.has(langId)) {
        const baseIndent = lines[0].match(/^\s*/)![0].length;
        for (let ln = startLine + 1; ln <= limit; ln++) {
            const text = model.getLineContent(ln);
            if (text.trim() !== '' && text.match(/^\s*/)![0].length <= baseIndent) {
                // ruby blocks close with an `end` at base indent — include it
                if (langId === 'ruby' && text.trim().startsWith('end')) lines.push(text);
                break;
            }
            lines.push(text);
        }
    } else {
        let depth = 0;
        let opened = false;
        for (let ln = startLine; ln <= limit; ln++) {
            const text = model.getLineContent(ln);
            if (ln > startLine) lines.push(text);
            for (const ch of text) {
                if (ch === '{') { depth++; opened = true; }
                else if (ch === '}') depth--;
            }
            if (opened && depth <= 0) break;
            // Definition without a block nearby (e.g. a declaration) — keep it short
            if (!opened && ln - startLine >= 3) break;
        }
    }
    return lines.join('\n');
}

async function explain(block: string, langId: string, name: string): Promise<string> {
    const prompt = `You are a friendly coding tutor. In 2-4 short sentences, explain to a learner what this ${langId} code block ("${name}") does: its purpose, its inputs and what it returns or changes, and one thing that is easy to get wrong (only if there is one). Use plain simple English. No headings, no bullet lists, do not repeat the code.

\`\`\`${langId}
${block}
\`\`\``;
    return generateContent(prompt);
}

function ensureHoverProvider(monaco: any, langId: string) {
    if (registeredLangs.has(langId) || !DEF_PATTERNS[langId]) return;
    registeredLangs.add(langId);

    monaco.languages.registerHoverProvider(langId, {
        provideHover: async (model: any, position: any, token: any) => {
            const hints = modelHints.get(model);
            const hit = hints?.find((h) => h.range.containsPosition(position));
            if (!hit) return null;

            const block = extractBlock(model, hit.line, langId);
            const key = `${langId}:${hit.name}:${hash(block)}`;

            let text = explainCache.get(key);
            if (!text) {
                let p = pendingExplains.get(key);
                if (!p) {
                    p = explain(block, langId, hit.name);
                    pendingExplains.set(key, p);
                    p.finally(() => pendingExplains.delete(key));
                }
                text = await p;
                // Don't cache failures so a retry can succeed
                if (text && !text.startsWith('Error generating') && !text.startsWith('Please set')) {
                    explainCache.set(key, text);
                    trimCache();
                }
            }

            if (token?.isCancellationRequested || !text) return null;
            return {
                range: hit.range,
                contents: [
                    { value: `**✦ Vylos AI · \`${hit.name}\`**` },
                    { value: text },
                ],
            };
        },
    });
}

function scanModel(editor: any, monaco: any) {
    const model = editor.getModel();
    if (!model) return;
    const langId = model.getLanguageId();
    const patterns = DEF_PATTERNS[langId];

    let collection = collections.get(editor);
    if (!collection) {
        collection = editor.createDecorationsCollection([]);
        collections.set(editor, collection);
    }

    if (!patterns) {
        collection.set([]);
        modelHints.set(model, []);
        return;
    }
    ensureHoverProvider(monaco, langId);

    const hints: Hint[] = [];
    const decorations: any[] = [];
    const total = Math.min(model.getLineCount(), MAX_SCAN_LINES);

    for (let ln = 1; ln <= total && hints.length < MAX_HINTS; ln++) {
        const text = model.getLineContent(ln);
        if (text.trim() === '' || text.trim().startsWith('//') || text.trim().startsWith('#')) continue;
        for (const pattern of patterns) {
            const m = text.match(pattern);
            const name = m?.[1];
            if (!m || !name || KEYWORDS.has(name)) continue;
            const idx = text.indexOf(name, m.index ?? 0);
            if (idx < 0) continue;
            const range = new monaco.Range(ln, idx + 1, ln, idx + 1 + name.length);
            hints.push({ range, name, line: ln });
            decorations.push({
                range,
                options: { inlineClassName: 'vylos-ai-hint', stickiness: 1 },
            });
            break; // one hint per line
        }
    }

    modelHints.set(model, hints);
    collection.set(decorations);
}

/** Call once per editor from onMount. Keeps underlines fresh as the code changes. */
export function setupAiCodeHints(editor: any, monaco: any) {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const rescanSoon = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => scanModel(editor, monaco), 600);
    };

    scanModel(editor, monaco);
    const subs = [
        editor.onDidChangeModelContent(rescanSoon),
        editor.onDidChangeModel(() => scanModel(editor, monaco)),
        editor.onDidChangeModelLanguage?.(() => scanModel(editor, monaco)),
    ];
    editor.onDidDispose?.(() => {
        if (timer) clearTimeout(timer);
        subs.forEach((s) => s?.dispose?.());
    });
}
