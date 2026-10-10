"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toPlainText = toPlainText;
exports.killAllTerminals = killAllTerminals;
exports.initTerminal = initTerminal;
const electron_1 = require("electron");
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const ipc_1 = require("./ipc");
/**
 * Terminal processes, each running in a pseudo-terminal (node-pty) so that
 * programs behave as they do in a real terminal: input() / Scanner / cin
 * read what the learner types, prompts show up before the program waits,
 * colors and Ctrl+C work.
 *
 * Two kinds of session:
 * - run:   one command (`sh -c <command>`). Resolves with its exit code and
 *          plain-text output, which the voice tutor and extensions read.
 * - shell: the learner's interactive shell (bash, zsh, PowerShell…).
 *
 * If node-pty can't be loaded, runs fall back to plain pipes (output only, no
 * input) and shells are unavailable, so the tutor can still run code.
 */
const MAX_OUTPUT = 200 * 1024;
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 120000;
// Output is sent to the page in batches instead of once per chunk, so a
// program printing in a tight loop can't flood the IPC channel
const FLUSH_MS = 8;
let getWindow = () => null;
const sessions = new Map();
let nextId = 1;
let pty;
let ptyError = null;
function loadPty() {
    if (pty !== undefined)
        return pty;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        pty = require('node-pty');
    }
    catch (e) {
        pty = null;
        ptyError = e instanceof Error ? e.message : String(e);
        console.error('[terminal] node-pty unavailable, falling back to pipes:', ptyError);
    }
    return pty;
}
const send = (channel, data) => {
    const win = getWindow();
    if (win && !win.isDestroyed())
        win.webContents.send(channel, data);
};
/** Batches output for one session and forwards it to the page. */
function outputSink(id) {
    let buffer = '';
    let timer = null;
    const flush = () => {
        timer = null;
        if (!buffer)
            return;
        send('term:output', { runId: id, chunk: buffer });
        buffer = '';
    };
    return {
        push(chunk) {
            buffer += chunk;
            if (!timer)
                timer = setTimeout(flush, FLUSH_MS);
        },
        flush() {
            if (timer)
                clearTimeout(timer);
            flush();
        },
    };
}
const clampSize = (n, fallback) => {
    const v = Math.floor(Number(n));
    return Number.isFinite(v) && v >= 2 && v <= 1000 ? v : fallback;
};
function terminalEnv() {
    const env = {};
    for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined)
            env[key] = value;
    }
    // Set by Electron for its own use; would make node/electron children misbehave
    delete env.ELECTRON_RUN_AS_NODE;
    env.TERM = 'xterm-256color';
    env.COLORTERM = 'truecolor';
    env.TERM_PROGRAM = 'vylos';
    return env;
}
const existingDir = (dir) => {
    if (typeof dir !== 'string' || !dir)
        return undefined;
    try {
        return fs_1.default.statSync(dir).isDirectory() ? dir : undefined;
    }
    catch {
        return undefined;
    }
};
const homeDir = () => electron_1.app.getPath('home');
function defaultShell() {
    if (process.platform === 'win32')
        return { file: 'powershell.exe', args: ['-NoLogo'] };
    const candidates = [process.env.SHELL, '/bin/bash', '/bin/zsh', '/bin/sh'];
    const file = candidates.find((c) => !!c && fs_1.default.existsSync(c)) ?? '/bin/sh';
    // macOS terminals start login shells, which is where Homebrew and friends set up PATH
    return { file, args: process.platform === 'darwin' ? ['-l'] : [] };
}
/** Kills a pty process and everything it started (sh -c <cmd> → cmd → …). */
function killTree(pid, fallback) {
    if (process.platform !== 'win32') {
        try {
            // node-pty makes the child a session leader, so its pid is also its process group
            process.kill(-pid, 'SIGKILL');
            return;
        }
        catch {
            /* already gone, or not a group leader */
        }
    }
    try {
        fallback();
    }
    catch {
        /* already exited */
    }
}
// Escape sequences (colors, cursor movement, window titles) and terminal
// line handling stripped, so the tutor reads the text a person would see.
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[P^_][^\x1b]*\x1b\\|\x1b[@-Z\\-_]/g;
function toPlainText(raw) {
    return raw
        .replace(ANSI, '')
        .split('\n')
        .map((line) => {
        const text = line.replace(/\r+$/, '');
        // A carriage return rewrites the line (progress bars): keep what's left on screen
        const segments = text.split('\r');
        let visible = '';
        for (const segment of segments)
            visible = segment + visible.slice(segment.length);
        // Backspaces remove the character before them
        while (/[^\x08]\x08/.test(visible))
            visible = visible.replace(/[^\x08]\x08/, '');
        return visible.replace(/\x08/g, '');
    })
        .join('\n');
}
function run(opts) {
    const id = nextId++;
    const command = String(opts.command ?? '').trim();
    if (!command)
        return Promise.resolve({ runId: id, exitCode: -1, output: '', truncated: false, timedOut: false, error: 'Empty command' });
    const cwd = existingDir(opts.cwd) ?? homeDir();
    const limit = opts.timeoutMs === null
        ? null
        : Math.min(Math.max(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1000), MAX_TIMEOUT_MS);
    const ptyLib = loadPty();
    send('term:started', { runId: id, tag: opts.tag ?? null, kind: 'run', command, cwd, interactive: !!ptyLib });
    return new Promise((resolve) => {
        const sink = outputSink(id);
        let raw = '';
        let truncated = false;
        let timedOut = false;
        let timer = null;
        let finished = false;
        const collect = (chunk) => {
            raw += chunk;
            // Keep the end: that's where errors are
            if (raw.length > MAX_OUTPUT) {
                raw = raw.slice(-MAX_OUTPUT);
                truncated = true;
            }
            sink.push(chunk);
        };
        let stop = () => { };
        const armTimer = () => {
            if (limit === null)
                return;
            if (timer)
                clearTimeout(timer);
            timer = setTimeout(() => {
                timedOut = true;
                stop();
            }, limit);
        };
        const finish = (exitCode, error) => {
            if (finished)
                return;
            finished = true;
            if (timer)
                clearTimeout(timer);
            sessions.delete(id);
            sink.flush();
            send('term:exit', { runId: id, exitCode, timedOut, ...(error ? { error } : {}) });
            resolve({ runId: id, exitCode, output: toPlainText(raw).trimEnd(), truncated, timedOut, ...(error ? { error } : {}) });
        };
        if (ptyLib) {
            let proc;
            try {
                const shell = process.platform === 'win32'
                    ? { file: process.env.COMSPEC || 'cmd.exe', args: `/d /s /c "${command}"` }
                    : { file: '/bin/sh', args: ['-c', command] };
                proc = ptyLib.spawn(shell.file, shell.args, {
                    name: 'xterm-256color',
                    cols: clampSize(opts.cols, 80),
                    rows: clampSize(opts.rows, 24),
                    cwd,
                    env: terminalEnv(),
                });
            }
            catch (e) {
                finish(-1, e instanceof Error ? e.message : String(e));
                return;
            }
            stop = () => killTree(proc.pid, () => proc.kill());
            proc.onData(collect);
            proc.onExit(({ exitCode, signal }) => finish(signal && !exitCode ? 128 + signal : exitCode));
            sessions.set(id, {
                write: (data) => proc.write(data),
                resize: (cols, rows) => proc.resize(cols, rows),
                kill: () => stop(),
                // Waiting for the learner to type isn't a hang: restart the clock
                onInput: armTimer,
            });
        }
        else {
            let child;
            try {
                const options = {
                    shell: true,
                    cwd,
                    env: { ...process.env, ...terminalEnv(), PYTHONUNBUFFERED: '1' },
                    // No terminal to type into: give programs an immediate end-of-input instead of a hang
                    stdio: ['ignore', 'pipe', 'pipe'],
                    detached: process.platform !== 'win32',
                };
                child = (0, child_process_1.spawn)(command, options);
            }
            catch (e) {
                finish(-1, e instanceof Error ? e.message : String(e));
                return;
            }
            stop = () => {
                if (child.pid)
                    killTree(child.pid, () => child.kill('SIGKILL'));
                else
                    child.kill('SIGKILL');
            };
            // Pipes give bare \n; the page's terminal needs \r\n to start the next line at column 0
            const onChunk = (data) => collect(data.toString().replace(/\r?\n/g, '\r\n'));
            child.stdout?.on('data', onChunk);
            child.stderr?.on('data', onChunk);
            child.on('error', (err) => finish(-1, err.message));
            child.on('close', (code, signal) => finish(code ?? (signal ? 137 : -1)));
            sessions.set(id, { write: () => { }, resize: () => { }, kill: () => stop() });
        }
        armTimer();
    });
}
function startShell(opts) {
    const ptyLib = loadPty();
    if (!ptyLib)
        return { error: `The interactive terminal couldn't start: ${ptyError}` };
    const id = nextId++;
    const cwd = existingDir(opts.cwd) ?? homeDir();
    const shell = defaultShell();
    let proc;
    try {
        proc = ptyLib.spawn(shell.file, shell.args, {
            name: 'xterm-256color',
            cols: clampSize(opts.cols, 80),
            rows: clampSize(opts.rows, 24),
            cwd,
            env: terminalEnv(),
        });
    }
    catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
    }
    const name = path_1.default.basename(shell.file).replace(/\.exe$/i, '');
    send('term:started', { runId: id, tag: opts.tag ?? null, kind: 'shell', command: name, cwd, interactive: true });
    const sink = outputSink(id);
    proc.onData((chunk) => sink.push(chunk));
    proc.onExit(({ exitCode }) => {
        sessions.delete(id);
        sink.flush();
        send('term:exit', { runId: id, exitCode, timedOut: false });
    });
    sessions.set(id, {
        write: (data) => proc.write(data),
        resize: (cols, rows) => proc.resize(cols, rows),
        kill: () => {
            // Hang up first so the shell can pass it on to its jobs; then make sure
            try {
                proc.kill('SIGHUP');
            }
            catch { /* already gone */ }
            setTimeout(() => sessions.has(id) && killTree(proc.pid, () => proc.kill()), 500);
        },
    });
    return { runId: id, name };
}
function killAllTerminals() {
    for (const session of sessions.values())
        session.kill();
    sessions.clear();
}
function initTerminal(windowGetter) {
    getWindow = windowGetter;
    (0, ipc_1.handle)('term:info', () => {
        const ptyLib = loadPty();
        return { interactive: !!ptyLib, error: ptyError, platform: process.platform, shell: path_1.default.basename(defaultShell().file) };
    });
    (0, ipc_1.handle)('term:run', (_event, opts) => run(opts ?? { command: '' }));
    (0, ipc_1.handle)('term:shell', (_event, opts) => startShell(opts ?? {}));
    (0, ipc_1.handle)('term:input', (_event, runId, data) => {
        const session = sessions.get(runId);
        if (!session || typeof data !== 'string')
            return false;
        session.write(data);
        session.onInput?.();
        return true;
    });
    (0, ipc_1.handle)('term:resize', (_event, runId, cols, rows) => {
        const session = sessions.get(runId);
        if (!session)
            return false;
        try {
            session.resize(clampSize(cols, 80), clampSize(rows, 24));
        }
        catch {
            /* the process exited between the check and the resize */
        }
        return true;
    });
    (0, ipc_1.handle)('term:kill', (_event, runId) => {
        const session = sessions.get(runId);
        if (!session)
            return false;
        session.kill();
        return true;
    });
    electron_1.app.on('will-quit', killAllTerminals);
}
