import { BrowserWindow, shell } from 'electron';
import chokidar from 'chokidar';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { handle } from './ipc';

/**
 * Installed extensions: one folder per extension in ~/.vylos/extensions (a
 * symlink to a folder being developed works too). This side only reads
 * files; the renderer validates them (app/lib/extensions). Every file an
 * extension names must stay inside its own folder.
 */

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_CODE_BYTES = 5 * 1024 * 1024;

interface ExtensionFile {
    path: string;
    json?: unknown;
    error?: string;
}

interface ExtensionScan {
    /** Folder name inside the extensions folder */
    folder: string;
    /** Resolved location (follows a symlinked folder) */
    path: string;
    manifest?: unknown;
    manifestError?: string;
    courses: ExtensionFile[];
    /** A code extension's "main" file, which runs sandboxed in the renderer */
    code?: string;
    codeError?: string;
}

export const extensionsDir = () => path.join(os.homedir(), '.vylos', 'extensions');

const isInside = (root: string, target: string) => {
    const rel = path.relative(root, target);
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
};

/** Reads a file named by an extension, refusing anything outside its folder. */
async function readInside(root: string, rel: unknown, maxBytes: number): Promise<{ path: string; text?: string; error?: string }> {
    if (typeof rel !== 'string' || !rel.trim()) {
        return { path: String(rel), error: 'must be a path relative to the extension folder' };
    }
    const outside = { path: rel, error: 'points outside the extension folder' };
    const full = path.resolve(root, rel);
    if (!isInside(root, full)) return outside;
    try {
        // A symlink inside the folder must not lead out of it either
        const real = await fs.realpath(full);
        if (!isInside(root, real)) return outside;
        const stat = await fs.stat(real);
        if (!stat.isFile()) return { path: rel, error: 'is not a file' };
        if (stat.size > maxBytes) return { path: rel, error: `is larger than ${maxBytes / 1024 / 1024} MB` };
        return { path: rel, text: await fs.readFile(real, 'utf-8') };
    } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        return { path: rel, error: code === 'ENOENT' ? 'does not exist' : e instanceof Error ? e.message : String(e) };
    }
}

async function readJsonInside(root: string, rel: unknown): Promise<ExtensionFile> {
    const file = await readInside(root, rel, MAX_FILE_BYTES);
    if (file.text === undefined) return { path: file.path, error: file.error };
    try {
        return { path: file.path, json: JSON.parse(file.text) };
    } catch (e) {
        return { path: file.path, error: `is not valid JSON: ${e instanceof Error ? e.message : e}` };
    }
}

export async function scanExtensions(dir = extensionsDir()): Promise<{ dir: string; extensions: ExtensionScan[] }> {
    let entries: string[];
    try {
        entries = (await fs.readdir(dir)).filter((name) => !name.startsWith('.')).sort();
    } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { dir, extensions: [] };
        throw e;
    }

    const extensions: ExtensionScan[] = [];
    for (const folder of entries) {
        let root: string;
        try {
            root = await fs.realpath(path.join(dir, folder));
            if (!(await fs.stat(root)).isDirectory()) continue;
        } catch {
            continue; // a broken symlink or a file that vanished mid-scan
        }
        const manifest = await readJsonInside(root, 'package.json');
        const json = manifest.json as { main?: unknown; contributes?: { courses?: unknown } } | undefined;
        const contributed = json?.contributes?.courses;
        const courses = Array.isArray(contributed)
            ? await Promise.all(contributed.map((rel) => readJsonInside(root, rel)))
            : [];
        const main = json?.main !== undefined ? await readInside(root, json.main, MAX_CODE_BYTES) : undefined;
        extensions.push({
            folder, path: root, manifest: manifest.json, manifestError: manifest.error, courses,
            ...(main ? { code: main.text, codeError: main.error } : {}),
        });
    }
    return { dir, extensions };
}

/** Registers the extension IPC and tells the window whenever an installed extension changes. */
export function initExtensions(getWindow: () => BrowserWindow | null) {
    handle('extensions:scan', () => scanExtensions());

    handle('extensions:open-folder', async () => {
        const dir = extensionsDir();
        await fs.mkdir(dir, { recursive: true });
        return (await shell.openPath(dir)) === '';
    });

    const dir = extensionsDir();
    let timer: ReturnType<typeof setTimeout> | null = null;
    fs.mkdir(dir, { recursive: true })
        .then(() => {
            chokidar
                .watch(dir, { ignoreInitial: true, depth: 6, ignored: /(^|[/\\])(\.|node_modules)/ })
                .on('all', () => {
                    // Saving a file fires several events; reload once they settle
                    if (timer) clearTimeout(timer);
                    timer = setTimeout(() => getWindow()?.webContents.send('extensions:changed'), 300);
                })
                .on('error', (e) => console.error('Extensions watcher failed:', e));
        })
        .catch((e) => console.error(`Could not create ${dir}:`, e));
}
