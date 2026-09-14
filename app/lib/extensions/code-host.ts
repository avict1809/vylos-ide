'use client';

import type { Disposable } from '../disposable';
import { HOST_HTML, WORKER_RUNTIME } from './sandbox';
import type { Permission } from './validate';
import { useExtensionSettings, useExtensionStore, LogLine } from '../stores/extension-store';
import { useFileStore } from '../useFileStore';
import { useTerminalStore } from '../stores/terminal-store';
import { useCourseStore } from '../stores/course-store';
import { getCourse } from '../learning/course-registry';
import { getActiveLanguageId } from '../editor-bridge';
import { generateContent, isAiError } from '../ai/gemini-client';
import { getTutorToolDeclarations, registerTutorTool, ToolArgs } from '../ai/tutor-tool-registry';
import { HINT_LEVELS, HintLevel, HintRequest, registerHintLadder } from '../ai/hint-registry';
import { ExplainRequest, registerExplainer } from '../ai/explainer-registry';
import { CoachNote, CoachRequest, registerCoach } from '../ai/coach-registry';

/**
 * Runs approved code extensions in the sandbox (sandbox.ts) and answers their
 * requests. This is where permissions are enforced: an extension's worker can
 * only send messages, and every message is checked here against what the
 * learner approved before anything happens.
 */

export interface CodeExtension {
    id: string;
    version: string;
    displayName: string;
    publisher: string;
    /** Approved, so the ones it may use */
    permissions: Permission[];
    main: string;
    code: string;
}

interface Running {
    ext: CodeExtension;
    registrations: Map<number, Disposable>;
}

// Longest a call into an extension may take; past this it is stopped
const TIMEOUT_MS = { activate: 10_000, tutorTool: 150_000, hintStep: 60_000, explainer: 30_000, coach: 10_000 };
const MAX_FILE_CHARS = 1_000_000;
const MAX_RESULT_CHARS = 16_000;
const MAX_TEXT_CHARS = 4_000;

const KIND_PERMISSION: Record<string, Permission | null> = {
    // Explainers, hint ladders and coaches are handed the learner's code
    tutorTool: null, hintLadder: 'workspace.read', explainer: 'workspace.read', coach: 'workspace.read',
};

let frame: HTMLIFrameElement | null = null;
let port: MessagePort | null = null;
const running = new Map<string, Running>();
const invokes = new Map<number, { extId: string; resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
const stopWaiters = new Map<string, () => void>();
const activationTimers = new Map<string, ReturnType<typeof setTimeout>>();
const lessonSubscribers = new Set<string>();
let nextInvoke = 1;
let stopWatchingLessons: (() => void) | null = null;

const log = (extId: string, level: LogLine['level'], text: string) => useExtensionStore.getState().log(extId, level, text);

function toWorker(extId: string, msg: unknown) {
    port?.postMessage({ type: 'toWorker', extId, msg });
}

// --- Lifecycle --------------------------------------------------------------

function createSandbox(): Promise<MessagePort> {
    return new Promise((resolve, reject) => {
        const iframe = document.createElement('iframe');
        iframe.setAttribute('sandbox', 'allow-scripts'); // opaque origin: no app storage, no window.electron
        iframe.setAttribute('aria-hidden', 'true');
        iframe.style.display = 'none';
        iframe.srcdoc = HOST_HTML;
        const timer = setTimeout(() => reject(new Error('The extension sandbox did not start')), 10_000);
        iframe.onload = () => {
            const channel = new MessageChannel();
            channel.port1.onmessage = (event) => {
                if (event.data?.type === 'ready') {
                    clearTimeout(timer);
                    channel.port1.onmessage = (e) => onSandboxMessage(e.data);
                    resolve(channel.port1);
                }
            };
            iframe.contentWindow?.postMessage('connect', '*', [channel.port2]);
        };
        document.body.appendChild(iframe);
        frame = iframe;
    });
}

/** Stops whatever runs now, then starts these extensions. */
export async function startCodeExtensions(exts: CodeExtension[]) {
    await stopCodeExtensions();
    if (exts.length === 0) return;
    try {
        port = await createSandbox();
    } catch (e) {
        exts.forEach((ext) => fail(ext.id, e instanceof Error ? e.message : String(e)));
        return;
    }
    stopWatchingLessons = watchLessons();
    for (const ext of exts) {
        running.set(ext.id, { ext, registrations: new Map() });
        useExtensionStore.getState().updateRuntime(ext.id, () => ({ state: 'starting', contributions: [] }));
        activationTimers.set(ext.id, setTimeout(() => stopExtension(ext.id, `activate() did not finish within ${TIMEOUT_MS.activate / 1000} seconds`), TIMEOUT_MS.activate));
        port.postMessage({ type: 'start', runtime: WORKER_RUNTIME, extension: { id: ext.id, version: ext.version }, main: ext.main, code: ext.code });
    }
}

/** Gives every extension a moment for deactivate(), then removes the sandbox and all it registered. */
export async function stopCodeExtensions() {
    const ids = [...running.keys()];
    await Promise.all(ids.map((id) => new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 1000);
        stopWaiters.set(id, () => { clearTimeout(timer); resolve(); });
        toWorker(id, { type: 'stop' });
    })));
    ids.forEach((id) => cleanUp(id));
    stopWaiters.clear();
    lessonSubscribers.clear();
    stopWatchingLessons?.();
    stopWatchingLessons = null;
    frame?.remove(); // ends every worker
    frame = null;
    port = null;
    useExtensionStore.getState().set({ runtime: {} });
}

