import type { Exercise, FunctionCheck, OutputCheck } from '../learning/types';
import { commandFor, extensionOf, quote } from '../run/runners';
import { mainFile } from './format';

/**
 * The built-in checkers. Pure: planCheck says which files to write and which
 * commands to run; whoever runs them (the app, or a test script) passes the
 * outputs to gradeCheck. Commands only ever come from the fixed templates here
 * and in runners.ts: an exercise's own data (inputs, arguments, the function
 * name) is written to files the harness reads.
 */

export interface CheckRun {
    /** Command, run in the learner's exercise folder */
    command: string;
}

export interface CheckPlan {
    /** Files to write into the (temporary) check folder, by name */
    files: Record<string, string>;
    runs: CheckRun[];
}

export interface RunOutput {
    exitCode: number;
    output: string;
    timedOut: boolean;
    error?: string;
}

export interface CaseResult {
    name: string;
    passed: boolean;
    /** One line, e.g. "returned 5, expected 6" */
    message: string;
    expected?: string;
    actual?: string;
    /** Show expected and actual output side by side (output checks) */
    compare?: boolean;
}

export interface CheckResult {
    passed: boolean;
    cases: CaseResult[];
    /** e.g. "3 of 4 checks passed" */
    summary: string;
    /** Set when the code couldn't be checked at all (syntax error, missing tool, timeout) */
    problem?: string;
    /** The problem is the computer's setup (a missing tool), not the learner's code */
    setupProblem?: boolean;
}

export const CHECK_TIMEOUT_MS = 10_000;
const MARK = '@@VYLOS@@';

export interface CheckContext {
    windows: boolean;
    /** Folder holding the harness files (outside the learner's folder) */
    checkDir: string;
}

const join = (ctx: CheckContext, dir: string, name: string) => `${dir}${ctx.windows ? '\\' : '/'}${name}`;
const noInput = (ctx: CheckContext) => (ctx.windows ? '< NUL' : '< /dev/null');

export function planCheck(exercise: Exercise, ctx: CheckContext): CheckPlan {
    return exercise.check.type === 'output' ? planOutput(exercise, exercise.check, ctx) : planFunction(exercise, exercise.check, ctx);
}

function planOutput(exercise: Exercise, check: OutputCheck, ctx: CheckContext): CheckPlan {
    const run = commandFor(mainFile(exercise), { windows: ctx.windows })!;
    const files: Record<string, string> = {};
    const runs = check.cases.map((c, i) => {
        const name = `input-${i + 1}.txt`;
        // End with a newline so the last input() line is complete
        files[name] = c.input === undefined ? '' : c.input.endsWith('\n') ? c.input : `${c.input}\n`;
        return { command: `${run} < ${quote(join(ctx, ctx.checkDir, name))}` };
    });
    return { files, runs };
}

function planFunction(exercise: Exercise, check: FunctionCheck, ctx: CheckContext): CheckPlan {
    const main = mainFile(exercise);
    const python = extensionOf(main) === 'py';
    const harness = python ? 'vylos_check.py' : 'vylos-check.cjs';
    const interpreter = python ? (ctx.windows ? 'python' : 'python3') : 'node';
    const cases = JSON.stringify({ function: check.function, cases: check.cases.map((c) => ({ args: c.args, expected: c.expected })) });
    return {
        files: { [harness]: python ? PYTHON_HARNESS : NODE_HARNESS, 'cases.json': cases },
        runs: [{
            command: `${interpreter} ${quote(join(ctx, ctx.checkDir, harness))} ${quote(main)} ${quote(join(ctx, ctx.checkDir, 'cases.json'))} ${noInput(ctx)}`,
        }],
    };
}

// --- Grading ------------------------------------------------------------------

const normalize = (s: string) =>
    s.replace(/\r\n?/g, '\n').split('\n').map((l) => l.trimEnd()).join('\n').replace(/^\n+|\n+$/g, '');

/** Explains a run that never got as far as producing results. */
function runProblem(run: RunOutput): { problem: string; setupProblem?: boolean } | undefined {
    if (run.timedOut) return { problem: `Your code was still running after ${CHECK_TIMEOUT_MS / 1000} seconds. Is there a loop that never ends, or an input() the checker didn't expect?` };
    if (run.error && run.exitCode === -1) return { problem: `The check couldn't start: ${run.error}`, setupProblem: true };
    const missing = run.output.match(/(?:^|\n)(?:\/bin\/sh: )?(?:line \d+: )?(\S+): (?:command )?not found/)
        ?? run.output.match(/'(\S+)' is not recognized as an internal or external command/);
    if (missing) return { problem: `"${missing[1]}" isn't installed, or Vylos can't find it on your PATH. Install it, then check again.`, setupProblem: true };
    return undefined;
}

const summarize = (cases: CaseResult[]) => {
    const passed = cases.filter((c) => c.passed).length;
    return passed === cases.length ? `All ${cases.length} ${cases.length === 1 ? 'check' : 'checks'} passed` : `${passed} of ${cases.length} checks passed`;
};

