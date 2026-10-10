'use client';

import type { GeminiContent, GeminiFunctionDeclaration, GeminiPart } from './gemini-client';
import { TEXT_ASSISTANT_RULES } from './guidelines';
import {
    useAiProviderStore, type LocalModel, type LocalTarget, type ToolSupport,
} from '../stores/ai-provider-store';

/**
 * Talking to a model on the learner's own machine.
 *
 * Everything in the app speaks Gemini's shape — `contents` of `parts`, tools
 * declared with OBJECT/STRING types. Local runtimes speak the OpenAI chat API
 * instead. This module is the translation in both directions, so nothing else
 * has to know which one is answering.
 *
 * The requests themselves go through the main process (window.electron.localAi),
 * because a local server will not accept a cross-origin call from app://.
 */

const LOCAL_ERRORS = {
    noBridge: 'Local models need the desktop app.',
    // Small models do this on a long teaching prompt: they answer the easy
    // tool probe, then return nothing at all once the real lesson arrives.
    empty: 'The local model replied with nothing. Models under about 7B often do this on a teaching prompt — try a bigger one, or send another message.',
} as const;

/** Cut a reasoning model's thinking out of its answer. */
export function stripThinking(text: string): string {
    const closed = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
    // An answer that ran out of room mid-thought never closes the tag
    const open = closed.search(/<think>/i);
    return (open === -1 ? closed : closed.slice(0, open)).trim();
}

// --- Gemini -> OpenAI -------------------------------------------------------

const JSON_TYPES: Record<string, string> = {
    STRING: 'string', NUMBER: 'number', INTEGER: 'integer',
    BOOLEAN: 'boolean', ARRAY: 'array', OBJECT: 'object',
};

/** Gemini's schemas are JSON Schema with shouted type names. */
function toJsonSchema(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(toJsonSchema);
    if (!node || typeof node !== 'object') return node;

    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (key === 'type' && typeof value === 'string') out[key] = JSON_TYPES[value] ?? value.toLowerCase();
        else out[key] = toJsonSchema(value);
    }
    return out;
}

export interface OpenAiTool {
    type: 'function';
    function: { name: string; description: string; parameters: unknown };
}

export function toOpenAiTools(declarations: GeminiFunctionDeclaration[]): OpenAiTool[] {
    return declarations.map((d) => ({
        type: 'function',
        function: {
            name: d.name,
            description: d.description,
            // A tool with no arguments still needs an object schema here
            parameters: d.parameters ? toJsonSchema(d.parameters) : { type: 'object', properties: {} },
        },
    }));
}

export interface OpenAiMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content?: string | null;
    tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
    tool_call_id?: string;
    name?: string;
}

const textOf = (parts: GeminiPart[]) =>
    parts.filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('').trim();

/**
 * The conversation, as an OpenAI server wants it.
 *
 * The one awkward part is tool results: OpenAI matches each result to the call
 * it answers by id, and Gemini's parts often carry no id at all. Calls are
 * therefore numbered as they go past, and results are matched to the most
 * recent unanswered call of the same name — which is the order they are
 * produced in anyway.
 */
export function toOpenAiMessages(system: string, contents: GeminiContent[]): OpenAiMessage[] {
    const messages: OpenAiMessage[] = [{ role: 'system', content: system }];
    let pending: { name: string; id: string }[] = [];

    contents.forEach((turn, i) => {
        if (turn.role === 'model') {
            const calls = turn.parts.flatMap((p) => (p.functionCall ? [p.functionCall] : []));
            const text = textOf(turn.parts);
            if (!text && calls.length === 0) return;

            pending = calls.map((call, j) => ({ name: call.name, id: call.id ?? `call_${i}_${j}` }));
            messages.push({
                role: 'assistant',
                content: text || null,
                ...(calls.length
                    ? {
                        tool_calls: calls.map((call, j) => ({
                            id: pending[j].id,
                            type: 'function' as const,
                            function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
                        })),
                    }
                    : {}),
            });
            return;
        }

        for (const result of turn.parts.flatMap((p) => (p.functionResponse ? [p.functionResponse] : []))) {
            const at = pending.findIndex((p) => p.name === result.name);
            const id = result.id ?? (at === -1 ? `call_${i}_${result.name}` : pending[at].id);
            if (at !== -1) pending.splice(at, 1);
            messages.push({ role: 'tool', tool_call_id: id, name: result.name, content: JSON.stringify(result.response ?? {}) });
        }

        const text = textOf(turn.parts);
        if (text) messages.push({ role: 'user', content: text });
    });

    return messages;
}

// --- OpenAI -> Gemini -------------------------------------------------------

/** Models are not reliable JSON writers; an unreadable call becomes no arguments. */
function parseArgs(raw: unknown): Record<string, unknown> {
    if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
    if (typeof raw !== 'string' || !raw.trim()) return {};
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
    } catch {
        return {};
    }
}

interface OpenAiReply {
    choices?: { message?: OpenAiMessage }[];
}

/** One model turn, back in the shape the rest of the app reads. */
export function fromOpenAiReply(reply: OpenAiReply): { content: GeminiContent; text: string } {
    const message = reply.choices?.[0]?.message;
    const text = stripThinking(typeof message?.content === 'string' ? message.content : '');
    const parts: GeminiPart[] = [];
    if (text) parts.push({ text });

    for (const call of message?.tool_calls ?? []) {
        const name = call?.function?.name;
        if (!name) continue;
        parts.push({ functionCall: { name, args: parseArgs(call.function?.arguments), id: call.id } });
    }
    return { content: { role: 'model', parts }, text };
}

