'use client';

import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';

/**
 * The xterm.js instances behind the terminal tabs. They live here rather than
 * in React so a tab keeps its screen and scrollback while the terminal panel
 * is hidden or another tab is showing: each one draws into its own element,
 * which the panel attaches and detaches.
 *
 * xterm is imported on demand because it needs `window`, and this module is
 * also loaded while the static export is rendered.
 */

interface Host {
    el: HTMLDivElement;
    term: Terminal | null;
    fit: FitAddon | null;
    opened: boolean;
    /** Output that arrived before xterm finished loading */
    pending: string[];
    /** focus() was called before the terminal was on screen */
    wantsFocus: boolean;
    ready: Promise<void>;
    disposed: boolean;
}

export interface HostCallbacks {
    onInput: (data: string) => void;
    onResize: (cols: number, rows: number) => void;
}

const hosts = new Map<string, Host>();

const THEME = {
    background: '#09090b',
    foreground: '#d4d4d8',
    cursor: '#4ec9b0',
    cursorAccent: '#09090b',
    selectionBackground: '#4ec9b04d',
    black: '#27272a',
    red: '#f87171',
    green: '#4ade80',
    yellow: '#facc15',
    blue: '#60a5fa',
    magenta: '#c084fc',
    cyan: '#22d3ee',
    white: '#d4d4d8',
    brightBlack: '#71717a',
    brightRed: '#fca5a5',
    brightGreen: '#86efac',
    brightYellow: '#fde047',
    brightBlue: '#93c5fd',
    brightMagenta: '#d8b4fe',
    brightCyan: '#67e8f9',
    brightWhite: '#fafafa',
};

/**
 * App shortcuts that still work while the terminal has focus. Everything else
 * goes to the shell, because Ctrl+L, Ctrl+B, Ctrl+K, Ctrl+P… are everyday
 * shell keys there.
 */
export function isAppShortcut(e: KeyboardEvent): boolean {
    if (e.key === 'F5') return true;
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return false;
    if (e.code === 'Backquote') return true;
    // Ctrl+Shift+C / V are the terminal's own copy and paste
    if (e.shiftKey) return e.code !== 'KeyC' && e.code !== 'KeyV';
    // Save (Ctrl+S would otherwise freeze the terminal with XOFF) and Quick Open
    return e.code === 'KeyS' || e.code === 'KeyP';
}

export const isInTerminal = (target: EventTarget | null) =>
    target instanceof Element && !!target.closest('.xterm');

function monoFont(): string {
    const fromNextFont = getComputedStyle(document.body).getPropertyValue('--font-geist-mono').trim();
    return `${fromNextFont ? `${fromNextFont}, ` : ''}'Geist Mono', ui-monospace, 'DejaVu Sans Mono', Menlo, Consolas, monospace`;
}

async function load(host: Host, callbacks: HostCallbacks) {
    const [{ Terminal }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
        import('@xterm/addon-web-links'),
    ]);
    // xterm measures a character once when it opens: the font has to be there first
    await document.fonts?.ready;
    if (host.disposed) return;

    const term = new Terminal({
        fontFamily: monoFont(),
        fontSize: 13,
        lineHeight: 1.2,
        theme: THEME,
        cursorBlink: true,
        scrollback: 5000,
        allowProposedApi: false,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    // The main process sends http(s) links to the system browser
    term.loadAddon(new WebLinksAddon((_event, uri) => window.open(uri)));

    term.attachCustomKeyEventHandler((e) => {
        if (e.type !== 'keydown') return true;
        const ctrl = e.ctrlKey || e.metaKey;
        // Copy: Ctrl+Shift+C, or Ctrl+C while text is selected (otherwise Ctrl+C stops the program)
        if (ctrl && e.code === 'KeyC' && (e.shiftKey || term.hasSelection())) {
            if (term.hasSelection()) {
                void navigator.clipboard?.writeText(term.getSelection());
                term.clearSelection();
            }
            e.preventDefault();
            return false;
        }
        // Paste: let the browser fire its paste event, which xterm turns into input
        if (ctrl && e.code === 'KeyV') return false;
        return !isAppShortcut(e);
    });

    term.onData(callbacks.onInput);
    term.onResize(({ cols, rows }) => callbacks.onResize(cols, rows));

    host.term = term;
    host.fit = fit;
    for (const chunk of host.pending) term.write(chunk);
    host.pending = [];
}

export function createHost(id: string, callbacks: HostCallbacks) {
    if (hosts.has(id)) return;
    const el = document.createElement('div');
    el.style.width = '100%';
    el.style.height = '100%';
    const host: Host = { el, term: null, fit: null, opened: false, pending: [], wantsFocus: false, ready: Promise.resolve(), disposed: false };
    host.ready = load(host, callbacks).catch((e) => console.error('[terminal] xterm failed to load', e));
    hosts.set(id, host);
}

export function write(id: string, data: string) {
    const host = hosts.get(id);
    if (!host) return;
    if (host.term) host.term.write(data);
    else host.pending.push(data);
}

/** Writes on a fresh line: adds a line break first if the cursor isn't at the start of one. */
export function writeLine(id: string, text: string) {
    const host = hosts.get(id);
    if (!host) return;
    const midLine = host.term
        ? host.term.buffer.active.cursorX > 0
        : !/(^|\n)$/.test(host.pending.join('').slice(-1));
    write(id, `${midLine ? '\r\n' : ''}${text}\r\n`);
}

/** True if nothing has been written to the tab yet. */
export function isEmpty(id: string): boolean {
    const host = hosts.get(id);
    if (!host) return true;
    if (!host.term) return host.pending.length === 0;
    const buffer = host.term.buffer.active;
    return buffer.length <= 1 && buffer.cursorX === 0 && buffer.cursorY === 0;
}

export function fit(id: string) {
    const host = hosts.get(id);
    if (!host?.term || !host.fit || !host.opened || !host.el.isConnected) return;
    try {
        host.fit.fit();
    } catch {
        /* the panel is collapsed to zero size */
    }
}

/** Shows a tab's terminal inside `container`, replacing whatever tab was there. */
export function attach(id: string, container: HTMLElement) {
    const host = hosts.get(id);
    if (!host) return;
    for (const child of Array.from(container.children)) {
        if (child !== host.el) child.remove();
    }
    if (host.el.parentElement !== container) container.appendChild(host.el);
    void host.ready.then(() => {
        if (!host.term || host.disposed || host.el.parentElement !== container) return;
        if (!host.opened) {
            host.term.open(host.el);
            host.opened = true;
        }
        fit(id);
        host.term.refresh(0, host.term.rows - 1);
        if (host.wantsFocus) {
            host.wantsFocus = false;
            host.term.focus();
        }
    });
}

export function detach(id: string) {
    hosts.get(id)?.el.remove();
}

/** Gives the tab's terminal the keyboard, now or as soon as it's on screen. */
export function focus(id: string) {
    const host = hosts.get(id);
    if (!host) return;
    if (host.term && host.opened && host.el.isConnected) host.term.focus();
    else host.wantsFocus = true;
}

export function size(id: string): { cols: number; rows: number } | null {
    const term = hosts.get(id)?.term;
    return term && hosts.get(id)?.opened ? { cols: term.cols, rows: term.rows } : null;
}

export function clear(id: string) {
    const host = hosts.get(id);
    if (host?.term) host.term.clear();
    else if (host) host.pending = [];
}

export function disposeHost(id: string) {
    const host = hosts.get(id);
    if (!host) return;
    host.disposed = true;
    host.el.remove();
    host.term?.dispose();
    hosts.delete(id);
}
