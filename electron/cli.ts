import { app } from 'electron';
import { execFile, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

/**
 * The `vylos` shell command: `vylos .` opens the current folder in Vylos, the
 * way `code .` and `cursor .` do.
 *
 * - The .deb package already links /usr/bin/vylos to the app.
 * - AppImage and Windows installs get it from Terminal > Install 'vylos'
 *   Command in PATH, which writes a small launcher script.
 */

export interface OpenRequest {
    path: string;
    /** 'new' = doesn't exist yet; opens as an empty editor and is created on save */
    kind: 'directory' | 'file' | 'new';
}

export interface CommandResult {
    ok: boolean;
    message: string;
    detail?: string;
}

const HELP = `Vylos AI ${app.getVersion()}

Usage: vylos [options] [paths...]

  vylos .              Open the current folder
  vylos <folder>       Open a folder
  vylos <file>...      Open files (a file that doesn't exist yet is created on save)

Options:
  -h, --help           Show this help
  -v, --version        Print the version
`;

// Everything after the executable. Unpackaged (`electron .`), argv[1] is the
// app itself, not something to open.
const userArgs = (argv: string[]) => argv.slice(process.defaultApp ? 2 : 1);

/** The paths to open, minus Electron/Chromium switches */
export const launchArgs = (argv: string[]) => userArgs(argv).filter(arg => !arg.startsWith('-'));

/** `vylos --help` / `vylos --version`: prints and returns true, meaning quit without a window */
export function printCliInfo(argv: string[]): boolean {
    const args = userArgs(argv);
    if (args.includes('--version') || args.includes('-v')) {
        process.stdout.write(`${app.getVersion()}\n`);
        return true;
    }
    if (args.includes('--help') || args.includes('-h')) {
        process.stdout.write(HELP);
        return true;
    }
    return false;
}

/**
 * Started from a terminal, give the prompt straight back like `code .` does:
 * relaunch detached from the terminal and let this process exit. Returns true
 * when it did, meaning this process should quit.
 */
export function detachFromTerminal(): boolean {
    // Windows GUI apps already don't hold the console. The relaunch's stdout is
    // /dev/null, not a TTY, so it doesn't detach again.
    if (!app.isPackaged || process.platform === 'win32' || !process.stdout.isTTY) return false;

    // An AppImage's files disappear once this process exits, so relaunch the AppImage itself
    const child = spawn(process.env.APPIMAGE ?? process.execPath, process.argv.slice(1), {
        cwd: process.cwd(),
        detached: true,
        stdio: 'ignore',
    });
    child.on('error', () => { });
    // Couldn't relaunch: stay attached rather than open nothing
    if (child.pid === undefined) return false;
    child.unref();
    return true;
}

const isDirectory = (p: string) => fs.stat(p).then(s => s.isDirectory(), () => false);

/** Resolves command-line paths against the directory `vylos` was run in. Never rejects. */
export async function resolveOpenRequests(args: string[], cwd: string): Promise<OpenRequest[]> {
    const requests: OpenRequest[] = [];
    for (const arg of args) {
        let target: string;
        try {
            // Desktop launchers pass dropped files as file:// URIs
            target = arg.startsWith('file://') ? fileURLToPath(arg) : path.resolve(cwd, arg);
        } catch {
            continue;
        }

        try {
            const stat = await fs.stat(target);
            requests.push({ path: target, kind: stat.isDirectory() ? 'directory' : 'file' });
        } catch {
            // `vylos notes.md` for a new file, as long as its folder exists
            if (await isDirectory(path.dirname(target))) requests.push({ path: target, kind: 'new' });
        }
    }
    return requests;
}

// Identifies launcher scripts this app wrote, so it never touches anyone else's `vylos`
const COMMAND_MARKER = 'Installed by Vylos AI';
const SYSTEM_COMMAND = '/usr/bin/vylos';

// An AppImage is launched through the AppImage file, since its mounted files are temporary
const appExecutable = () => process.env.APPIMAGE ?? process.execPath;

const commandFile = () => process.platform === 'win32'
    ? path.join(app.getPath('userData'), 'bin', 'vylos.cmd')
    : path.join(os.homedir(), '.local', 'bin', 'vylos');

function commandScript(): string {
    const exe = appExecutable();
    if (process.platform === 'win32') {
        // `start` so the prompt comes straight back instead of waiting on the app
        return `@echo off\r\nrem ${COMMAND_MARKER}\r\nstart "" "${exe.replace(/%/g, '%%')}" %*\r\n`;
    }
    return `#!/bin/sh\n# ${COMMAND_MARKER}\nexec '${exe.replace(/'/g, `'\\''`)}' "$@"\n`;
}

const readCommand = () => fs.readFile(commandFile(), 'utf-8').catch(() => null);

// The .deb install: its package links /usr/bin/vylos to this executable
async function isSystemCommand(): Promise<boolean> {
    if (process.platform !== 'linux' || process.env.APPIMAGE) return false;
    const [linked, self] = await Promise.all([fs.realpath(SYSTEM_COMMAND).catch(() => null), fs.realpath(process.execPath)]);
    return linked === self;
}

/**
 * Edits the user PATH as stored in the registry (unexpanded, so entries like
 * %USERPROFILE%\bin survive), then broadcasts the change so new terminals see it.
 */
function editWindowsUserPath(dir: string, add: boolean): Promise<void> {
    const script = `
$dir = $env:VYLOS_BIN_DIR
$key = Get-Item -Path 'HKCU:\\Environment'
$parts = @($key.GetValue('Path', '', 'DoNotExpandEnvironmentNames') -split ';' | Where-Object { $_ -and $_ -ne $dir })
if ($env:VYLOS_PATH_ADD -eq '1') { $parts += $dir }
New-ItemProperty -Path 'HKCU:\\Environment' -Name 'Path' -Value ($parts -join ';') -PropertyType ExpandString -Force | Out-Null
[Environment]::SetEnvironmentVariable('VYLOS_PATH_REFRESH', '1', 'User')
[Environment]::SetEnvironmentVariable('VYLOS_PATH_REFRESH', $null, 'User')
`;
    return new Promise((resolve, reject) => {
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
            env: { ...process.env, VYLOS_BIN_DIR: dir, VYLOS_PATH_ADD: add ? '1' : '0' },
            windowsHide: true,
        }, (err, _stdout, stderr) => err ? reject(new Error(stderr.trim() || err.message)) : resolve());
    });
}

export async function installShellCommand(): Promise<CommandResult> {
    if (!app.isPackaged) {
        return { ok: false, message: "The 'vylos' command can only be installed from the installed app." };
    }
    if (await isSystemCommand()) {
        return { ok: true, message: "The 'vylos' command is already installed.", detail: `It comes with the Vylos AI package, at ${SYSTEM_COMMAND}.` };
    }

    const file = commandFile();
    const dir = path.dirname(file);
    const existing = await readCommand();
    if (existing !== null && !existing.includes(COMMAND_MARKER)) {
        return { ok: false, message: "Another 'vylos' command is in the way.", detail: `${file} wasn't created by Vylos AI, so it was left alone.` };
    }

    try {
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(file, commandScript(), { mode: 0o755 });
        if (process.platform === 'win32') await editWindowsUserPath(dir, true);
    } catch (e) {
        return { ok: false, message: "Couldn't install the 'vylos' command.", detail: e instanceof Error ? e.message : String(e) };
    }

    const onPath = (process.env.PATH ?? '').split(path.delimiter).includes(dir);
    // The app's own terminal can use it right away
    if (!onPath) process.env.PATH = [process.env.PATH, dir].filter(Boolean).join(path.delimiter);

    if (process.platform === 'win32') {
        return { ok: true, message: "Installed the 'vylos' command.", detail: "Open a new terminal, then run 'vylos .' in any folder to open it in Vylos AI." };
    }
    return {
        ok: true,
        message: "Installed the 'vylos' command.",
        detail: onPath
            ? `Run 'vylos .' in any folder to open it in Vylos AI.`
            : `It was installed to ${dir}, which may not be on your PATH yet. If 'vylos' isn't found, add this line to ~/.bashrc or ~/.zshrc and open a new terminal:\n\nexport PATH="$HOME/.local/bin:$PATH"`,
    };
}

