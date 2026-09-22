// Text generation for the app's text features: single-shot answers (hover
// explanations, step guides, roadmaps, lesson notes, error help) and the text
// tutor's conversation, which can call the same tools as the voice tutor.
// Holds the Gemini key so the app never ships it; see
// app/lib/ai/gemini-client.ts for the callers.
import { corsHeaders, envInt, geminiKey, guard, json } from '../_shared/guard.ts';

// Server-side so it can change with a redeploy instead of an app release.
// gemini-2.5-flash is closed to new API keys (404 "no longer available to new users").
const MODEL = Deno.env.get('AI_TEXT_MODEL') || 'gemini-3.6-flash';
const DAILY_LIMIT = envInt('AI_DAILY_TEXT_LIMIT', 200);
// Includes thinking tokens, which run to ~2x the visible answer.
const MAX_OUTPUT_TOKENS = envInt('AI_MAX_OUTPUT_TOKENS', 8192);
const MAX_PROMPT_CHARS = 100_000;
// The tutor's instructions carry the lesson, the course's guidelines and the rules
const MAX_SYSTEM_CHARS = 40_000;
// A tutor conversation, tool calls and results included
const MAX_CONTENTS_CHARS = 200_000;
const MAX_CONTENTS = 200;
const MAX_TOOLS_CHARS = 60_000;
const MAX_TOOLS = 64;

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A conversation as the Gemini API takes it: alternating user and model turns made of parts. */
function validContents(contents: unknown): contents is Json[] {
    return Array.isArray(contents)
        && contents.length > 0
        && contents.length <= MAX_CONTENTS
        && contents.every((c) => isObject(c) && (c.role === 'user' || c.role === 'model') && Array.isArray(c.parts) && c.parts.length > 0 && c.parts.every(isObject));
}

const validTools = (tools: unknown): tools is Json[] =>
    Array.isArray(tools) && tools.length <= MAX_TOOLS && tools.every((t) => isObject(t) && typeof t.name === 'string');

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    let body: { prompt?: unknown; system?: unknown; feature?: unknown; contents?: unknown; tools?: unknown };
    try {
        body = await req.json();
    } catch {
        return json({ error: 'Invalid JSON' }, 400);
    }
    const { prompt, system, contents, tools } = body ?? {};
    // Which app feature is asking (e.g. 'hover', 'hints'); optional so older builds keep working
    const feature = typeof body?.feature === 'string' && /^[\w.:-]{1,64}$/.test(body.feature) ? body.feature : 'unknown';

    // Either a single prompt, or a whole conversation
    if (contents === undefined) {
        if (typeof prompt !== 'string' || !prompt.trim()) return json({ error: 'Missing prompt' }, 400);
        if (prompt.length > MAX_PROMPT_CHARS) return json({ error: 'Request too large' }, 413);
    } else {
        if (!validContents(contents)) return json({ error: 'Invalid contents' }, 400);
        if (JSON.stringify(contents).length > MAX_CONTENTS_CHARS) return json({ error: 'Request too large' }, 413);
    }
    if (tools !== undefined) {
        if (!validTools(tools)) return json({ error: 'Invalid tools' }, 400);
        if (JSON.stringify(tools).length > MAX_TOOLS_CHARS) return json({ error: 'Request too large' }, 413);
    }
    if (system !== undefined && typeof system !== 'string') return json({ error: 'Invalid system' }, 400);
    if ((system?.length ?? 0) > MAX_SYSTEM_CHARS) return json({ error: 'Request too large' }, 413);

    const denied = await guard(req, 'text', DAILY_LIMIT);
    if (denied) return denied;

    const key = geminiKey();
    if (!key) return json({ error: 'AI is not configured' }, 500);

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
            ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
            contents: contents ?? [{ role: 'user', parts: [{ text: prompt }] }],
            ...(tools?.length ? { tools: [{ functionDeclarations: tools }] } : {}),
            generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
        }),
    });
    if (!res.ok) {
        console.error(`Gemini ${MODEL} failed for ${feature}: ${res.status} ${await res.text()}`);
        return json({ error: 'AI request failed' }, 502);
    }

    const data = await res.json();
    const content = data.candidates?.[0]?.content;
    const parts: { text?: string; thought?: boolean; functionCall?: unknown }[] = content?.parts ?? [];
    const text = parts.filter((p) => !p.thought).map((p) => p.text ?? '').join('');
    const calls = parts.some((p) => p.functionCall);
    if (!text && !calls) {
        // Blocked by safety filters, or the token budget went entirely to thinking
        console.error(`Gemini ${MODEL} returned no text for ${feature}: finishReason=${data.candidates?.[0]?.finishReason}`);
        return json({ error: 'AI returned no answer' }, 502);
    }
    // `content` is the model's whole turn: a conversation sends it back as-is,
    // which keeps function calls and their thought signatures intact
    return json(contents === undefined ? { text } : { text, content: { role: 'model', parts } });
});
