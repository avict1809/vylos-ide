import { create } from 'zustand';

/**
 * Commands waiting for the learner's yes or no. The AI tutor and extensions
 * queue a request here when a command isn't one that may run without asking
 * (command-policy.ts); CommandApproval shows the oldest one.
 */

export interface ApprovalRequest {
    id: number;
    command: string;
    cwd: string | null;
    /** Who wants it run, e.g. "Acyrx (your tutor)" or an extension's name */
    requester: string;
    /** Why it needs approval */
    reason: string;
}

interface ApprovalStore {
    queue: ApprovalRequest[];
    decide: (id: number, approved: boolean) => void;
}

/** Unanswered requests are declined after this, so a forgotten prompt never runs later. */
const EXPIRES_MS = 3 * 60_000;

const waiting = new Map<number, (approved: boolean) => void>();
let nextId = 0;

export const useApprovalStore = create<ApprovalStore>((set) => ({
    queue: [],
    decide: (id, approved) => {
        waiting.get(id)?.(approved);
        waiting.delete(id);
        set((s) => ({ queue: s.queue.filter((r) => r.id !== id) }));
    },
}));

/** Asks the learner; resolves true only if they approve. */
export function requestApproval(request: Omit<ApprovalRequest, 'id'>): Promise<boolean> {
    const id = ++nextId;
    return new Promise((resolve) => {
        waiting.set(id, resolve);
        useApprovalStore.setState((s) => ({ queue: [...s.queue, { ...request, id }] }));
        setTimeout(() => {
            if (waiting.has(id)) useApprovalStore.getState().decide(id, false);
        }, EXPIRES_MS);
    });
}
