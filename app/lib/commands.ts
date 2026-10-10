'use client';

import { useFileStore } from './useFileStore';
import { useConfigStore } from './stores/config-store';
import { useTerminalStore } from './stores/terminal-store';
import { runActiveFile } from './run/run-file';
import { runEditorAction } from './editor-bridge';
import type { editor as MonacoEditor } from 'monaco-editor';

type MonacoApi = typeof import('monaco-editor');

/**
 * Every workbench command in one place: the command palette lists them, the
 * window's key handler (TitleBar) dispatches their shortcuts, and the editor
 * registers the same shortcuts so Monaco can't swallow them. Keys are
 * physical (KeyboardEvent.code), so they work on any keyboard layout.
 */

export interface Key {
    code: string;
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
}

/** One key, or two in a row like Ctrl+K Ctrl+O */
export type Binding = Key | { chord: [Key, Key] };

export interface Command {
    id: string;
    /** "Category: Name", as VS Code shows them */
    label: string;
    keys?: Binding[];
    run: () => void | Promise<void>;
}

const store = () => useFileStore.getState();

function saveAll() {
    const { openFiles, saveFile } = store();
    for (const file of openFiles) {
        if (file.isDirty && !file.path.startsWith('untitled')) void saveFile(file.path);
    }
}

function closeSavedEditors() {
    for (const file of store().openFiles.filter((f) => !f.isDirty)) store().closeFile(file.path);
}

function newTerminal() {
    store().setShowTerminal(true);
    void useTerminalStore.getState().newShell(store().projectRoot);
}

const zoomEditor = (delta: number) => {
    const { fontSize, setFontSize } = useConfigStore.getState();
    setFontSize(Math.min(32, Math.max(8, fontSize + delta)));
};

const ctrl = (code: string, extra: Omit<Key, 'code' | 'ctrl'> = {}): Key => ({ code, ctrl: true, ...extra });

