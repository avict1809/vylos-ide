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
