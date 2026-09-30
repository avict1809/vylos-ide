'use client';

import { create } from 'zustand';
import * as host from '../terminal/xterm-host';

/** Who started a run: the learner (Run button), the voice tutor, or an extension. */
export type RunSource = 'user' | 'tutor' | 'extension';

export interface TermTab {
    id: string;
    kind: 'shell' | 'run';
    title: string;
    source?: RunSource;
    /** The terminal process currently attached to this tab */
    processId: number | null;
    running: boolean;
    /** How the last run in a run tab ended */
    status: 'idle' | 'ok' | 'failed' | 'stopped';
    /** The file being run by the Run button, if that's what is running */
    target?: string;
}

/** A finished or running command, kept so the tutor can see what happened. */
export interface TermRun {
    id: number;
    tabId: string;
    source: RunSource;
    command: string;
    cwd: string | null;
    running: boolean;
    exitCode: number | null;
    timedOut: boolean;
    /** Plain text, without colors; the end of the output if it was long */
    output: string;
    /** The file the Run button ran, if that's what this was */
    target?: string;
}

export interface RunCommandResult {
    exitCode: number;
    output: string;
    timedOut: boolean;
    error?: string;
}

const MAX_RUNS = 20;
const MAX_RUN_OUTPUT = 20_000;
const DEFAULT_TIMEOUT_MS = 30_000;

// Run tabs are shared per source, so repeated runs land in the same place
const RUN_TABS: Record<RunSource, { id: string; title: string }> = {
    user: { id: 'run', title: 'Run' },
    tutor: { id: 'tutor', title: 'Voice Tutor' },
    extension: { id: 'extension', title: 'Extensions' },
};

const SOURCE_NOTE: Record<RunSource, string> = {
    user: '',
    tutor: 'run by the voice tutor',
    extension: 'run by an extension',
};

