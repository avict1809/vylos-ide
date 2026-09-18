"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BINARY_EXTENSIONS = exports.DEFAULT_EXCLUDES = void 0;
exports.readGitignoreNames = readGitignoreNames;
exports.isExcluded = isExcluded;
exports.isBinaryFile = isBinaryFile;
exports.sortEntries = sortEntries;
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
// Shared workspace rules for the file tree, quick-open and search.
//
// These used to be three hardcoded, disagreeing lists: fs:listAll skipped
// node_modules/.git/.next/dist, find:search skipped those plus .venv/target/bin,
// and fs:list filtered nothing at all (so node_modules showed up in the tree).
// VSCode drives all three from one files.exclude config plus .gitignore.
// Always hidden, regardless of .gitignore. Mirrors VSCode's default
// files.exclude plus the usual heavy build/vendor directories.
exports.DEFAULT_EXCLUDES = new Set([
    '.git', '.svn', '.hg', '.DS_Store', 'Thumbs.db',
    'node_modules', 'bower_components', 'vendor',
    '.next', '.nuxt', '.svelte-kit', '.turbo', '.parcel-cache',
    'dist', 'build', 'out', 'target', 'bin', 'obj',
    '.venv', 'venv', '__pycache__', '.pytest_cache', '.mypy_cache',
    '.gradle', '.idea', '.vscode-test',
    'coverage', '.cache',
]);
// Binary-ish files that never make sense to grep.
exports.BINARY_EXTENSIONS = new Set([
    '.exe', '.dll', '.so', '.dylib', '.bin', '.o', '.a', '.class', '.pyc',
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.tiff', '.psd',
    '.pdf', '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar', '.jar', '.war',
    '.mp4', '.mp3', '.wav', '.avi', '.mov', '.mkv', '.flac', '.ogg',
    '.woff', '.woff2', '.ttf', '.eot', '.otf',
    '.sqlite', '.db', '.lock',
]);
/**
 * Reads .gitignore and returns the simple directory/file names it excludes.
 *
 * This is deliberately not a full gitignore implementation: it handles the
 * plain-name and leading/trailing-slash forms that cover the overwhelming
 * majority of real entries, and ignores globs, negations and path-anchored
 * patterns rather than pretending to honour them.
 */
async function readGitignoreNames(rootDir) {
    const names = new Set();
    try {
        const raw = await promises_1.default.readFile(path_1.default.join(rootDir, '.gitignore'), 'utf-8');
        for (const line of raw.split('\n')) {
            const entry = line.trim();
            if (!entry || entry.startsWith('#') || entry.startsWith('!'))
                continue;
            // Skip anything we can't honour faithfully.
            if (entry.includes('*') || entry.includes('?') || entry.includes('['))
                continue;
            const cleaned = entry.replace(/^\/+/, '').replace(/\/+$/, '');
            if (cleaned && !cleaned.includes('/'))
                names.add(cleaned);
        }
    }
    catch {
        // No .gitignore is normal.
    }
    return names;
}
function isExcluded(name, extra) {
    return exports.DEFAULT_EXCLUDES.has(name) || (extra?.has(name) ?? false);
}
function isBinaryFile(name) {
    return exports.BINARY_EXTENSIONS.has(path_1.default.extname(name).toLowerCase());
}
// VSCode's explorer order: directories first, then files; each sorted
// case-insensitively with numeric awareness, so file10 follows file9.
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
function sortEntries(entries) {
    return entries.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory)
            return a.isDirectory ? -1 : 1;
        return collator.compare(a.name, b.name);
    });
}
