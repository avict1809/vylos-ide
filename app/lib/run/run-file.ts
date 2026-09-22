'use client';

import { useFileStore } from '../useFileStore';
import { useTerminalStore } from '../stores/terminal-store';
import { commandFor, extensionOf, hasRunner, OPENS_IN_BROWSER, quote } from './runners';
import { reportProgramRun } from '../learning/progress-sync';

/**
 * The Run button (F5): saves the active file and runs it in the Run tab with
 * the usual command for its language, so learners see — and learn — the real
 * command. Programs run in the file's own folder, so relative paths like
 * open('data.txt') find files next to the code.
 */

const splitPath = (p: string) => {
    const index = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
    return { dir: p.slice(0, index) || p.slice(0, 1), name: p.slice(index + 1) };
};

/** Whether the Run button knows how to run this file. */
export function canRun(fileName: string): boolean {
    return hasRunner(fileName) || OPENS_IN_BROWSER.has(extensionOf(fileName));
}

/** The project's virtual environment interpreter, if it has one, relative to `fromDir` when possible. */
async function pythonFor(fromDir: string, root: string | null, windows: boolean): Promise<string | null> {
    if (!root) return null;
    const sep = windows ? '\\' : '/';
    for (const venv of ['.venv', 'venv']) {
        const venvDir = `${root}${sep}${venv}`;
        if ((await window.electron.fs.read(`${venvDir}${sep}pyvenv.cfg`)) === null) continue;
        const bin = windows ? `${venv}\\Scripts\\python.exe` : `${venv}/bin/python`;
        return fromDir === root ? quote(bin) : quote(`${root}${sep}${bin}`);
    }
    return null;
}

export async function runActiveFile() {
    const files = useFileStore.getState();
    const terminal = useTerminalStore.getState();
    const index = files.activeFileIndex;
    if (index === null || !window.electron?.term) return;

    // Run what's on screen, not the last saved version
    if (files.openFiles[index].isDirty || files.openFiles[index].path.startsWith('untitled')) {
        await files.saveActiveFile();
    }
    const tab = useFileStore.getState().openFiles[useFileStore.getState().activeFileIndex ?? -1];
    if (!tab || tab.isDirty || tab.path.startsWith('untitled')) return; // save was cancelled

    files.setShowTerminal(true);
    terminal.init();
    const ext = extensionOf(tab.name);

    if (OPENS_IN_BROWSER.has(ext)) {
        const error = await window.electron.shell.openHtml(tab.path);
        terminal.notice(error ? `Couldn't open ${tab.name} in your browser: ${error}` : `Opened ${tab.name} in your web browser.`);
        return;
    }

    if (!hasRunner(tab.name)) {
        terminal.notice(`Vylos doesn't know how to run ${ext ? `.${ext}` : 'these'} files yet. Open a terminal tab (+) and run it yourself.`);
        return;
    }

    const info = useTerminalStore.getState().info ?? (await window.electron.term.info());
    const windows = info.platform === 'win32';
    const { dir, name } = splitPath(tab.path);
    const python = (ext === 'py' && (await pythonFor(dir, files.projectRoot, windows))) || undefined;
    const command = commandFor(name, { windows, python })!;

    reportProgramRun();
    // No time limit: it's the learner's program, they can stop it (Stop, or Ctrl+C)
    await terminal.runCommand(command, dir, null, { source: 'user', target: tab.path });
}

export function stopActiveRun() {
    useTerminalStore.getState().stop('run');
}
