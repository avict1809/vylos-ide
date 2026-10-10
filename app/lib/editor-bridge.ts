'use client';

// Registry giving non-React code (the voice tutor's tools) access to the live
// Monaco editor instance for highlighting and scrolling — the tutor's way of
// "pointing at" code while explaining it.

let editor: any = null;
let monacoApi: any = null;
let decorationIds: string[] = [];

export function registerEditor(editorInstance: any, monaco: any) {
    editor = editorInstance;
    monacoApi = monaco;
}

export function unregisterEditor(editorInstance: any) {
    if (editor === editorInstance) {
        editor = null;
        monacoApi = null;
        decorationIds = [];
    }
}

export function highlightLines(startLine: number, endLine: number): boolean {
    if (!editor || !monacoApi) return false;
    const model = editor.getModel();
    if (!model) return false;

    const maxLine = model.getLineCount();
    const start = Math.max(1, Math.min(startLine, maxLine));
    const end = Math.max(start, Math.min(endLine, maxLine));

    decorationIds = editor.deltaDecorations(decorationIds, [
        {
            range: new monacoApi.Range(start, 1, end, model.getLineMaxColumn(end)),
            options: {
                isWholeLine: true,
                className: 'vylos-tutor-highlight',
                linesDecorationsClassName: 'vylos-tutor-highlight-gutter',
            },
        },
    ]);
    editor.revealLinesInCenter(start, end);
    return true;
}

export function clearHighlights() {
    if (editor && decorationIds.length > 0) {
        decorationIds = editor.deltaDecorations(decorationIds, []);
    }
}

/** Monaco language id of the file in the editor, e.g. 'python' */
export function getActiveLanguageId(): string | null {
    return editor?.getModel()?.getLanguageId() ?? null;
}

export function revealLine(line: number) {
    if (!editor) return;
    editor.revealLine(Math.max(1, line));
}

// --- Status bar and command palette ----------------------------------------

type CodeEditor = import('monaco-editor').editor.IStandaloneCodeEditor;

export interface EditorStatus {
    line: number;
    column: number;
    /** Characters selected (0 when there's only a cursor) */
    selectedChars: number;
    /** More than one cursor or selection */
    cursors: number;
    tabSize: number;
    insertSpaces: boolean;
    eol: 'LF' | 'CRLF';
    languageId: string;
}

let status: EditorStatus | null = null;
const statusListeners = new Set<() => void>();

function publish(next: EditorStatus | null) {
    status = next;
    statusListeners.forEach((listener) => listener());
}

function readStatus(instance: CodeEditor): EditorStatus | null {
    const model = instance.getModel();
    const selections = instance.getSelections() ?? [];
    const position = instance.getPosition();
    if (!model || !position) return null;
    const options = model.getOptions();
    return {
        line: position.lineNumber,
        column: position.column,
        selectedChars: selections.reduce((sum, s) => sum + model.getValueLengthInRange(s), 0),
        cursors: selections.length,
        tabSize: options.tabSize,
        insertSpaces: options.insertSpaces,
        eol: model.getEOL() === '\r\n' ? 'CRLF' : 'LF',
        languageId: model.getLanguageId(),
    };
}

/** Keeps the status bar in step with an editor while it's the focused one. */
export function trackEditorStatus(instance: CodeEditor) {
    const update = () => {
        if (instance === editor) publish(readStatus(instance));
    };
    instance.onDidChangeCursorSelection(update);
    instance.onDidFocusEditorWidget(update);
    instance.onDidChangeModel(update);
    instance.onDidChangeModelLanguage(update);
    instance.onDidChangeModelOptions(update);
    instance.onDidDispose(() => {
        if (status && instance === editor) publish(null);
    });
    update();
}

/** For useSyncExternalStore in the status bar. */
export const editorStatus = {
    subscribe(listener: () => void) {
        statusListeners.add(listener);
        return () => statusListeners.delete(listener);
    },
    get: () => status,
};

/** Runs one of the focused editor's own commands, e.g. 'editor.action.gotoLine'. */
export function runEditorAction(id: string): boolean {
    if (!editor) return false;
    editor.focus();
    const action = editor.getAction?.(id);
    if (action) {
        void action.run();
        return true;
    }
    editor.trigger('command', id, null);
    return true;
}

/** The focused editor's own commands (comment, format, go to line, …), for the command palette. */
export function editorActions(): { id: string; label: string }[] {
    const actions: { id: string; label: string }[] = (editor as CodeEditor | null)?.getSupportedActions() ?? [];
    return actions
        .filter((a) => a.label && !a.id.startsWith('vylos-'))
        .map((a) => ({ id: a.id, label: a.label }));
}

/** "Python" for 'python', as the status bar shows languages. */
export function languageName(id: string): string {
    const languages: { id: string; aliases?: string[] }[] = monacoApi?.languages?.getLanguages?.() ?? [];
    return languages.find((l) => l.id === id)?.aliases?.[0] ?? (id === 'plaintext' ? 'Plain Text' : id);
}
