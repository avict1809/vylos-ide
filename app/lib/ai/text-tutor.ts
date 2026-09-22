'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { generateTurn, type GeminiContent, type GeminiFunctionDeclaration, type GeminiPart } from './gemini-client';
import { buildTutorSystemInstruction, cancelTutorActions, describeTutorTool, executeTutorTool, getTutorToolDeclarations } from './tutor-tools';
import { cancelLocalTurn } from './local-provider';
import { useVoiceStore } from '../stores/voice-store';
import { useFileStore } from '../useFileStore';
import type { LessonRef } from '../learning/lesson-utils';

/**
 * The tutor, in writing. Same lesson workflow, same tools and same completion
 * rules as the voice tutor — only the conversation travels as text through
 * the ai-generate function instead of a Live audio session. For learners who
 * can't talk out loud, or whose voice sessions ran out for the day.
 *
 * The current lesson is shared with the voice tutor (voice-store's
 * lessonContext), so a learner can switch between talking and typing.
 */

export interface ChatEntry {
    id: number;
    role: 'user' | 'tutor' | 'action' | 'error';
    text: string;
}

const MAX_ENTRIES = 200;
/** Tool rounds per learner message before the tutor has to answer */
const MAX_STEPS = 8;
/** Conversation sent with each request; older exchanges are dropped first */
const HISTORY_BUDGET = 150_000;
const MAX_TOOL_RESULT = 30_000;
const KICKOFF = 'Please start teaching the current lesson.';

interface TextTutorStore {
    entries: ChatEntry[];
    /** The conversation as the model sees it, tool calls and results included */
    history: GeminiContent[];
    busy: boolean;
    /** What the tutor is doing right now, e.g. "Running: python3 main.py" */
    activity: string | null;
}

let nextId = 1;
let runToken = 0;

export const useTextTutorStore = create<TextTutorStore>()(
    persist(
        (): TextTutorStore => ({ entries: [], history: [], busy: false, activity: null }),
        {
            name: 'vylos-text-tutor',
            partialize: (s) => ({ entries: s.entries, history: s.history }),
            onRehydrateStorage: () => (state) => {
                nextId = Math.max(0, ...(state?.entries ?? []).map((e) => e.id)) + 1;
            },
        }
    )
);

const add = (role: ChatEntry['role'], text: string) =>
    useTextTutorStore.setState((s) => ({ entries: [...s.entries, { id: nextId++, role, text }].slice(-MAX_ENTRIES) }));

/** A learner's typed message, as opposed to tool results sent back on their side. */
const isLearnerTurn = (c: GeminiContent) => c.role === 'user' && c.parts.some((p) => typeof p.text === 'string');

/** Keeps the request under budget by dropping the oldest whole exchanges. */
export function trimHistory(history: GeminiContent[], budget = HISTORY_BUDGET): GeminiContent[] {
    let out = history;
    while (JSON.stringify(out).length > budget) {
        const next = out.findIndex((c, i) => i > 0 && isLearnerTurn(c));
        if (next === -1) break;
        out = out.slice(next);
    }
    return out;
}

/** Tool declarations for generateContent, which refuses an OBJECT without properties. */
function apiTools(): GeminiFunctionDeclaration[] {
    return getTutorToolDeclarations().map((d) =>
        Object.keys(d.parameters?.properties ?? {}).length ? d : { name: d.name, description: d.description }
    );
}

function capResult(result: object): object {
    const json = JSON.stringify(result);
    return json.length > MAX_TOOL_RESULT ? { truncated: true, result: json.slice(0, MAX_TOOL_RESULT) } : result;
}

/** The voice and text tutors both act on the editor, so only one teaches at a time. */
export const voiceIsLive = () => ['live', 'connecting'].includes(useVoiceStore.getState().status);

async function runTurn(token: number) {
    const store = useTextTutorStore;
    store.setState({ busy: true, activity: null });
    try {
        for (let step = 0; step < MAX_STEPS; step++) {
            const history = trimHistory(store.getState().history);
            const reply = await generateTurn(history, {
                system: buildTutorSystemInstruction({ mode: 'text' }),
                tools: apiTools(),
                feature: 'tutor-text',
            });
            if (token !== runToken) return;
            if ('error' in reply) {
                add('error', reply.error);
                return;
            }

            store.setState((s) => ({ history: [...s.history, reply.content] }));
            if (reply.text.trim()) add('tutor', reply.text.trim());

            const calls = reply.content.parts.filter((p): p is GeminiPart & { functionCall: NonNullable<GeminiPart['functionCall']> } => !!p.functionCall);
            if (calls.length === 0) return;

            const responses: GeminiPart[] = [];
            for (const { functionCall: call } of calls) {
                const args = call.args ?? {};
                const label = describeTutorTool(call.name, args);
                if (label) {
                    store.setState({ activity: label });
                    add('action', label);
                }
                let result: object;
                try {
                    result = await executeTutorTool(call.name, args);
                } catch (e) {
                    result = { error: e instanceof Error ? e.message : String(e) };
                }
                if (token !== runToken) return;
                responses.push({ functionResponse: { name: call.name, response: capResult(result), ...(call.id ? { id: call.id } : {}) } });
            }
            store.setState((s) => ({ history: [...s.history, { role: 'user', parts: responses }], activity: null }));
        }
        add('error', 'The tutor took too many steps without answering. Send another message to continue.');
    } finally {
        if (token === runToken) store.setState({ busy: false, activity: null });
    }
}

/**
 * A model turn with function calls must be followed by their results. After
 * Stop, the last calls may have none: answer them so the conversation stays valid.
 */
export function closeDanglingCalls(history: GeminiContent[]): GeminiContent[] {
    const last = history[history.length - 1];
    const calls = last?.role === 'model' ? last.parts.filter((p) => p.functionCall) : [];
    if (calls.length === 0) return history;
    return [...history, {
        role: 'user',
        parts: calls.map((p) => ({ functionResponse: { name: p.functionCall!.name, response: { error: 'Stopped by the learner before this finished.' }, ...(p.functionCall!.id ? { id: p.functionCall!.id } : {}) } })),
    }];
}

/** Sends a message from the learner. `hidden` messages steer the tutor without appearing in the chat. */
export async function sendTutorMessage(text: string, opts: { hidden?: boolean } = {}) {
    const message = text.trim();
    if (!message || useTextTutorStore.getState().busy) return;
    if (!opts.hidden) add('user', message);
    useTextTutorStore.setState((s) => ({ history: [...closeDanglingCalls(s.history), { role: 'user', parts: [{ text: message }] }] }));
    await runTurn(++runToken);
}

/** Stops waiting for the tutor; anything it was doing is abandoned. */
export function stopTextTutor() {
    runToken++;
    cancelTutorActions();
    // A local model can be slow; don't leave it generating into nothing
    cancelLocalTurn();
    useTextTutorStore.setState({ busy: false, activity: null });
}

export function newTextChat() {
    stopTextTutor();
    useTextTutorStore.setState({ entries: [], history: [] });
}

/** Starts (or restarts) teaching a lesson in writing, in the Vylos AI panel. */
export async function startTextLesson(ref: LessonRef) {
    newTextChat();
    useVoiceStore.getState().setLessonContext(ref);
    useFileStore.getState().setActiveView('ai');
    await sendTutorMessage(KICKOFF, { hidden: true });
}