/** Undoes everything one extension registered and rejects its pending calls. */
function cleanUp(extId: string) {
    const r = running.get(extId);
    if (!r) return;
    r.registrations.forEach((d) => d.dispose());
    r.registrations.clear();
    for (const [id, inv] of invokes) {
        if (inv.extId !== extId) continue;
        clearTimeout(inv.timer);
        inv.reject(new Error(`${r.ext.displayName} stopped`));
        invokes.delete(id);
    }
    clearTimeout(activationTimers.get(extId));
    activationTimers.delete(extId);
    lessonSubscribers.delete(extId);
    running.delete(extId);
}

function fail(extId: string, error: string) {
    useExtensionStore.getState().updateRuntime(extId, (rt) => ({ ...rt, state: 'failed', error, contributions: [] }));
    log(extId, 'error', error);
}

/** Ends a misbehaving extension (e.g. it stopped answering) until the next reload. */
function stopExtension(extId: string, reason: string) {
    if (!running.has(extId)) return;
    port?.postMessage({ type: 'terminate', extId });
    cleanUp(extId);
    fail(extId, `${reason}. Stopped until Vylos reloads extensions.`);
}

// --- Messages from the sandbox ------------------------------------------------

function onSandboxMessage(data: { extId?: string; msg?: Record<string, unknown> }) {
    const extId = data?.extId;
    const msg = data?.msg;
    if (!extId || !msg || !running.has(extId)) return; // stale or unknown
    switch (msg.type) {
        case 'log':
            log(extId, (['log', 'info', 'warn', 'error', 'debug'].includes(msg.level as string) ? msg.level : 'log') as LogLine['level'], String(msg.text ?? ''));
            break;
        case 'activated':
            clearTimeout(activationTimers.get(extId));
            useExtensionStore.getState().updateRuntime(extId, (rt) => ({ ...rt, state: 'running', error: undefined }));
            break;
        case 'failed':
            port?.postMessage({ type: 'terminate', extId });
            cleanUp(extId);
            fail(extId, String(msg.error ?? 'The extension failed to start'));
            break;
        case 'stopped':
            stopWaiters.get(extId)?.();
            break;
        case 'invokeResult': {
            const inv = invokes.get(msg.id as number);
            // Only the extension that was asked may answer
            if (!inv || inv.extId !== extId) return;
            invokes.delete(msg.id as number);
            clearTimeout(inv.timer);
            if (msg.error) inv.reject(new Error(String(msg.error)));
            else inv.resolve(msg.result);
            break;
        }
        case 'call':
            void answer(extId, msg.id as number, String(msg.method), (msg.params ?? {}) as Record<string, unknown>);
            break;
    }
}

async function answer(extId: string, id: number, method: string, params: Record<string, unknown>) {
    try {
        const result = await handleCall(extId, method, params);
        toWorker(extId, { type: 'result', id, result: result ?? null });
    } catch (e) {
        toWorker(extId, { type: 'result', id, error: e instanceof Error ? e.message : String(e) });
    }
}

/** Calls a function the extension registered; stops the extension if it doesn't answer in time. */
function invoke(extId: string, handle: unknown, args: unknown[], timeoutMs: number): Promise<unknown> {
    const r = running.get(extId);
    if (!r || !port) return Promise.reject(new Error('The extension is not running'));
    return new Promise((resolve, reject) => {
        const id = nextInvoke++;
        const timer = setTimeout(() => {
            invokes.delete(id);
            reject(new Error(`${r.ext.displayName} did not answer in time`));
            stopExtension(extId, `A call took longer than ${timeoutMs / 1000} seconds`);
        }, timeoutMs);
        invokes.set(id, { extId, resolve, reject, timer });
        toWorker(extId, { type: 'invoke', id, handle, args });
    });
}