const style = {
    dim: (s: string) => `\x1b[90m${s}\x1b[0m`,
    green: (s: string) => `\x1b[32m${s}\x1b[0m`,
    red: (s: string) => `\x1b[31m${s}\x1b[0m`,
    yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
    bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

// Routing for output events: terminal process id → tab id
const processTabs = new Map<number, string>();
// The run currently going in each run tab, so a new one can wait for it to stop
const activeRuns = new Map<string, Promise<unknown>>();
const stoppedByUser = new Set<number>();
let shellCount = 0;
let startingShell = false;

interface TerminalStore {
    info: TermInfo | null;
    tabs: TermTab[];
    activeTabId: string | null;
    runs: TermRun[];
    initialized: boolean;

    /** Subscribes to terminal events from the main process. Safe to call more than once. */
    init: () => void;
    /** Opens a new interactive shell tab. */
    newShell: (cwd?: string | null) => Promise<void>;
    /** Opens a shell if there are no tabs yet (the first time the panel is shown). */
    ensureShell: (cwd?: string | null) => void;
    setActiveTab: (id: string) => void;
    closeTab: (id: string) => void;
    /** Stops the process in a tab. */
    stop: (id: string) => void;
    clearTab: (id: string) => void;
    /** Shows a message in the learner's Run tab (e.g. "can't run this file"). */
    notice: (text: string) => void;
    /**
     * Runs a command in a run tab and resolves when it exits. The learner sees
     * it live and can type into it. timeoutMs null = no limit.
     */
    runCommand: (command: string, cwd?: string, timeoutMs?: number | null, opts?: { source?: RunSource; target?: string }) =>
        Promise<RunCommandResult>;
}

export const useTerminalStore = create<TerminalStore>((set, get) => {
    const patchTab = (id: string, patch: Partial<TermTab>) =>
        set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));

    const addTab = (tab: TermTab) => {
        host.createHost(tab.id, {
            onInput: (data) => {
                const current = get().tabs.find((t) => t.id === tab.id);
                if (current?.running && current.processId !== null) void window.electron.term.input(current.processId, data);
            },
            onResize: (cols, rows) => {
                const current = get().tabs.find((t) => t.id === tab.id);
                if (current?.processId != null) void window.electron.term.resize(current.processId, cols, rows);
            },
        });
        set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
    };

    const removeTab = (id: string) => {
        host.disposeHost(id);
        set((s) => {
            const index = s.tabs.findIndex((t) => t.id === id);
            const tabs = s.tabs.filter((t) => t.id !== id);
            const activeTabId = s.activeTabId === id
                ? (tabs[Math.min(index, tabs.length - 1)]?.id ?? null)
                : s.activeTabId;
            return { tabs, activeTabId };
        });
    };

    /** Picks the tab a run goes to, opening one if needed, and reserves it. */
    const acquireRunTab = async (source: RunSource): Promise<string> => {
        const base = RUN_TABS[source];
        const existing = get().tabs.find((t) => t.id === base.id);
        if (existing?.running && source === 'user') {
            // Pressing Run again restarts the program
            get().stop(base.id);
            await activeRuns.get(base.id);
        }
        const tab = get().tabs.find((t) => t.id === base.id);
        if (tab && !tab.running) {
            patchTab(tab.id, { running: true });
            set({ activeTabId: tab.id });
            return tab.id;
        }
        if (!tab) {
            addTab({ id: base.id, kind: 'run', title: base.title, source, processId: null, running: true, status: 'idle' });
            return base.id;
        }
        // The tutor or an extension is still busy in its tab: use another one
        let n = 2;
        while (get().tabs.some((t) => t.id === `${base.id}-${n}`)) n++;
        addTab({ id: `${base.id}-${n}`, kind: 'run', title: `${base.title} ${n}`, source, processId: null, running: true, status: 'idle' });
        return `${base.id}-${n}`;
    };

    const recordRun = (run: TermRun) =>
        set((s) => ({ runs: [...s.runs.filter((r) => r.id !== run.id), run].slice(-MAX_RUNS) }));

    return {
        info: null,
        tabs: [],
        activeTabId: null,
        runs: [],
        initialized: false,

        init: () => {
            if (get().initialized || !window.electron?.term) return;
            set({ initialized: true });
            const term = window.electron.term;

            void term.info().then((info) => set({ info }));

            term.onStarted(({ runId, tag }) => {
                if (!tag || !get().tabs.some((t) => t.id === tag)) return;
                processTabs.set(runId, tag);
                patchTab(tag, { processId: runId, running: true });
                // The process starts at a default size; tell it the real one
                const dims = host.size(tag);
                if (dims) void term.resize(runId, dims.cols, dims.rows);
            });

            term.onOutput(({ runId, chunk }) => {
                const tabId = processTabs.get(runId);
                if (tabId) host.write(tabId, chunk);
            });

            term.onExit(({ runId }) => {
                const tabId = processTabs.get(runId);
                processTabs.delete(runId);
                if (!tabId) return;
                const tab = get().tabs.find((t) => t.id === tabId);
                if (!tab || tab.processId !== runId) return;
                if (tab.kind === 'shell') {
                    // Typing `exit` closes the tab, like in VS Code
                    removeTab(tabId);
                } else {
                    patchTab(tabId, { processId: null });
                }
            });
        },

        newShell: async (cwd) => {
            if (!window.electron?.term) return;
            get().init();
            const id = `shell-${++shellCount}`;
            const title = get().info?.shell ?? 'shell';
            addTab({ id, kind: 'shell', title, processId: null, running: true, status: 'idle' });
            host.focus(id);
            const dims = host.size(id);
            const result = await window.electron.term.shell({ cwd: cwd ?? undefined, tag: id, ...dims });
            if ('error' in result) {
                host.writeLine(id, style.red(result.error));
                patchTab(id, { running: false });
            } else {
                patchTab(id, { title: result.name });
            }
        },

        ensureShell: (cwd) => {
            if (startingShell || get().tabs.length > 0) return;
            const info = get().info;
            if (!info?.interactive) return;
            startingShell = true;
            void get().newShell(cwd).finally(() => { startingShell = false; });
        },

        setActiveTab: (id) => {
            set({ activeTabId: id });
            host.focus(id);
        },

        closeTab: (id) => {
            const tab = get().tabs.find((t) => t.id === id);
            if (!tab) return;
            if (tab.processId !== null) {
                stoppedByUser.add(tab.processId);
                void window.electron?.term.kill(tab.processId);
            }
            removeTab(id);
        },

        stop: (id) => {
            const tab = get().tabs.find((t) => t.id === id);
            if (tab?.processId == null) return;
            stoppedByUser.add(tab.processId);
            void window.electron.term.kill(tab.processId);
        },

        clearTab: (id) => host.clear(id),

        notice: (text) => {
            const { id, title } = RUN_TABS.user;
            if (!get().tabs.some((t) => t.id === id)) {
                addTab({ id, kind: 'run', title, source: 'user', processId: null, running: false, status: 'idle' });
            }
            set({ activeTabId: id });
            host.writeLine(id, style.yellow(text));
        },

        runCommand: async (command, cwd, timeoutMs = DEFAULT_TIMEOUT_MS, opts) => {
            if (!window.electron?.term) {
                return { exitCode: -1, output: '', timedOut: false, error: 'Terminal unavailable outside the desktop app.' };
            }
            get().init();
            const source = opts?.source ?? 'tutor';
            const tabId = await acquireRunTab(source);
            patchTab(tabId, { target: opts?.target });
            // The learner's own program gets the keyboard, so input() / Scanner / cin just work
            if (source === 'user') host.focus(tabId);

            const folder = cwd ? cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd : '~';
            const note = SOURCE_NOTE[source];
            if (!host.isEmpty(tabId)) host.write(tabId, '\r\n');
            host.writeLine(tabId, `${style.dim(folder)} ${style.green('❯')} ${style.bold(command)}${note ? style.dim(`  · ${note}`) : ''}`);
            if (get().info && !get().info!.interactive) {
                host.writeLine(tabId, style.dim('(Typing into programs isn\'t available: the interactive terminal failed to load.)'));
            }

            const dims = host.size(tabId);
            const pending = window.electron.term.run({ command, cwd, timeoutMs, tag: tabId, ...dims });
            activeRuns.set(tabId, pending);
            let result: Awaited<typeof pending>;
            try {
                result = await pending;
            } finally {
                activeRuns.delete(tabId);
            }

            const stopped = stoppedByUser.delete(result.runId);
            let status: TermTab['status'];
            if (stopped) {
                status = 'stopped';
                host.writeLine(tabId, style.yellow('■ Stopped'));
            } else if (result.timedOut) {
                status = 'stopped';
                const seconds = Math.round((timeoutMs ?? DEFAULT_TIMEOUT_MS) / 1000);
                host.writeLine(tabId, style.yellow(`⏱ Stopped: reached the ${seconds}s time limit`));
            } else if (result.error && result.exitCode === -1) {
                status = 'failed';
                host.writeLine(tabId, style.red(`✗ Couldn't start: ${result.error}`));
            } else if (result.exitCode === 0) {
                status = 'ok';
                host.writeLine(tabId, style.dim(`${style.green('✓')} Finished`));
            } else {
                status = 'failed';
                host.writeLine(tabId, style.red(`✗ Exited with code ${result.exitCode}`) + style.dim('  · "Explain" above can help'));
            }
            patchTab(tabId, { running: false, processId: null, status, target: undefined });

            recordRun({
                id: result.runId,
                tabId,
                source,
                command,
                cwd: cwd ?? null,
                running: false,
                exitCode: result.exitCode,
                timedOut: !!result.timedOut,
                output: result.output.slice(-MAX_RUN_OUTPUT),
                target: opts?.target,
            });

            return {
                exitCode: result.exitCode,
                output: result.output,
                timedOut: !!result.timedOut,
                ...(stopped ? { error: 'Stopped by the learner' } : result.error ? { error: result.error } : {}),
            };
        },
    };
});
