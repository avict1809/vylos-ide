// Single-shot text generation for the app's text features (chat, hover
// explanations, step guides, roadmaps). Holds the Gemini key so the app never
// ships it; see app/lib/ai/gemini-client.ts for the caller.
import { corsHeaders, envInt, geminiKey, guard, json } from '../_shared/guard.ts';

// Server-side so it can change with a redeploy instead of an app release.
// gemini-2.5-flash is closed to new API keys (404 "no longer available to new users").
const MODEL = Deno.env.get('AI_TEXT_MODEL') || 'gemini-3.6-flash';
const DAILY_LIMIT = envInt('AI_DAILY_TEXT_LIMIT', 200);
// Includes thinking tokens, which run to ~2x the visible answer.
const MAX_OUTPUT_TOKENS = envInt('AI_MAX_OUTPUT_TOKENS', 8192);
const MAX_PROMPT_CHARS = 100_000;
const MAX_SYSTEM_CHARS = 10_000;

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    let body: { prompt?: unknown; system?: unknown };
    try {
        body = await req.json();
    } catch {
        return json({ error: 'Invalid JSON' }, 400);
    }
    const { prompt, system } = body ?? {};
    if (typeof prompt !== 'string' || !prompt.trim()) return json({ error: 'Missing prompt' }, 400);
    if (system !== undefined && typeof system !== 'string') return json({ error: 'Invalid system' }, 400);
    if (prompt.length > MAX_PROMPT_CHARS || (system?.length ?? 0) > MAX_SYSTEM_CHARS) {
        return json({ error: 'Request too large' }, 413);
    }

    const denied = await guard(req, 'text', DAILY_LIMIT);
    if (denied) return denied;

    const key = geminiKey();
    if (!key) return json({ error: 'AI is not configured' }, 500);

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
            ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
        }),
    });
    if (!res.ok) {
        console.error(`Gemini ${MODEL} failed: ${res.status} ${await res.text()}`);
        return json({ error: 'AI request failed' }, 502);
    }

    const data = await res.json();
    const parts: { text?: string; thought?: boolean }[] = data.candidates?.[0]?.content?.parts ?? [];
    const text = parts.filter((p) => !p.thought).map((p) => p.text ?? '').join('');
    if (!text) {
        // Blocked by safety filters, or the token budget went entirely to thinking
        console.error(`Gemini ${MODEL} returned no text: finishReason=${data.candidates?.[0]?.finishReason}`);
        return json({ error: 'AI returned no answer' }, 502);
    }
    return json({ text });
});