// --- Calling ----------------------------------------------------------------

const bridge = () => (typeof window === 'undefined' ? undefined : window.electron?.localAi);

interface ChatOptions {
    system: string;
    tools?: GeminiFunctionDeclaration[];
    /** Cancels this request when passed to cancelLocalRequest */
    token?: string;
    temperature?: number;
}

/** Either the server's reply, or why there isn't one. */
type ChatResult = { error: string } | { reply: OpenAiReply };

async function chat(target: LocalTarget, messages: OpenAiMessage[], opts: ChatOptions): Promise<ChatResult> {
    const local = bridge();
    if (!local) return { error: LOCAL_ERRORS.noBridge };

    const result = await local.chat(
        target.endpoint,
        {
            model: target.model,
            messages,
            stream: false,
            ...(opts.temperature === undefined ? {} : { temperature: opts.temperature }),
            ...(opts.tools?.length ? { tools: toOpenAiTools(opts.tools) } : {}),
        },
        opts.token,
    );
    if (!result.ok) return { error: result.error };
    return { reply: result.data as OpenAiReply };
}

// The turn in flight, so Stop can cut a slow model off. Only one tutoring
// turn runs at a time, which is what the tutor's `busy` flag enforces.
let currentTurn: string | null = null;

/** One step of a tutoring conversation, mirroring generateTurn. */
export async function localGenerateTurn(
    contents: GeminiContent[],
    opts: { system: string; tools?: GeminiFunctionDeclaration[]; target: LocalTarget },
): Promise<{ content: GeminiContent; text: string } | { error: string }> {
    const token = `turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    currentTurn = token;
    let result: ChatResult;
    try {
        result = await chat(opts.target, toOpenAiMessages(opts.system, contents), {
            system: opts.system,
            tools: opts.tools,
            token,
        });
    } finally {
        if (currentTurn === token) currentTurn = null;
    }
    if ('error' in result) return { error: result.error };

    const turn = fromOpenAiReply(result.reply);
    if (turn.content.parts.length === 0) return { error: LOCAL_ERRORS.empty };

    // A model that answers a tutoring prompt without ever calling a tool is
    // one that cannot; remember it so `auto` stops sending it the lesson.
    if (opts.tools?.length && turn.content.parts.some((p) => p.functionCall)) {
        useAiProviderStore.getState().setToolSupport(opts.target.model, 'yes');
    }
    return turn;
}

/** A one-shot answer, mirroring generateContent. Returns the text or an error message. */
export async function localGenerateContent(prompt: string, target: LocalTarget): Promise<string> {
    const result = await chat(target, [
        { role: 'system', content: TEXT_ASSISTANT_RULES },
        { role: 'user', content: prompt },
    ], { system: TEXT_ASSISTANT_RULES });
    if ('error' in result) return result.error;

    const { text } = fromOpenAiReply(result.reply);
    return text || LOCAL_ERRORS.empty;
}

/** Stops a local turn the learner gave up on. Harmless when none is running. */
export function cancelLocalTurn() {
    const token = currentTurn;
    currentTurn = null;
    if (token) void bridge()?.cancel(token);
}

// --- Setting it up ----------------------------------------------------------

/** Asks the endpoint what it is serving and remembers the answer. */
export async function refreshLocalModels(endpoint: string): Promise<LocalModel[]> {
    const store = useAiProviderStore.getState();
    const local = bridge();
    if (!local) {
        store.setStatus('unreachable', LOCAL_ERRORS.noBridge);
        return [];
    }

    store.setStatus('checking');
    const result = await local.models(endpoint);
    if (!result.ok) {
        store.setModels([]);
        store.setStatus('unreachable', result.error);
        return [];
    }
    store.setModels(result.models);
    store.setStatus(result.models.length ? 'ready' : 'unreachable',
        result.models.length ? null : 'That server is running but has no models. Pull one first, e.g. "ollama pull qwen3".');
    return result.models;
}

/** The smallest possible tool call, to find out whether a model can make one. */
const PROBE_TOOL: GeminiFunctionDeclaration = {
    name: 'report_ready',
    description: 'Report that you are ready to teach. Call this immediately, with no arguments.',
    parameters: { type: 'OBJECT', properties: {} },
};

/**
 * Whether this model can drive the tutor. Asking it to make one trivial call
 * is the only honest test: a model without tool support answers in prose, and
 * some runtimes reject the request outright.
 */
export async function probeToolSupport(target: LocalTarget): Promise<ToolSupport> {
    const result = await chat(
        target,
        [
            { role: 'system', content: 'You are a tutor setting up. Use the tool you are given.' },
            { role: 'user', content: 'Call report_ready now.' },
        ],
        { system: '', tools: [PROBE_TOOL], temperature: 0 },
    );

    const support: ToolSupport = 'error' in result
        ? 'no'
        : fromOpenAiReply(result.reply).content.parts.some((p) => p.functionCall) ? 'yes' : 'no';
    useAiProviderStore.getState().setToolSupport(target.model, support);
    return support;
}