// --- Requests from extensions ---------------------------------------------------

function need(ext: CodeExtension, permission: Permission) {
    if (!ext.permissions.includes(permission)) {
        throw new Error(`This needs the "${permission}" permission: add it to "permissions" in package.json`);
    }
}

const str = (v: unknown, what: string, max: number): string => {
    if (typeof v !== 'string' || !v.trim()) throw new Error(`${what} must be a non-empty string`);
    if (v.length > max) throw new Error(`${what} must be at most ${max} characters`);
    return v;
};

/** Resolves a path relative to the open project, refusing anything outside it. */
function projectPath(rel: unknown): string {
    const root = useFileStore.getState().projectRoot;
    if (!root) throw new Error('No project folder is open');
    const path = typeof rel === 'string' ? rel : '';
    const parts = path.replace(/\\/g, '/').split('/').filter((p) => p && p !== '.');
    if (path.startsWith('/') || /^[A-Za-z]:/.test(path) || parts.includes('..')) {
        throw new Error(`"${path}" is outside the project folder: use a path relative to it`);
    }
    return [root.replace(/[\\/]+$/, ''), ...parts].join('/');
}

async function handleCall(extId: string, method: string, params: Record<string, unknown>): Promise<unknown> {
    const r = running.get(extId)!;
    const { ext } = r;
    const electron = window.electron;

    switch (method) {
        case 'register':
            return register(r, String(params.kind), (params.spec ?? {}) as Record<string, unknown>);

        case 'unregister': {
            const reg = Number(params.reg);
            r.registrations.get(reg)?.dispose();
            r.registrations.delete(reg);
            useExtensionStore.getState().updateRuntime(extId, (rt) => ({ ...rt, contributions: rt.contributions.filter((c) => c.reg !== reg) }));
            return null;
        }

        case 'ai.generate': {
            need(ext, 'ai.generate');
            const prompt = str(params.prompt, 'The prompt', 20_000);
            if (!useExtensionSettings.getState().useAi(extId)) throw new Error("This extension has used today's AI limit for extensions");
            const text = await generateContent(prompt, `ext:${extId}`.slice(0, 64));
            if (isAiError(text)) throw new Error(text);
            return text;
        }

        case 'workspace.getRoot':
            need(ext, 'workspace.read');
            return useFileStore.getState().projectRoot ?? null;

        case 'workspace.readFile': {
            need(ext, 'workspace.read');
            const content = await electron.fs.read(projectPath(params.path));
            if (content === null) throw new Error(`Could not read ${params.path}`);
            if (content.length > MAX_FILE_CHARS) throw new Error(`${params.path} is too large (over 1 MB)`);
            return content;
        }

        case 'workspace.listFiles': {
            need(ext, 'workspace.read');
            const entries = await electron.fs.list(projectPath(params.path));
            return entries.slice(0, 500).map((e: { name: string; isDirectory: boolean }) => ({ name: e.name, isDirectory: e.isDirectory }));
        }

        case 'workspace.getActiveFile': {
            need(ext, 'workspace.read');
            const s = useFileStore.getState();
            const tab = s.activeFileIndex !== null ? s.openFiles[s.activeFileIndex] : null;
            return tab ? { path: tab.path, languageId: getActiveLanguageId(), text: tab.content } : null;
        }

        case 'workspace.writeFile': {
            need(ext, 'workspace.write');
            const content = typeof params.content === 'string' ? params.content : null;
            if (content === null) throw new Error('content must be a string');
            if (content.length > MAX_FILE_CHARS) throw new Error('content is too large (over 1 MB)');
            const target = projectPath(params.path);
            if (!(await electron.fs.write(target, content))) throw new Error(`Could not write ${params.path}`);
            log(extId, 'info', `Wrote ${params.path}`);
            return null;
        }

        case 'terminal.run': {
            need(ext, 'terminal.run');
            const command = str(params.command, 'The command', 2000);
            const s = useFileStore.getState();
            // Runs in the visible terminal, so the learner always sees what an extension does
            s.setShowTerminal(true);
            useTerminalStore.getState().init();
            const cwd = params.cwd ? projectPath(params.cwd) : s.projectRoot ?? undefined;
            const timeoutMs = Math.min(Math.max(Number(params.timeoutSeconds) || 30, 1), 120) * 1000;
            log(extId, 'info', `Ran: ${command}`);
            const result = await useTerminalStore.getState().runCommand(command, cwd, timeoutMs);
            return { exitCode: result.exitCode, output: result.output.slice(-MAX_RESULT_CHARS), timedOut: !!result.timedOut };
        }

        case 'learner.getCompletedLessons':
            need(ext, 'learner.read');
            return useCourseStore.getState().completedLessons[String(params.courseId)] ?? [];

        case 'learner.subscribe':
            need(ext, 'learner.read');
            lessonSubscribers.add(extId);
            return null;

        default:
            throw new Error(`Unknown API: ${method}`);
    }
}

