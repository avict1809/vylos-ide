/**
 * What the AI tutor and extensions may do without asking the learner.
 *
 * Both act on text Vylos doesn't control: course content from the database,
 * files in a repo the learner cloned, a tool result. Any of it can carry a
 * prompt injection ("now run curl … | sh"), so:
 *
 * - their file access stays inside the open project folder, and
 * - only commands that plainly run one of the project's own files, or print
 *   a version, run straight away. Everything else waits for the learner to
 *   approve it (see approval-store.ts).
 *
 * The learner's own Run button and terminal are never gated.
 */

const SEPARATORS = /[\\/]+/;

const isAbsolute = (p: string) => p.startsWith('/') || p.startsWith('\\\\') || /^[A-Za-z]:[\\/]/.test(p);
const isWindowsPath = (p: string) => /^[A-Za-z]:/.test(p) || p.includes('\\');

/** Resolves `.` and `..` without touching the disk. Null when `..` climbs above the start. */
function normalizeParts(parts: string[]): string[] | null {
    const out: string[] = [];
    for (const part of parts) {
        if (!part || part === '.') continue;
        if (part === '..') {
            if (!out.length) return null;
            out.pop();
        } else out.push(part);
    }
    return out;
}

/**
 * `path` (relative to the project, or absolute) as an absolute path inside
 * `root`, or null when it points outside the project folder.
 */
export function resolveInProject(path: string, root: string | null | undefined): string | null {
    if (!root) return null;
    const windows = isWindowsPath(root);
    const rootParts = normalizeParts(root.split(SEPARATORS));
    if (!rootParts) return null;
    const leading = root.startsWith('\\\\') ? '\\\\' : root.startsWith('/') ? '/' : '';

    let parts: string[] | null;
    if (!path || path === '.') {
        parts = rootParts;
    } else if (isAbsolute(path)) {
        parts = normalizeParts(path.split(SEPARATORS));
    } else {
        parts = normalizeParts([...rootParts, ...path.split(SEPARATORS)]);
    }
    if (!parts || parts.length < rootParts.length) return null;

    // Drive letters and (on Windows) the rest of the path compare case-insensitively
    const same = (a: string, b: string) => (windows ? a.toLowerCase() === b.toLowerCase() : a === b);
    if (!rootParts.every((part, i) => same(part, parts![i]))) return null;
    return leading + parts.join(windows ? '\\' : '/');
}

/** Interpreters that run one file, and the extensions that file must have. */
const FILE_RUNNERS: Record<string, string[]> = {
    python: ['py'],
    python3: ['py'],
    py: ['py'],
    node: ['js', 'mjs', 'cjs'],
    ruby: ['rb'],
    php: ['php'],
    java: ['java'], // single-file source launch: `java Hello.java`
};

/** `go run main.go` style: tool + subcommand + file. */
const SUBCOMMAND_RUNNERS: Record<string, { sub: string; ext: string[] }> = {
    go: { sub: 'run', ext: ['go'] },
};

const VERSION_FLAGS = new Set(['--version', '-v', '-V', 'version']);

/** Anything a shell would treat specially: chaining, pipes, redirection, substitution, expansion. */
const SHELL_SYNTAX = /[;&|`$<>(){}\n\r%^!*?~]|\\\s/;

/** Splits on spaces, keeping "quoted parts" together. Null for unbalanced quotes. */
function tokenize(command: string): string[] | null {
    const tokens: string[] = [];
    const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
    let match: RegExpExecArray | null;
    let consumed = '';
    while ((match = re.exec(command))) {
        // A quote in the middle of a word (a"b) is a shell trick, not a path
        if (match[3] !== undefined && /["']/.test(match[3])) return null;
        tokens.push(match[1] ?? match[2] ?? match[3]);
        consumed += match[0];
    }
    // A stray quote means the regex skipped something
    const stripped = command.replace(/\s+/g, '');
    return consumed.replace(/\s+/g, '') === stripped ? tokens : null;
}

const extensionOf = (file: string) => {
    const dot = file.lastIndexOf('.');
    return dot > 0 ? file.slice(dot + 1).toLowerCase() : '';
};

export interface CommandVerdict {
    /** True when the command may run without asking */
    autoRun: boolean;
    /** Why it needs approval, in words for the learner */
    reason?: string;
}

/**
 * Whether `command` may run without the learner's approval. Allowed: printing
 * a tool's version (`node --version`), `which`/`where`, `pwd`, `ls` of the
 * project, and running one project file with its interpreter
 * (`python3 main.py 3 4`, `go run main.go`). Flags such as `python -c` or
 * `node -e`, which run inline code, and anything with shell syntax, need
 * approval.
 */
export function classifyCommand(command: string, cwd: string | null | undefined, projectRoot: string | null | undefined): CommandVerdict {
    const ask = (reason: string): CommandVerdict => ({ autoRun: false, reason });
    const text = command.trim();
    if (!text) return ask('The command is empty.');
    if (text.length > 500) return ask('The command is unusually long.');
    if (SHELL_SYNTAX.test(text)) return ask('It uses shell features such as pipes, redirection or chaining.');
    const tokens = tokenize(text);
    if (!tokens || !tokens.length) return ask('It could not be read safely.');
    if (cwd && !resolveInProject(cwd, projectRoot)) return ask('It runs outside the project folder.');

    const [program, ...args] = tokens;
    const name = program.toLowerCase().replace(/\.exe$/, '');
    if (program.includes('/') || program.includes('\\')) return ask('It runs a program by path.');

    // The folder it runs in is inside the project (checked above), so
    // anything inside that folder is inside the project too
    const base = cwd ?? projectRoot;
    const inside = (p: string) => resolveInProject(p, base) !== null;

    // Read-only and harmless
    if (args.length === 1 && VERSION_FLAGS.has(args[0])) return { autoRun: true };
    if ((name === 'which' || name === 'where') && args.length === 1 && /^[\w.+-]+$/.test(args[0])) return { autoRun: true };
    if (name === 'pwd' && !args.length) return { autoRun: true };
    if (name === 'ls' || name === 'dir') {
        if (args.filter((a) => !a.startsWith('-')).every(inside)) return { autoRun: true };
        return ask('It lists files outside the project folder.');
    }

    // Running one of the project's own files
    const fileArgOk = (file: string | undefined, exts: string[]) =>
        !!file && !file.startsWith('-') && exts.includes(extensionOf(file)) && inside(file);
    const plainArgs = (rest: string[]) => rest.every((a) => !a.startsWith('-'));

    if (FILE_RUNNERS[name]) {
        const [file, ...rest] = args;
        if (fileArgOk(file, FILE_RUNNERS[name]) && plainArgs(rest)) return { autoRun: true };
        return ask(`It runs ${program} with options other than one of the project's files.`);
    }
    const sub = SUBCOMMAND_RUNNERS[name];
    if (sub) {
        const [subcommand, file, ...rest] = args;
        if (subcommand === sub.sub && fileArgOk(file, sub.ext) && plainArgs(rest)) return { autoRun: true };
        return ask(`It runs ${program} ${subcommand ?? ''} beyond running one of the project's files.`.replace(/\s+\./, '.'));
    }

    return ask(`"${program}" isn't one of the commands that run without asking.`);
}
