"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_LOCAL_ENDPOINT = void 0;
exports.initLocalAi = initLocalAi;
const ipc_1 = require("./ipc");
/**
 * Local AI models: anything that speaks the OpenAI chat API — Ollama, LM
 * Studio, llama.cpp's server, vLLM — so a learner's own machine can do the
 * teaching. No daily limit, no account, and it keeps working offline.
 *
 * The requests are made here rather than in the renderer because the app page
 * is served from app://, an origin no local server allows through CORS. This
 * process has no such restriction, so the endpoint is reached directly.
 *
 * Nothing here knows about tutoring; it is a thin, cancellable pipe. The
 * conversation itself is translated in app/lib/ai/local-provider.ts.
 */
/** Ollama's OpenAI-compatible endpoint, the most common setup by far. */
exports.DEFAULT_LOCAL_ENDPOINT = 'http://127.0.0.1:11434/v1';
// Listing models should fail fast; generating can take a while on a laptop
// that is loading a model into memory for the first time.
const LIST_TIMEOUT_MS = 4000;
const CHAT_TIMEOUT_MS = 10 * 60 * 1000;
const inFlight = new Map();
/** A usable http(s) base URL, with any trailing slash removed. */
function normalizeEndpoint(raw) {
    if (typeof raw !== 'string' || !raw.trim())
        return null;
    try {
        const url = new URL(raw.trim());
        if (url.protocol !== 'http:' && url.protocol !== 'https:')
            return null;
        return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
    }
    catch {
        return null;
    }
}
/** Why a request never reached the model, in words a learner can act on. */
function reachError(endpoint, e) {
    const message = e instanceof Error ? e.message : String(e);
    if (e instanceof Error && e.name === 'AbortError')
        return 'The local model took too long and was stopped.';
    if (/ECONNREFUSED|fetch failed|other side closed/i.test(message)) {
        return `Nothing is answering at ${endpoint}. Start your local AI server (for example "ollama serve") and try again.`;
    }
    return `Could not reach the local model at ${endpoint}: ${message}`;
}
async function request(url, init, timeoutMs, token) {
    const controller = new AbortController();
    if (token)
        inFlight.set(token, controller);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    }
    finally {
        clearTimeout(timer);
        if (token)
            inFlight.delete(token);
    }
}
/**
 * Ollama reports how much disk each model takes, which the settings screen
 * shows — the whole point of a local model is knowing what it costs you.
 */
async function ollamaSizes(origin) {
    const sizes = new Map();
    try {
        const res = await request(`${origin}/api/tags`, { method: 'GET' }, LIST_TIMEOUT_MS);
        if (!res.ok)
            return sizes;
        const { models } = await res.json();
        for (const m of models ?? []) {
            if (typeof m.name === 'string' && typeof m.size === 'number')
                sizes.set(m.name, m.size);
        }
    }
    catch {
        // Not Ollama, or not answering: sizes are a nicety, not a requirement
    }
    return sizes;
}
function initLocalAi() {
    /** The models this endpoint is serving, or why it couldn't be asked. */
    (0, ipc_1.handle)('localai:models', async (_event, rawEndpoint) => {
        const endpoint = normalizeEndpoint(rawEndpoint);
        if (!endpoint)
            return { ok: false, error: 'That is not a valid http:// or https:// address.' };
        try {
            const res = await request(`${endpoint}/models`, { method: 'GET' }, LIST_TIMEOUT_MS);
            if (!res.ok) {
                return { ok: false, error: `The server at ${endpoint} answered ${res.status}. Is that the right address?` };
            }
            const body = await res.json();
            const ids = (body.data ?? []).map((m) => m.id).filter((id) => !!id);
            const sizes = await ollamaSizes(new URL(endpoint).origin);
            return {
                ok: true,
                endpoint,
                models: ids.sort().map((id) => ({ id, ...(sizes.has(id) ? { size: sizes.get(id) } : {}) })),
            };
        }
        catch (e) {
            return { ok: false, error: reachError(endpoint, e) };
        }
    });
    /** One chat completion. `body` is passed through as the caller built it. */
    (0, ipc_1.handle)('localai:chat', async (_event, rawEndpoint, body, token) => {
        const endpoint = normalizeEndpoint(rawEndpoint);
        if (!endpoint)
            return { ok: false, error: 'No local AI address is set.' };
        try {
            const res = await request(`${endpoint}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, CHAT_TIMEOUT_MS, typeof token === 'string' ? token : undefined);
            const text = await res.text();
            if (!res.ok) {
                // Local servers put the real complaint in the body — an unknown
                // model, a context that doesn't fit — so pass it on.
                const detail = text.slice(0, 400).trim();
                return { ok: false, error: `The local model refused the request (${res.status})${detail ? `: ${detail}` : '.'}` };
            }
            try {
                return { ok: true, data: JSON.parse(text) };
            }
            catch {
                return { ok: false, error: 'The local model sent a reply that was not valid JSON.' };
            }
        }
        catch (e) {
            return { ok: false, error: reachError(endpoint, e) };
        }
    });
    /** Stops a request the learner gave up on. */
    (0, ipc_1.handle)('localai:cancel', (_event, token) => {
        if (typeof token !== 'string')
            return false;
        inFlight.get(token)?.abort();
        return inFlight.delete(token);
    });
}