export const COMMANDS: Command[] = [
    // View
    { id: 'workbench.commandPalette', label: 'View: Show All Commands', keys: [ctrl('KeyP', { shift: true }), { code: 'F1' }], run: () => store().setShowCommandPalette(true) },
    { id: 'workbench.quickOpen', label: 'Go to File…', keys: [ctrl('KeyP')], run: () => store().setShowQuickOpen(true) },
    { id: 'workbench.toggleSidebar', label: 'View: Toggle Side Bar Visibility', keys: [ctrl('KeyB')], run: () => store().toggleSidebar() },
    { id: 'workbench.toggleTerminal', label: 'View: Toggle Terminal', keys: [ctrl('Backquote')], run: () => store().toggleTerminal() },
    { id: 'workbench.togglePanel', label: 'View: Toggle Panel', keys: [ctrl('KeyJ')], run: () => store().toggleTerminal() },
    { id: 'workbench.newTerminal', label: 'Terminal: Create New Terminal', keys: [ctrl('Backquote', { shift: true })], run: newTerminal },
    { id: 'workbench.explorer', label: 'View: Show Explorer', keys: [ctrl('KeyE', { shift: true })], run: () => store().setActiveView('explorer') },
    { id: 'workbench.search', label: 'View: Show Search', keys: [ctrl('KeyF', { shift: true })], run: () => store().setActiveView('search') },
    { id: 'workbench.scm', label: 'View: Show Source Control', keys: [ctrl('KeyG', { shift: true })], run: () => store().setActiveView('git') },
    { id: 'workbench.extensions', label: 'View: Show Extensions', keys: [ctrl('KeyX', { shift: true })], run: () => store().setActiveView('extensions') },
    { id: 'workbench.ai', label: 'View: Show Vylos AI', keys: [ctrl('KeyI', { shift: true })], run: () => store().setActiveView('ai') },
    { id: 'workbench.learning', label: 'View: Show Learning Path', keys: [ctrl('KeyL', { shift: true })], run: () => store().setActiveView('learning') },
    { id: 'workbench.tutor', label: 'View: Show Voice Tutor Transcript', run: () => store().setActiveView('tutor') },
    { id: 'workbench.account', label: 'View: Show Account', run: () => store().setActiveView('account') },
    { id: 'workbench.settings', label: 'Preferences: Open Settings', keys: [ctrl('Comma')], run: () => store().setActiveView('settings') },
    { id: 'workbench.toggleVoice', label: 'Voice Tutor: Start or Stop', keys: [ctrl('KeyL')], run: () => { window.dispatchEvent(new CustomEvent('vylos:toggle-voice')); } },

    // File
    { id: 'file.new', label: 'File: New Text File', keys: [ctrl('KeyN')], run: () => store().createNewFile() },
    { id: 'file.open', label: 'File: Open File…', keys: [ctrl('KeyO')], run: () => store().openExternalFile() },
    { id: 'file.openFolder', label: 'File: Open Folder…', keys: [{ chord: [ctrl('KeyK'), ctrl('KeyO')] }], run: () => store().openFolder() },
    { id: 'file.save', label: 'File: Save', keys: [ctrl('KeyS')], run: () => store().saveActiveFile() },
    { id: 'file.saveAs', label: 'File: Save As…', keys: [ctrl('KeyS', { shift: true })], run: () => store().saveActiveFileAs() },
    { id: 'file.saveAll', label: 'File: Save All', keys: [{ chord: [ctrl('KeyK'), { code: 'KeyS' }] }], run: saveAll },

    // Editors and tabs
    {
        id: 'editor.close', label: 'View: Close Editor', keys: [ctrl('KeyW'), ctrl('F4')], run: () => {
            const { openFiles, activeFileIndex, closeFile } = store();
            if (activeFileIndex !== null && openFiles[activeFileIndex]) closeFile(openFiles[activeFileIndex].path);
        },
    },
    { id: 'editor.closeSaved', label: 'View: Close Saved Editors', keys: [{ chord: [ctrl('KeyK'), { code: 'KeyU' }] }], run: closeSavedEditors },
    { id: 'editor.reopenClosed', label: 'View: Reopen Closed Editor', keys: [ctrl('KeyT', { shift: true })], run: () => store().reopenClosedEditor() },
    { id: 'editor.next', label: 'View: Open Next Editor', keys: [ctrl('PageDown'), ctrl('Tab')], run: () => store().cycleTab(1) },
    { id: 'editor.previous', label: 'View: Open Previous Editor', keys: [ctrl('PageUp'), ctrl('Tab', { shift: true })], run: () => store().cycleTab(-1) },
    { id: 'editor.splitRight', label: 'View: Move Editor into Group Right', keys: [ctrl('Backslash')], run: () => store().moveEditorToNewGroup('right') },
    { id: 'editor.splitDown', label: 'View: Move Editor into Group Below', keys: [{ chord: [ctrl('KeyK'), ctrl('Backslash')] }], run: () => store().moveEditorToNewGroup('down') },
    { id: 'editor.goToLine', label: 'Go to Line/Column…', keys: [ctrl('KeyG')], run: () => { runEditorAction('editor.action.gotoLine'); } },

    // Editor settings
    {
        id: 'editor.toggleWordWrap', label: 'View: Toggle Word Wrap', keys: [{ code: 'KeyZ', alt: true }], run: () => {
            const { wordWrap, setWordWrap } = useConfigStore.getState();
            setWordWrap(wordWrap === 'on' ? 'off' : 'on');
        },
    },
    { id: 'editor.toggleMinimap', label: 'View: Toggle Minimap', run: () => { const c = useConfigStore.getState(); c.setMinimapEnabled(!c.minimapEnabled); } },
    { id: 'editor.fontZoomIn', label: 'Editor Font Zoom In', run: () => zoomEditor(1) },
    { id: 'editor.fontZoomOut', label: 'Editor Font Zoom Out', run: () => zoomEditor(-1) },

    // Run and help
    { id: 'run.activeFile', label: 'Run: Run Active File', keys: [{ code: 'F5' }], run: () => runActiveFile() },
    { id: 'help.about', label: 'Help: About Vylos', run: () => store().setShowAbout(true) },
];

