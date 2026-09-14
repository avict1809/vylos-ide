import type { Disposable } from '../disposable';

/**
 * Coaches read the learner's code and point out things worth learning, with
 * why they matter, as notes in the editor (code-coach.ts). Unlike a linter,
 * a note teaches; it doesn't offer a one-click fix.
 */

export interface CoachRequest {
    code: string;
    languageId: string;
    /** Path of the file, when it has one */
    path?: string;
}

export interface CoachNote {
    /** 1-based */
    line: number;
    column?: number;
    endLine?: number;
    endColumn?: number;
    message: string;
    /** Why it matters, in a sentence or two */
    why?: string;
    severity?: 'info' | 'warning';
}

export interface Coach {
    id: string;
    /** Shown as the note's source, e.g. "Python Coach" */
    label: string;
    /** Monaco language ids this coach reads. Omit for every language. */
    languages?: string[];
    check: (request: CoachRequest) => Promise<CoachNote[]>;
}

const coaches: Coach[] = [];
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

/** Same id replaces the existing coach. */
export function registerCoach(coach: Coach): Disposable {
    const existing = coaches.findIndex((c) => c.id === coach.id);
    if (existing !== -1) coaches.splice(existing, 1);
    coaches.push(coach);
    changed();
    return {
        dispose: () => {
            const i = coaches.indexOf(coach);
            if (i === -1) return;
            coaches.splice(i, 1);
            changed();
        },
    };
}

export const getCoaches = (languageId: string): Coach[] =>
    coaches.filter((c) => !c.languages || c.languages.includes(languageId));

export function onCoachesChanged(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}
