/**
 * How to run a file of each language from a terminal, shared by the Run
 * button and the exercise checker. Commands run in the file's own folder and
 * use the bare file name, so learners see the command they'd type themselves.
 *
 * Pure: no window, no Electron, so it also runs in tests.
 */

interface RunContext {
    /** File name, quoted if needed */
    file: string;
    /** File name without its extension, e.g. for a compiled program */
    stem: string;
    /** How to start a program in the current folder: ./hello or hello.exe */
    exe: (stem: string) => string;
    python: string;
}

type Runner = (c: RunContext) => string;

const RUNNERS: Record<string, Runner> = {
    py: (c) => `${c.python} ${c.file}`,
    js: (c) => `node ${c.file}`,
    mjs: (c) => `node ${c.file}`,
    cjs: (c) => `node ${c.file}`,
    // Node 22.18+ and 23.6+ run TypeScript files directly
    ts: (c) => `node ${c.file}`,
    mts: (c) => `node ${c.file}`,
    cts: (c) => `node ${c.file}`,
    // JDK 11+ compiles and runs a single source file in one step
    java: (c) => `java ${c.file}`,
    c: (c) => `gcc ${c.file} -o ${quote(c.stem)} && ${c.exe(c.stem)}`,
    cpp: (c) => `g++ ${c.file} -o ${quote(c.stem)} && ${c.exe(c.stem)}`,
    cc: (c) => `g++ ${c.file} -o ${quote(c.stem)} && ${c.exe(c.stem)}`,
    cxx: (c) => `g++ ${c.file} -o ${quote(c.stem)} && ${c.exe(c.stem)}`,
    go: (c) => `go run ${c.file}`,
    rs: (c) => `rustc ${c.file} -o ${quote(c.stem)} && ${c.exe(c.stem)}`,
    rb: (c) => `ruby ${c.file}`,
    php: (c) => `php ${c.file}`,
    // .NET 10+ runs a single .cs file without a project
    cs: (c) => `dotnet run ${c.file}`,
    kt: (c) => `kotlinc ${c.file} -include-runtime -d ${quote(`${c.stem}.jar`)} && java -jar ${quote(`${c.stem}.jar`)}`,
    kts: (c) => `kotlinc -script ${c.file}`,
    swift: (c) => `swift ${c.file}`,
    dart: (c) => `dart run ${c.file}`,
    lua: (c) => `lua ${c.file}`,
    pl: (c) => `perl ${c.file}`,
    r: (c) => `Rscript ${c.file}`,
    jl: (c) => `julia ${c.file}`,
    hs: (c) => `runghc ${c.file}`,
    exs: (c) => `elixir ${c.file}`,
    sh: (c) => `bash ${c.file}`,
    bash: (c) => `bash ${c.file}`,
    ps1: (c) => `powershell -ExecutionPolicy Bypass -File ${c.file}`,
};

export const OPENS_IN_BROWSER = new Set(['html', 'htm']);

export const extensionOf = (name: string) => {
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
};

/** Quotes a file name only when the shell needs it, so commands stay readable. */
export const quote = (name: string) => (/^[\w.\-+@/\\:]+$/.test(name) ? name : `"${name}"`);

/** Whether there's a command to run this kind of file. */
export const hasRunner = (fileName: string) => extensionOf(fileName) in RUNNERS;

/**
 * The command that runs `fileName` from its own folder, or null for a file
 * type Vylos can't run. `python` overrides the interpreter (e.g. a venv's).
 */
export function commandFor(fileName: string, opts: { windows: boolean; python?: string }): string | null {
    const runner = RUNNERS[extensionOf(fileName)];
    if (!runner) return null;
    const stem = fileName.includes('.') ? fileName.slice(0, fileName.lastIndexOf('.')) : fileName;
    return runner({
        file: quote(fileName),
        stem,
        exe: (s) => (opts.windows ? quote(`${s}.exe`) : quote(`./${s}`)),
        python: opts.python ?? (opts.windows ? 'python' : 'python3'),
    });
}