const KEY_NAMES: Record<string, string> = {
    Backquote: '`', Backslash: '\\', Comma: ',', PageDown: 'PageDown', PageUp: 'PageUp', Tab: 'Tab',
};

function keyName(code: string): string {
    if (KEY_NAMES[code]) return KEY_NAMES[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    return code;
}

function formatKey(key: Key): string {
    return [key.ctrl && 'Ctrl', key.shift && 'Shift', key.alt && 'Alt', keyName(key.code)].filter(Boolean).join('+');
}

/** "Ctrl+Shift+P", or "Ctrl+K Ctrl+O" for a chord */
export function formatBinding(binding: Binding): string {
    return 'chord' in binding ? binding.chord.map(formatKey).join(' ') : formatKey(binding);
}

export const commandById = (id: string) => COMMANDS.find((c) => c.id === id);

const matches = (key: Key, e: KeyboardEvent) =>
    e.code === key.code
    && !!key.ctrl === (e.ctrlKey || e.metaKey)
    && !!key.shift === e.shiftKey
    && !!key.alt === e.altKey;

let pendingChord: { key: Key; until: number } | null = null;

/**
 * Runs the command bound to a key press, if any, and says whether it did.
 * Handles two-key chords: after Ctrl+K the next press is matched against
 * chords that start with it, for two seconds.
 */
export function dispatchShortcut(e: KeyboardEvent): boolean {
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return false;

    if (pendingChord && Date.now() < pendingChord.until) {
        const first = pendingChord.key;
        pendingChord = null;
        for (const command of COMMANDS) {
            for (const binding of command.keys ?? []) {
                if ('chord' in binding && binding.chord[0].code === first.code && matches(binding.chord[1], e)) {
                    e.preventDefault();
                    void command.run();
                    return true;
                }
            }
        }
        return false;
    }
    pendingChord = null;

    for (const command of COMMANDS) {
        for (const binding of command.keys ?? []) {
            if ('chord' in binding) {
                if (matches(binding.chord[0], e)) {
                    e.preventDefault();
                    pendingChord = { key: binding.chord[0], until: Date.now() + 2000 };
                    return true;
                }
            } else if (matches(binding, e)) {
                e.preventDefault();
                void command.run();
                return true;
            }
        }
    }
    return false;
}

/**
 * The same shortcuts as Monaco keybindings, so a focused editor runs them
 * instead of keeping the keys for itself (F1, Ctrl+G, …). Takes the monaco
 * namespace; returns nothing Monaco doesn't know.
 */
export function registerEditorShortcuts(editor: MonacoEditor.IStandaloneCodeEditor, monaco: MonacoApi) {
    const toMonaco = (key: Key): number | null => {
        const code = monaco.KeyCode[key.code as keyof typeof monaco.KeyCode];
        if (code === undefined) return null;
        return (key.ctrl ? monaco.KeyMod.CtrlCmd : 0) | (key.shift ? monaco.KeyMod.Shift : 0) | (key.alt ? monaco.KeyMod.Alt : 0) | code;
    };
    for (const command of COMMANDS) {
        // Go to Line is Monaco's own; everything else becomes an editor action
        if (!command.keys || command.id === 'editor.goToLine') continue;
        const keybindings = command.keys
            .map((b) => {
                if (!('chord' in b)) return toMonaco(b);
                const [first, second] = b.chord.map(toMonaco);
                return first !== null && second !== null ? monaco.KeyMod.chord(first, second) : null;
            })
            .filter((k): k is number => k !== null);
        if (keybindings.length === 0) continue;
        editor.addAction({ id: `vylos-${command.id}`, label: command.label, keybindings, run: () => command.run() });
    }
}
