'use client';

import { getCoaches, onCoachesChanged, CoachNote } from './coach-registry';

/**
 * Runs the registered coaches over the open file and shows their notes as
 * editor markers (squiggles with a hover message), refreshed shortly after
 * the learner stops typing.
 */

const DEBOUNCE_MS = 700;
const MAX_NOTES = 100;
const OWNER_PREFIX = 'vylos-coach:';

// model -> marker owners currently set on it, so stale coaches can be cleared
const owners = new WeakMap<object, Set<string>>();

function toMarker(monaco: any, model: any, note: CoachNote, source: string) {
    const lines = model.getLineCount();
    const line = Math.min(Math.max(1, Math.floor(note.line) || 1), lines);
    const endLine = Math.min(Math.max(line, Math.floor(note.endLine ?? line)), lines);
    const endColumn = note.endColumn ?? model.getLineMaxColumn(endLine);
    return {
        startLineNumber: line,
        startColumn: Math.max(1, note.column ?? model.getLineFirstNonWhitespaceColumn(line) ?? 1),
        endLineNumber: endLine,
        endColumn: Math.max(1, endColumn),
        message: note.why ? `${note.message}\n\nWhy it matters: ${note.why}` : note.message,
        severity: note.severity === 'warning' ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Info,
        source,
    };
}

/** Call once per editor from onMount. */
export function setupCoaching(editor: any, monaco: any) {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let run = 0;

    const coach = async () => {
        const model = editor.getModel();
        if (!model) return;
        const current = ++run;
        const languageId = model.getLanguageId();
        const applicable = getCoaches(languageId);
        const set = owners.get(model) ?? new Set<string>();
        owners.set(model, set);

        // Clear notes from coaches that were removed or don't read this language
        for (const owner of [...set]) {
            if (!applicable.some((c) => OWNER_PREFIX + c.id === owner)) {
                monaco.editor.setModelMarkers(model, owner, []);
                set.delete(owner);
            }
        }

        const request = { code: model.getValue(), languageId, path: model.uri?.path };
        await Promise.all(applicable.map(async (c) => {
            let notes: CoachNote[] = [];
            try {
                notes = await c.check(request);
            } catch {
                notes = []; // a failing coach shows nothing rather than stale notes
            }
            // The code changed while this coach was reading it
            if (current !== run || model.isDisposed?.()) return;
            const owner = OWNER_PREFIX + c.id;
            monaco.editor.setModelMarkers(model, owner, notes.slice(0, MAX_NOTES).map((n) => toMarker(monaco, model, n, c.label)));
            set.add(owner);
        }));
    };

    const coachSoon = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void coach(), DEBOUNCE_MS);
    };

    void coach();
    const stopListening = onCoachesChanged(coachSoon);
    const subs = [
        editor.onDidChangeModelContent(coachSoon),
        editor.onDidChangeModel(() => void coach()),
        editor.onDidChangeModelLanguage?.(() => void coach()),
    ];
    editor.onDidDispose?.(() => {
        if (timer) clearTimeout(timer);
        stopListening();
        subs.forEach((s) => s?.dispose?.());
    });
}
