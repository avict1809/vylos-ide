'use client';

import { create } from 'zustand';
import { atLeast, linuxFamily, parseToolVersion, TOOLS, type OsKey } from './tools';
import type { Course } from '../learning/types';

/**
 * Checks whether the tools a course needs are installed, by running their
 * version commands quietly (no terminal tab). A missing tool is where most
 * beginners give up, so the course page shows this before the first lesson.
 */

export interface ToolStatus {
    state: 'checking' | 'found' | 'missing' | 'outdated';
    version?: string;
    checkedAt?: number;
}

interface SetupStore {
    os: OsKey | null;
    status: Record<string, ToolStatus>;
}

export const useSetupStore = create<SetupStore>(() => ({ os: null, status: {} }));

/** Results this recent are reused when a course is opened again */
const FRESH_MS = 5 * 60_000;
const DETECT_TIMEOUT_MS = 8000;

export const courseTools = (course: Course) => (course.requires ?? []).filter((id) => id in TOOLS);

async function detectOs(): Promise<OsKey> {
    const cached = useSetupStore.getState().os;
    if (cached) return cached;
    const { platform } = await window.electron.term.info();
    const os: OsKey = platform === 'win32' ? 'windows'
        : platform === 'darwin' ? 'mac'
            : linuxFamily(await window.electron.fs.read('/etc/os-release'));
    useSetupStore.setState({ os });
    return os;
}

const setStatus = (id: string, status: ToolStatus) =>
    useSetupStore.setState((s) => ({ status: { ...s.status, [id]: status } }));

export async function checkTool(id: string, opts: { force?: boolean } = {}): Promise<ToolStatus> {
    const tool = TOOLS[id];
    const previous = useSetupStore.getState().status[id];
    if (!tool) return { state: 'missing' };
    if (previous?.state === 'checking') return previous;
    if (!opts.force && previous?.checkedAt && Date.now() - previous.checkedAt < FRESH_MS) return previous;

    setStatus(id, { state: 'checking', version: previous?.version });
    const os = await detectOs();
    let result: ToolStatus = { state: 'missing', checkedAt: Date.now() };
    for (const command of os === 'windows' ? tool.detect.windows : tool.detect.unix) {
        const run = await window.electron.term.run({ command, timeoutMs: DETECT_TIMEOUT_MS, tag: 'setup-check' });
        // Windows' "python" can be a Store shortcut that prints a message and exits with 9009
        if (run.exitCode !== 0 || run.timedOut) continue;
        const version = parseToolVersion(tool, run.output) ?? undefined;
        if (!version && tool.id === 'python') continue; // "python" that isn't Python 3
        const outdated = !!(version && tool.min && !atLeast(version, tool.min));
        result = { state: outdated ? 'outdated' : 'found', version, checkedAt: Date.now() };
        break;
    }
    setStatus(id, result);
    return result;
}

/** Checks every tool the course needs, in parallel. */
export async function checkCourseSetup(course: Course, opts: { force?: boolean } = {}) {
    if (!window.electron?.term) return;
    await Promise.all(courseTools(course).map((id) => checkTool(id, opts)));
}
