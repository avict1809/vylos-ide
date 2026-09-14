'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Permission } from '../extensions/validate';

export type ExtensionStatus = 'active' | 'error' | 'skipped' | 'needs-approval';

/** What the Extensions panel shows for one folder in the extensions folder. */
export interface ExtensionInfo {
    folder: string;
    path: string;
    /** `<publisher>.<name>`, once package.json is readable */
    id?: string;
    displayName: string;
    publisher?: string;
    version?: string;
    description?: string;
    status: ExtensionStatus;
    errors: string[];
    warnings: string[];
    /** Registered course ids (only while active) */
    courses: { id: string; title: string }[];
    /** Has a "main" file: its code runs only after the learner approves it */
    runsCode: boolean;
    permissions: Permission[];
    /** Permissions asked for since the learner last approved it */
    newPermissions: Permission[];
}

export type RuntimeState = 'starting' | 'running' | 'failed';

export interface ExtensionRuntime {
    state: RuntimeState;
    error?: string;
    /** What the running code has registered, e.g. "Coach: Python Coach" */
    contributions: { reg: number; label: string }[];
}

export interface LogLine {
    level: 'log' | 'info' | 'warn' | 'error' | 'debug';
    text: string;
    at: number;
}

const MAX_LOG_LINES = 200;

interface ExtensionStore {
    /** The extensions folder, known after the first scan */
    dir: string | null;
    extensions: ExtensionInfo[];
    loading: boolean;
    /** Why the last scan failed as a whole, if it did */
    error: string | null;
    runtime: Record<string, ExtensionRuntime>;
    logs: Record<string, LogLine[]>;
    set: (state: Partial<Pick<ExtensionStore, 'dir' | 'extensions' | 'loading' | 'error' | 'runtime'>>) => void;
    updateRuntime: (extId: string, update: (current: ExtensionRuntime) => ExtensionRuntime) => void;
    log: (extId: string, level: LogLine['level'], text: string) => void;
}

// Not persisted: the extensions folder on disk is the source of truth
export const useExtensionStore = create<ExtensionStore>()((set) => ({
    dir: null,
    extensions: [],
    loading: false,
    error: null,
    runtime: {},
    logs: {},
    set: (state) => set(state),
    updateRuntime: (extId, update) =>
        set((s) => ({
            runtime: { ...s.runtime, [extId]: update(s.runtime[extId] ?? { state: 'starting', contributions: [] }) },
        })),
    log: (extId, level, text) =>
        set((s) => ({
            logs: { ...s.logs, [extId]: [...(s.logs[extId] ?? []), { level, text: text.slice(0, 2000), at: Date.now() }].slice(-MAX_LOG_LINES) },
        })),
}));

/** AI calls one extension may make per day (they also count toward the learner's own limit). */
export const EXTENSION_DAILY_AI_LIMIT = 50;

interface ExtensionSettings {
    /** Permissions the learner approved, per extension id. Present = allowed to run code. */
    grants: Record<string, Permission[]>;
    /** AI calls per extension today (UTC) */
    aiUsage: { day: string; counts: Record<string, number> };
    approve: (extId: string, permissions: Permission[]) => void;
    revoke: (extId: string) => void;
    /** Counts one AI call; false if the extension is over today's limit. */
    useAi: (extId: string) => boolean;
}

export const useExtensionSettings = create<ExtensionSettings>()(
    persist(
        (set, get) => ({
            grants: {},
            aiUsage: { day: '', counts: {} },
            approve: (extId, permissions) => set((s) => ({ grants: { ...s.grants, [extId]: [...permissions] } })),
            revoke: (extId) =>
                set((s) => {
                    const grants = { ...s.grants };
                    delete grants[extId];
                    return { grants };
                }),
            useAi: (extId) => {
                const day = new Date().toISOString().slice(0, 10);
                const usage = get().aiUsage.day === day ? get().aiUsage : { day, counts: {} };
                const used = usage.counts[extId] ?? 0;
                if (used >= EXTENSION_DAILY_AI_LIMIT) return false;
                set({ aiUsage: { day, counts: { ...usage.counts, [extId]: used + 1 } } });
                return true;
            },
        }),
        { name: 'vylos-extension-settings' }
    )
);
