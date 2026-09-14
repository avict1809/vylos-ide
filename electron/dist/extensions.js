"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extensionsDir = void 0;
exports.scanExtensions = scanExtensions;
exports.initExtensions = initExtensions;
const electron_1 = require("electron");
const chokidar_1 = __importDefault(require("chokidar"));
const promises_1 = __importDefault(require("fs/promises"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const ipc_1 = require("./ipc");
/**
 * Installed extensions: one folder per extension in ~/.vylos/extensions (a
 * symlink to a folder being developed works too). This side only reads
 * files; the renderer validates them (app/lib/extensions). Every file an
 * extension names must stay inside its own folder.
 */
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_CODE_BYTES = 5 * 1024 * 1024;
const extensionsDir = () => path_1.default.join(os_1.default.homedir(), '.vylos', 'extensions');
exports.extensionsDir = extensionsDir;
const isInside = (root, target) => {
    const rel = path_1.default.relative(root, target);
    return rel !== '' && !rel.startsWith('..') && !path_1.default.isAbsolute(rel);
};
/** Reads a file named by an extension, refusing anything outside its folder. */
async function readInside(root, rel, maxBytes) {
    if (typeof rel !== 'string' || !rel.trim()) {
        return { path: String(rel), error: 'must be a path relative to the extension folder' };
    }
    const outside = { path: rel, error: 'points outside the extension folder' };
    const full = path_1.default.resolve(root, rel);
    if (!isInside(root, full))
        return outside;
    try {
        // A symlink inside the folder must not lead out of it either
        const real = await promises_1.default.realpath(full);
        if (!isInside(root, real))
            return outside;
        const stat = await promises_1.default.stat(real);
        if (!stat.isFile())
            return { path: rel, error: 'is not a file' };
        if (stat.size > maxBytes)
            return { path: rel, error: `is larger than ${maxBytes / 1024 / 1024} MB` };
        return { path: rel, text: await promises_1.default.readFile(real, 'utf-8') };
    }
    catch (e) {
        const code = e.code;
        return { path: rel, error: code === 'ENOENT' ? 'does not exist' : e instanceof Error ? e.message : String(e) };
    }
}
async function readJsonInside(root, rel) {
    const file = await readInside(root, rel, MAX_FILE_BYTES);
    if (file.text === undefined)
        return { path: file.path, error: file.error };
    try {
        return { path: file.path, json: JSON.parse(file.text) };
    }
    catch (e) {
        return { path: file.path, error: `is not valid JSON: ${e instanceof Error ? e.message : e}` };
    }
}
async function scanExtensions(dir = (0, exports.extensionsDir)()) {
    let entries;
    try {
        entries = (await promises_1.default.readdir(dir)).filter((name) => !name.startsWith('.')).sort();
    }
    catch (e) {
        if (e.code === 'ENOENT')
            return { dir, extensions: [] };
        throw e;
    }
    const extensions = [];
    for (const folder of entries) {
        let root;
        try {
            root = await promises_1.default.realpath(path_1.default.join(dir, folder));
            if (!(await promises_1.default.stat(root)).isDirectory())
                continue;
        }
        catch {
            continue; // a broken symlink or a file that vanished mid-scan
        }
        const manifest = await readJsonInside(root, 'package.json');
        const json = manifest.json;
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
function initExtensions(getWindow) {
    (0, ipc_1.handle)('extensions:scan', () => scanExtensions());
    (0, ipc_1.handle)('extensions:open-folder', async () => {
        const dir = (0, exports.extensionsDir)();
        await promises_1.default.mkdir(dir, { recursive: true });
        return (await electron_1.shell.openPath(dir)) === '';
    });
    const dir = (0, exports.extensionsDir)();
    let timer = null;
    promises_1.default.mkdir(dir, { recursive: true })
        .then(() => {
        chokidar_1.default
            .watch(dir, { ignoreInitial: true, depth: 6, ignored: /(^|[/\\])(\.|node_modules)/ })
            .on('all', () => {
            // Saving a file fires several events; reload once they settle
            if (timer)
                clearTimeout(timer);
            timer = setTimeout(() => getWindow()?.webContents.send('extensions:changed'), 300);
        })
            .on('error', (e) => console.error('Extensions watcher failed:', e));
    })
        .catch((e) => console.error(`Could not create ${dir}:`, e));
}
