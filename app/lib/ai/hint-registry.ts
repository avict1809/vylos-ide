import type { Disposable } from '../disposable';

/**
 * Hint ladders for the step-by-step problem solver (step-guide.ts). A ladder
 * decides what each rung says; step-guide decides when a rung is shown, one
 * click at a time, so help always comes before answers.
 */

/** How much a rung gives away, weakest first. */
export const HINT_LEVELS = ['nudge', 'insight', 'algorithm', 'pseudocode', 'solution'] as const;
export type HintLevel = (typeof HINT_LEVELS)[number];

export interface HintRequest {
    /** The learner's problem comment, e.g. "how do I reverse a linked list?" */
    problem: string;
    languageId: string;
    /** Code around the problem comment. */
    codeContext: string;
    /** Rungs already shown for this problem, in order. */
    given: { label: string; text: string }[];
}

export interface HintStep {
    level: HintLevel;
    /** Written into the code above the hint, e.g. "Hint 1". */
    label: string;
    /** The clickable lens text, e.g. "✦ Stuck? Get Hint 1". */
    title: string;
    /** How the text is inserted: wrapped comment prose, comment lines kept as-is, or real code. */
    format: 'prose' | 'lines' | 'code';
    /** The rung's text, or null if it could not be produced (the learner can click again). */
    produce: (request: HintRequest) => Promise<string | null>;
}

export interface HintLadder {
    id: string;
    /** Monaco language ids this ladder is for. Omit to serve every language. */
    languages?: string[];
    steps: HintStep[];
}

const ladders: HintLadder[] = [];

/**
 * Throws if the ladder gives away more on an earlier rung than a later one:
 * a ladder may never lead with the answer.
 */
export function registerHintLadder(ladder: HintLadder): Disposable {
    if (ladder.steps.length === 0) throw new Error(`Hint ladder "${ladder.id}" has no steps`);
    ladder.steps.forEach((step, i) => {
        const prev = ladder.steps[i - 1];
        if (prev && HINT_LEVELS.indexOf(step.level) < HINT_LEVELS.indexOf(prev.level)) {
            throw new Error(`Hint ladder "${ladder.id}": "${step.label}" gives less away than the "${prev.label}" before it`);
        }
    });

    // Same id replaces the existing ladder (this also keeps hot reload working)
    const existing = ladders.findIndex((l) => l.id === ladder.id);
    if (existing !== -1) ladders.splice(existing, 1);
    ladders.push(ladder);
    return {
        dispose: () => {
            const i = ladders.indexOf(ladder);
            if (i !== -1) ladders.splice(i, 1);
        },
    };
}

/** The ladder for a new problem: the newest one made for this language, else the newest general one. */
export function getHintLadder(languageId: string): HintLadder | undefined {
    const newestFirst = [...ladders].reverse();
    return (
        newestFirst.find((l) => l.languages?.includes(languageId)) ??
        newestFirst.find((l) => !l.languages)
    );
}