export function gradeCheck(exercise: Exercise, outputs: RunOutput[]): CheckResult {
    return exercise.check.type === 'output' ? gradeOutput(exercise.check, outputs) : gradeFunction(exercise.check, outputs[0]);
}

function gradeOutput(check: OutputCheck, outputs: RunOutput[]): CheckResult {
    const cases: CaseResult[] = [];
    for (const [i, c] of check.cases.entries()) {
        const run = outputs[i];
        const name = c.name ?? (c.input ? `With input ${JSON.stringify(c.input.trim())}` : check.cases.length > 1 ? `Case ${i + 1}` : 'Output');
        const trouble = run ? runProblem(run) : { problem: 'The check stopped early.' };
        if (trouble) return { passed: false, cases, summary: summarize([...cases, { name, passed: false, message: '' }]), ...trouble };
        const actual = normalize(run.output);
        const expected = normalize(c.expected);
        const match = c.match ?? 'exact';
        const passed = match === 'contains' ? actual.includes(expected)
            : match === 'regex' ? new RegExp(c.expected, 'm').test(actual)
                : actual === expected;
        const crashed = run.exitCode !== 0 && /Traceback|Error|Exception|error:/.test(run.output);
        cases.push({
            name,
            passed: passed && !crashed,
            message: passed && !crashed ? 'Printed the right output'
                : crashed ? `The program stopped with an error (exit code ${run.exitCode})`
                    : match === 'contains' ? 'The output doesn\'t include what was expected'
                        : match === 'regex' ? 'The output doesn\'t match the expected pattern'
                            : 'The output isn\'t what was expected',
            expected: match === 'regex' ? `text matching /${c.expected}/` : expected,
            actual: actual || '(nothing was printed)',
            compare: !(passed && !crashed),
        });
    }
    return { passed: cases.every((c) => c.passed), cases, summary: summarize(cases) };
}

interface HarnessRecord {
    i?: number;
    ok?: boolean;
    call?: string;
    actual?: string;
    expected?: string;
    error?: string;
    printed?: string;
    load_error?: string;
    missing?: string;
}

function gradeFunction(check: FunctionCheck, run: RunOutput | undefined): CheckResult {
    const trouble = run ? runProblem(run) : { problem: 'The check didn\'t run.', setupProblem: true };
    if (!run || trouble) return { passed: false, cases: [], summary: 'Not checked', ...trouble };

    const records: HarnessRecord[] = run.output.split('\n').flatMap((line) => {
        const at = line.indexOf(MARK);
        if (at === -1) return [];
        try { return [JSON.parse(line.slice(at + MARK.length))]; } catch { return []; }
    });

    const loadError = records.find((r) => r.load_error)?.load_error;
    if (loadError?.startsWith('EOFError')) {
        const line = loadError.match(/on line \d+/)?.[0];
        return {
            passed: false, cases: [], summary: 'Not checked',
            problem: `Your file calls input() as soon as it runs${line ? ` (${line})` : ''}. The checker only calls your ${check.function}() function and doesn't type anything, so move input() out of the way, for example under if __name__ == "__main__":`,
        };
    }
    if (loadError) return { passed: false, cases: [], summary: 'Not checked', problem: `Your file has an error, so its functions couldn't be tested:\n${loadError}` };
    const missing = records.find((r) => r.missing)?.missing;
    if (missing) return { passed: false, cases: [], summary: 'Not checked', problem: `There's no function called ${missing}() in your file. Check the name and spelling.` };
    if (records.length === 0) {
        return { passed: false, cases: [], summary: 'Not checked', problem: `The checker couldn't run your code.\n${run.output.trim().slice(-800) || `(exit code ${run.exitCode})`}` };
    }

    const cases: CaseResult[] = check.cases.map((c, i) => {
        const r = records.find((rec) => rec.i === i);
        const name = c.name ?? r?.call ?? `Case ${i + 1}`;
        if (!r) return { name, passed: false, message: 'Didn\'t run: an earlier case never finished' };
        const printed = r.printed ? ` (it printed ${JSON.stringify(r.printed.slice(0, 120))})` : '';
        if (r.error) return { name, passed: false, message: `Raised ${r.error}`, expected: r.expected };
        return r.ok
            ? { name, passed: true, message: `Returned ${r.actual}` }
            : { name, passed: false, message: `Returned ${r.actual}, expected ${r.expected}${printed}`, expected: r.expected, actual: r.actual };
    });
    return { passed: cases.every((c) => c.passed), cases, summary: summarize(cases) };
}

// --- Harnesses ------------------------------------------------------------------
// Load the learner's file, call the function for each case and print one
// marked JSON line per case. The learner's own prints are captured so they
// can't be mistaken for results.