// --- Registrations ----------------------------------------------------------------

const languagesOf = (v: unknown): string[] | undefined => {
    if (v === undefined || v === null) return undefined;
    if (!Array.isArray(v) || v.some((l) => typeof l !== 'string') || v.length === 0) throw new Error('languages must be a list of language ids, e.g. ["python"]');
    return v as string[];
};

// Scalars only for now: one malformed schema would make Gemini refuse the whole tutor session
const PARAM_TYPES = ['STRING', 'NUMBER', 'INTEGER', 'BOOLEAN'];

function register(r: Running, kind: string, spec: Record<string, unknown>) {
    const { ext } = r;
    if (!Object.hasOwn(KIND_PERMISSION, kind)) throw new Error(`Unknown registration: ${kind}`);
    const permission = KIND_PERMISSION[kind];
    if (permission) need(ext, permission);
    const reg = Number(spec.reg);
    if (!Number.isInteger(reg) || r.registrations.has(reg)) throw new Error('Invalid registration');
    const id = `ext:${ext.id}:${reg}`;
    const extId = ext.id;

    let disposable: Disposable;
    let label: string;

    if (kind === 'tutorTool') {
        const d = (spec.declaration ?? {}) as Record<string, unknown>;
        const name = String(d.name ?? '');
        if (!/^[a-z][a-z0-9_]{0,39}$/.test(name)) throw new Error('The tool name must be lowercase letters, digits and underscores, e.g. "check_style"');
        const description = str(d.description, 'The tool description', 1000);
        const parameters = (d.parameters ?? { type: 'OBJECT', properties: {} }) as { type?: string; properties?: Record<string, { type?: string; description?: string }>; required?: string[] };
        if (parameters.type !== 'OBJECT' || typeof parameters.properties !== 'object' || !parameters.properties) {
            throw new Error('parameters must be { type: "OBJECT", properties: { ... } }');
        }
        const keys = Object.keys(parameters.properties);
        if (keys.length > 20) throw new Error('A tool can have at most 20 parameters');
        for (const key of keys) {
            if (!/^[a-z][a-z0-9_]{0,39}$/.test(key)) throw new Error(`Parameter "${key}" must be lowercase letters, digits and underscores`);
            if (!PARAM_TYPES.includes(String(parameters.properties[key]?.type))) throw new Error(`parameters.properties.${key}.type must be one of ${PARAM_TYPES.join(', ')}`);
        }
        const required = parameters.required ?? [];
        if (!Array.isArray(required) || required.some((k) => !keys.includes(k))) throw new Error('parameters.required must only name parameters listed in properties');
        const toolName = `ext_${ext.publisher}_${name}`.replace(/-/g, '_').slice(0, 63);
        if (getTutorToolDeclarations().some((t) => t.name === toolName)) throw new Error(`A tutor tool named "${name}" is already registered by this publisher`);
        disposable = registerTutorTool({
            declaration: {
                name: toolName,
                description: `[From the extension "${ext.displayName}"] ${description}`,
                parameters: {
                    type: 'OBJECT',
                    properties: Object.fromEntries(Object.entries(parameters.properties).map(([k, p]) => [k, { type: String(p.type), description: typeof p.description === 'string' ? p.description.slice(0, 500) : undefined }])),
                    required: required.length ? required : undefined,
                },
            },
            describe: () => `${ext.displayName}: ${name.replace(/_/g, ' ')}…`,
            execute: async (args: ToolArgs) => {
                try {
                    const result = await invoke(extId, spec.handle, [args], TIMEOUT_MS.tutorTool);
                    const value = result !== null && typeof result === 'object' ? result : { result };
                    return JSON.stringify(value).length > MAX_RESULT_CHARS ? { error: 'The tool returned too much data' } : value;
                } catch (e) {
                    return { error: e instanceof Error ? e.message : String(e) };
                }
            },
        });
        label = `Tutor tool: ${name}`;
    } else if (kind === 'hintLadder') {
        const steps = Array.isArray(spec.steps) ? spec.steps as Record<string, unknown>[] : [];
        disposable = registerHintLadder({
            id,
            languages: languagesOf(spec.languages),
            steps: steps.map((step, i) => {
                if (!HINT_LEVELS.includes(step.level as HintLevel)) throw new Error(`steps[${i}].level must be one of ${HINT_LEVELS.join(', ')}`);
                const format = ['prose', 'lines', 'code'].includes(String(step.format)) ? step.format as 'prose' | 'lines' | 'code' : 'prose';
                return {
                    level: step.level as HintLevel,
                    label: str(step.label, `steps[${i}].label`, 40),
                    title: str(step.title, `steps[${i}].title`, 60),
                    format,
                    produce: async (request: HintRequest) => {
                        try {
                            const text = await invoke(extId, step.handle, [request], TIMEOUT_MS.hintStep);
                            return typeof text === 'string' && text.trim() ? text.slice(0, MAX_TEXT_CHARS) : null;
                        } catch (e) {
                            log(extId, 'error', `Hint step failed: ${e instanceof Error ? e.message : e}`);
                            return null;
                        }
                    },
                };
            }),
        });
        label = `Hint ladder${spec.languages ? ` (${(spec.languages as string[]).join(', ')})` : ''}`;
    } else if (kind === 'explainer') {
        const explainerLabel = str(spec.label, 'label', 40);
        disposable = registerExplainer({
            id,
            label: explainerLabel,
            languages: languagesOf(spec.languages),
            explain: async (request: ExplainRequest) => {
                try {
                    const text = await invoke(extId, spec.handle, [request], TIMEOUT_MS.explainer);
                    return typeof text === 'string' && text.trim() ? { text: text.slice(0, MAX_TEXT_CHARS) } : null;
                } catch (e) {
                    log(extId, 'error', `explain() failed: ${e instanceof Error ? e.message : e}`);
                    return null; // let the next explainer answer
                }
            },
        });
        label = `Explainer: ${explainerLabel}`;
    } else {
        const coachLabel = str(spec.label, 'label', 40);
        disposable = registerCoach({
            id,
            label: coachLabel,
            languages: languagesOf(spec.languages),
            check: async (request: CoachRequest) => {
                const notes = await invoke(extId, spec.handle, [request], TIMEOUT_MS.coach).catch((e) => {
                    log(extId, 'error', `check() failed: ${e instanceof Error ? e.message : e}`);
                    return [];
                });
                return Array.isArray(notes) ? notes.flatMap((n) => toNote(n)) : [];
            },
        });
        label = `Coach: ${coachLabel}${spec.languages ? ` (${(spec.languages as string[]).join(', ')})` : ''}`;
    }

    r.registrations.set(reg, disposable);
    useExtensionStore.getState().updateRuntime(extId, (rt) => ({ ...rt, contributions: [...rt.contributions, { reg, label }] }));
    return null;
}

