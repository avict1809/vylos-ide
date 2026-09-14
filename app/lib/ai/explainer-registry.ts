import type { Disposable } from '../disposable';

/**
 * Who explains a function or class when the learner hovers its name
 * (code-hover.ts). code-hover decides what gets underlined; explainers decide
 * what the hover says.
 */

export interface ExplainRequest {
    /** The whole definition block. */
    code: string;
    languageId: string;
    /** The function or class name. */
    name: string;
}

/** `null`: not this explainer's job, ask the next one. `error`: shown in the hover but not cached. */
export type ExplainResult = { text: string } | { error: string } | null;

export interface Explainer {
    id: string;
    /** Shown in the hover heading, e.g. "Vylos AI". */
    label: string;
    /** Monaco language ids this explainer handles. Omit to handle every language. */
    languages?: string[];
    explain: (request: ExplainRequest) => Promise<ExplainResult>;
}

const explainers: Explainer[] = [];

/** Same id replaces the existing explainer (this also keeps hot reload working). */
export function registerExplainer(explainer: Explainer): Disposable {
    const existing = explainers.findIndex((e) => e.id === explainer.id);
    if (existing !== -1) explainers.splice(existing, 1);
    explainers.push(explainer);
    return {
        dispose: () => {
            const i = explainers.indexOf(explainer);
            if (i !== -1) explainers.splice(i, 1);
        },
    };
}

/** Explainers to ask in order: newest language-specific ones first, then newest general ones. */
export function getExplainers(languageId: string): Explainer[] {
    const newestFirst = [...explainers].reverse();
    return [
        ...newestFirst.filter((e) => e.languages?.includes(languageId)),
        ...newestFirst.filter((e) => !e.languages),
    ];
}
