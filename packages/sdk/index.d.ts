/**
 * @vylos/sdk — the API available to Vylos code extensions.
 *
 * Status: 0.x, proposed. Names and shapes may still change between minor
 * versions; pin `engines.vylos` in your package.json.
 *
 * Your extension runs in a sandboxed Web Worker: no Node.js (`fs`,
 * `child_process`, …), no DOM, no network. Everything it does goes through
 * this API, and Vylos checks each call against the permissions the learner
 * approved. Implemented by app/lib/extensions/sandbox.ts (worker side) and
 * app/lib/extensions/code-host.ts (checks and effects).
 */

export interface Disposable {
    dispose(): void;
}

export interface ExtensionContext {
    /** Disposed when the extension stops; push your registrations here. */
    subscriptions: Disposable[];
    extension: { id: string; version: string };
}

/** Export this from your "main" file. Vylos waits up to 10 seconds for it. */
export type Activate = (context: ExtensionContext) => void | Promise<void>;
/** Optional. Called before the extension stops; it gets about 1 second. */
export type Deactivate = () => void | Promise<void>;

// --- vylos.tutor ------------------------------------------------------------

export interface TutorToolDeclaration {
    /** Lowercase letters, digits, underscores. The tutor sees it as `ext_<publisher>_<name>`. */
    name: string;
    /** Tells the tutor when and why to call the tool. Up to 1000 characters. */
    description: string;
    parameters?: {
        type: 'OBJECT';
        properties: Record<string, { type: 'STRING' | 'NUMBER' | 'INTEGER' | 'BOOLEAN'; description?: string }>;
        required?: string[];
    };
}

export namespace tutor {
    /**
     * Gives the voice tutor a new ability. The tutor decides when to call it
     * and gets back whatever object you return (at most 16,000 characters as
     * JSON). Return `{ error: '…' }` for failures the tutor should explain.
     * Takes effect from the next tutor session. Timeout: 150 seconds.
     */
    function registerTool(
        declaration: TutorToolDeclaration,
        execute: (args: Record<string, string | number | boolean>) => unknown | Promise<unknown>
    ): Disposable;
}

// --- vylos.hints ------------------------------------------------------------

/** How much a rung gives away, weakest first. A ladder's levels may never decrease. */
export type HintLevel = 'nudge' | 'insight' | 'algorithm' | 'pseudocode' | 'solution';

export interface HintRequest {
    /** The learner's problem comment, e.g. "how do I reverse a linked list?" */
    problem: string;
    languageId: string;
    /** Code around the problem comment */
    codeContext: string;
    /** Rungs already shown, in order */
    given: { label: string; text: string }[];
}

export interface HintStep {
    level: HintLevel;
    /** Written above the hint in the code, e.g. "Hint 1". Up to 40 characters. */
    label: string;
    /** The clickable lens text, e.g. "✦ Stuck? Get Hint 1". Up to 60 characters. */
    title: string;
    /** 'prose' wraps into comments, 'lines' keeps line breaks as comments, 'code' inserts real code. */
    format: 'prose' | 'lines' | 'code';
    /** The rung's text, or null to let the learner try again. Timeout: 60 seconds. */
    produce: (request: HintRequest) => string | null | Promise<string | null>;
}

export namespace hints {
    /**
     * Replaces the step-by-step problem solver's ladder (Hint 1 → … →
     * Implementation) for these languages. Vylos shows one rung per click, so
     * help always comes before answers. Needs `workspace.read`: rungs receive
     * the learner's code.
     */
    function registerHintLadder(ladder: { languages?: string[]; steps: HintStep[] }): Disposable;
}

// --- vylos.learning ---------------------------------------------------------

export interface ExplainRequest {
    /** The whole function or class */
    code: string;
    languageId: string;
    name: string;
}

export namespace learning {
    /**
     * Explains a function or class when the learner hovers its name. Return
     * Markdown, or null to let the next explainer (finally Vylos AI) answer.
     * Newest registrations are asked first. Needs `workspace.read`.
     * Timeout: 30 seconds.
     */
    function registerExplainer(explainer: {
        /** Shown in the hover heading, e.g. "Python Coach". Up to 40 characters. */
        label: string;
        /** Monaco language ids, e.g. ["python"]. Omit for every language. */
        languages?: string[];
        explain: (request: ExplainRequest) => string | null | Promise<string | null>;
    }): Disposable;
}

// --- vylos.coach ------------------------------------------------------------

export interface CoachNote {
    /** 1-based */
    line: number;
    column?: number;
    endLine?: number;
    endColumn?: number;
    /** What to notice. Up to 500 characters. */
    message: string;
    /** Why it matters. Shown under the message; this is where the teaching happens. */
    why?: string;
    severity?: 'info' | 'warning';
}

export namespace coach {
    /**
     * Reads the file the learner is editing (shortly after they stop typing)
     * and points out things worth learning, as notes in the editor. At most
     * 100 notes are shown. Needs `workspace.read`. Timeout: 10 seconds, so
     * keep it fast; a coach that times out is stopped.
     */
    function registerCoach(coach: {
        label: string;
        languages?: string[];
        check: (request: { code: string; languageId: string; path?: string }) => CoachNote[] | Promise<CoachNote[]>;
    }): Disposable;
}

// --- vylos.ai ---------------------------------------------------------------

export namespace ai {
    /**
     * Asks Vylos AI. Needs `ai.generate`. Counts toward the learner's daily
     * AI limit, and each extension gets at most 50 requests a day. Rejects
     * with a message the learner can understand (e.g. not signed in).
     */
    function generate(prompt: string): Promise<string>;
}

// --- vylos.workspace --------------------------------------------------------

export namespace workspace {
    /** The open project folder, or null. Needs `workspace.read`. */
    function getRoot(): Promise<string | null>;
    /** Paths are relative to the project folder; nothing outside it is reachable. Needs `workspace.read`. */
    function readFile(path: string): Promise<string>;
    function listFiles(path?: string): Promise<{ name: string; isDirectory: boolean }[]>;
    /** The file in the editor, including unsaved changes. Needs `workspace.read`. */
    function getActiveFile(): Promise<{ path: string; languageId: string | null; text: string } | null>;
    /** Needs `workspace.write`. */
    function writeFile(path: string, content: string): Promise<void>;
}

// --- vylos.terminal ---------------------------------------------------------

export namespace terminal {
    /**
     * Runs a command in the learner's terminal, where they can see it.
     * Needs `terminal.run`. The terminal is not interactive: commands can't
     * read keyboard input.
     */
    function run(command: string, options?: { cwd?: string; timeoutSeconds?: number }): Promise<{ exitCode: number; output: string; timedOut: boolean }>;
}

// --- vylos.learner ----------------------------------------------------------

export namespace learner {
    /** Lesson ids the learner finished in a course. Needs `learner.read`. */
    function getCompletedLessons(courseId: string): Promise<string[]>;
    /** Needs `learner.read`. */
    function onLessonCompleted(listener: (event: { courseId: string; lessonId: string; lessonTitle: string | null }) => void): Disposable;
}