function toNote(n: unknown): CoachNote[] {
    const note = n as Record<string, unknown> | null;
    if (!note || typeof note.line !== 'number' || typeof note.message !== 'string' || !note.message.trim()) return [];
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
    return [{
        line: note.line,
        column: num(note.column),
        endLine: num(note.endLine),
        endColumn: num(note.endColumn),
        message: note.message.slice(0, 500),
        why: typeof note.why === 'string' ? note.why.slice(0, 1000) : undefined,
        severity: note.severity === 'warning' ? 'warning' : 'info',
    }];
}

// --- Events -------------------------------------------------------------------------

/** Tells subscribed extensions (with learner.read) about lessons the learner completes. */
function watchLessons(): () => void {
    return useCourseStore.subscribe((state, prev) => {
        if (lessonSubscribers.size === 0 || state.completedLessons === prev.completedLessons) return;
        for (const [courseId, ids] of Object.entries(state.completedLessons)) {
            const before = new Set(prev.completedLessons[courseId] ?? []);
            for (const lessonId of ids) {
                if (before.has(lessonId)) continue;
                const lessonTitle = getCourse(courseId)?.modules.flatMap((m) => m.lessons).find((l) => l.id === lessonId)?.title ?? null;
                for (const extId of lessonSubscribers) {
                    toWorker(extId, { type: 'event', name: 'lessonCompleted', data: { courseId, lessonId, lessonTitle } });
                }
            }
        }
    });
}
