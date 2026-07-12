'use client';

import { create } from 'zustand';

export interface TermRun {
    id: number;
    command: string;
    cwd: string | null;
    output: string;
    running: boolean;
    exitCode: number | null;
    timedOut: boolean;
}

const MAX_RUNS = 30;
const MAX_UI_OUTPUT = 100_000;

interface TerminalStore {
    runs: TermRun[];
    initialized: boolean;

    /** Subscribes to run events from the main process. Safe to call once. */
    init: () => void;
    /** Runs a command and resolves with its final result. Output streams into `runs`. */
    runCommand: (command: string, cwd?: string, timeoutMs?: number) =>
        Promise<{ exitCode: number; output: string; timedOut: boolean; error?: string }>;
    kill: (runId: number) => void;
    clear: () => void;
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
    runs: [],
    initialized: false,

    init: () => {
        if (get().initialized || !window.electron?.term) return;
        set({ initialized: true });

        window.electron.term.onStarted(({ runId, command, cwd }) => {
            set((s) => ({
                runs: [...s.runs, { id: runId, command, cwd, output: '', running: true, exitCode: null, timedOut: false }].slice(-MAX_RUNS),
            }));
        });

        window.electron.term.onOutput(({ runId, chunk }) => {
            set((s) => ({
                runs: s.runs.map((r) => {
                    if (r.id !== runId) return r;
                    const output = (r.output + chunk);
                    return { ...r, output: output.length > MAX_UI_OUTPUT ? output.slice(-MAX_UI_OUTPUT) : output };
                }),
            }));
        });

        window.electron.term.onExit(({ runId, exitCode, timedOut, error }) => {
            set((s) => ({
                runs: s.runs.map((r) =>
                    r.id === runId
                        ? { ...r, running: false, exitCode, timedOut, output: error ? r.output + `\n${error}` : r.output }
                        : r
                ),
            }));
        });
    },

    runCommand: async (command, cwd, timeoutMs) => {
        if (!window.electron?.term) {
            return { exitCode: -1, output: '', timedOut: false, error: 'Terminal unavailable outside the desktop app.' };
        }
        const result = await window.electron.term.run({ command, cwd, timeoutMs });
        return { exitCode: result.exitCode, output: result.output, timedOut: !!result.timedOut, error: result.error };
    },

    kill: (runId) => {
        window.electron?.term?.kill(runId);
    },

    clear: () => set((s) => ({ runs: s.runs.filter((r) => r.running) })),
}));
