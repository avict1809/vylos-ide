'use client';

/**
 * Gathers a capstone project's source files for Acyrx's review: text files a
 * reviewer would read (code, README, tests, config), without dependencies,
 * build output, virtual environments or anything large.
 */

const MAX_FILES = 80;
const MAX_FILE_CHARS = 20_000;
const MAX_TOTAL_CHARS = 140_000;

const SKIP_DIRS = new Set([
    'node_modules', '.git', '.next', 'dist', 'build', 'out', 'target', 'bin', 'obj', 'venv', '.venv', 'env',
    '__pycache__', '.pytest_cache', '.mypy_cache', '.idea', '.vscode', 'coverage', '.gradle', 'vendor', 'Pods',
]);

const SOURCE = /\.(py|js|jsx|mjs|cjs|ts|tsx|java|kt|kts|c|h|cpp|hpp|cc|cs|go|rs|rb|php|swift|dart|lua|r|jl|scala|sql|html|css|scss|vue|svelte|sh|toml|yaml|yml|json|ini|cfg|gradle|md|txt)$/i;
const SKIP_FILES = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Cargo\.lock|composer\.lock|Gemfile\.lock|\.env(\..*)?)$/i;

export interface CollectedProject {
    files: Record<string, string>;
    /** Relative paths left out because of the size limits */
    skipped: string[];
}

export async function collectProjectFiles(root: string): Promise<CollectedProject> {
    const all = await window.electron.fs.listAll(root);
    const rel = (full: string) => full.slice(root.length).replace(/^[\\/]+/, '').replace(/\\/g, '/');
    const candidates = all
        .map((full) => ({ full, path: rel(full) }))
        .filter(({ path }) => SOURCE.test(path) && !SKIP_FILES.test(path) && !path.split('/').slice(0, -1).some((dir) => SKIP_DIRS.has(dir)))
        // README first, then shallow files before deep ones
        .sort((a, b) => Number(!/readme/i.test(b.path)) - Number(!/readme/i.test(a.path)) || a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path));

    const files: Record<string, string> = {};
    const skipped: string[] = [];
    let total = 0;
    for (const { full, path } of candidates) {
        if (Object.keys(files).length >= MAX_FILES) {
            skipped.push(path);
            continue;
        }
        const content = await window.electron.fs.read(full);
        if (content === null || content.length > MAX_FILE_CHARS || total + content.length > MAX_TOTAL_CHARS) {
            skipped.push(path);
            continue;
        }
        files[path] = content;
        total += content.length;
    }
    return { files, skipped };
}