const PYTHON_HARNESS = String.raw`import contextlib, importlib.util, io, json, math, os, sys, traceback

MARK = "@@VYLOS@@"
out = sys.__stdout__

def emit(record):
    out.write(MARK + json.dumps(record) + "\n")
    out.flush()

def where(exc, path):
    for frame in reversed(traceback.extract_tb(exc.__traceback__)):
        if os.path.abspath(frame.filename) == path:
            return " on line %d" % frame.lineno
    return ""

def same(a, b):
    if isinstance(a, bool) or isinstance(b, bool):
        return type(a) is type(b) and a == b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-9)
    if isinstance(a, (list, tuple)) and isinstance(b, (list, tuple)):
        return len(a) == len(b) and all(same(x, y) for x, y in zip(a, b))
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(same(a[k], b[k]) for k in a)
    return a == b

path = os.path.abspath(sys.argv[1])
spec = json.load(open(sys.argv[2], encoding="utf-8"))
sys.path.insert(0, os.path.dirname(path))

try:
    module_spec = importlib.util.spec_from_file_location("learner_code", path)
    module = importlib.util.module_from_spec(module_spec)
    with contextlib.redirect_stdout(io.StringIO()):
        module_spec.loader.exec_module(module)
except SyntaxError as e:
    emit({"load_error": "SyntaxError on line %s: %s" % (e.lineno, e.msg)})
    sys.exit(0)
except BaseException as e:
    emit({"load_error": "%s: %s%s" % (type(e).__name__, e, where(e, path))})
    sys.exit(0)

fn = getattr(module, spec["function"], None)
if not callable(fn):
    emit({"missing": spec["function"]})
    sys.exit(0)

for i, case in enumerate(spec["cases"]):
    args = case["args"]
    call = "%s(%s)" % (spec["function"], ", ".join(repr(a) for a in args))
    printed = io.StringIO()
    try:
        with contextlib.redirect_stdout(printed):
            actual = fn(*json.loads(json.dumps(args)))
        emit({"i": i, "call": call, "ok": same(actual, case["expected"]), "actual": repr(actual),
              "expected": repr(case["expected"]), "printed": printed.getvalue().strip()[:500]})
    except BaseException as e:
        emit({"i": i, "call": call, "error": "%s: %s%s" % (type(e).__name__, e, where(e, path)), "expected": repr(case["expected"])})
`;

const NODE_HARNESS = String.raw`const fs = require('fs');
const path = require('path');
const util = require('util');
const vm = require('vm');

const MARK = '@@VYLOS@@';
const emit = (record) => process.stdout.write(MARK + JSON.stringify(record) + '\n');
const show = (v) => util.inspect(v, { depth: 6, breakLength: Infinity });

const file = path.resolve(process.argv[2]);
const spec = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));

function describe(e) {
    if (!e || typeof e !== 'object' || !('message' in e)) return 'a thrown value: ' + show(e);
    // The first stack line in the learner's file: "at total (/path/main.js:3:9)", or "/path/main.js:3" for a SyntaxError
    const frame = String(e.stack || '').split('\n').find((l) => l.includes(file));
    const line = frame && frame.match(/:(\d+)(?::\d+)?\)?\s*$/);
    return (e.name || 'Error') + ': ' + e.message + (line ? ' on line ' + line[1] : '');
}

function same(a, b) {
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => same(x, b[i]));
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
        const ka = Object.keys(a), kb = Object.keys(b);
        return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && same(a[k], b[k]));
    }
    return Object.is(a, b) || a === b;
}

let printed = [];
const capture = (...args) => { printed.push(args.map((a) => (typeof a === 'string' ? a : show(a))).join(' ')); };
const learnerConsole = { log: capture, info: capture, warn: capture, error: capture, debug: capture, table: capture };
const mod = { exports: {} };
const context = vm.createContext({
    console: learnerConsole, module: mod, exports: mod.exports, require,
    setTimeout, clearTimeout, setInterval, clearInterval, structuredClone, process: { argv: [], env: {} },
});

try {
    // Scripts can't use export; learners who write it still get checked
    const code = fs.readFileSync(file, 'utf8').replace(/^(\s*)export\s+(default\s+)?(?=(async\s+)?function|const|let|var|class)/gm, '$1');
    vm.runInContext(code, context, { filename: file, timeout: 5000 });
} catch (e) {
    emit({ load_error: describe(e) });
    process.exit(0);
}

let fn;
try { fn = vm.runInContext('typeof ' + spec.function + " === 'function' ? " + spec.function + ' : undefined', context); } catch { fn = undefined; }
if (typeof fn !== 'function') fn = mod.exports && mod.exports[spec.function];
if (typeof fn !== 'function') {
    emit({ missing: spec.function });
    process.exit(0);
}

spec.cases.forEach((c, i) => {
    const call = spec.function + '(' + c.args.map(show).join(', ') + ')';
    printed = [];
    try {
        const actual = fn(...JSON.parse(JSON.stringify(c.args)));
        emit({ i, call, ok: same(actual, c.expected), actual: show(actual), expected: show(c.expected), printed: printed.join('\n').slice(0, 500) });
    } catch (e) {
        emit({ i, call, error: describe(e), expected: show(c.expected) });
    }
});
`;