export async function uninstallShellCommand(): Promise<CommandResult> {
    if (await isSystemCommand()) {
        return { ok: false, message: "The 'vylos' command comes with the Vylos AI package.", detail: 'It is removed when the package is uninstalled.' };
    }

    const file = commandFile();
    if (!(await readCommand())?.includes(COMMAND_MARKER)) {
        return { ok: true, message: "The 'vylos' command isn't installed." };
    }

    try {
        await fs.rm(file);
        if (process.platform === 'win32') await editWindowsUserPath(path.dirname(file), false);
    } catch (e) {
        return { ok: false, message: "Couldn't remove the 'vylos' command.", detail: e instanceof Error ? e.message : String(e) };
    }
    return { ok: true, message: "Removed the 'vylos' command." };
}

/**
 * AppImage updates rename the file (Vylos-AI-0.1.2.AppImage becomes
 * Vylos-AI-0.1.3.AppImage), so on launch an installed command is re-pointed
 * at wherever this copy of the app now lives.
 */
export async function refreshShellCommand(): Promise<void> {
    if (!app.isPackaged) return;
    const existing = await readCommand();
    const script = commandScript();
    if (existing?.includes(COMMAND_MARKER) && existing !== script) {
        await fs.writeFile(commandFile(), script).catch(() => { });
    }
}
