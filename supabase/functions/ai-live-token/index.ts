// Hands the voice tutor a short-lived, single-use Gemini Live token instead of
// the API key; see startVoiceSession in app/lib/ai/gemini-live.ts.
import { corsHeaders, envInt, geminiKey, guard, json } from '../_shared/guard.ts';

// NOTE: the -12-2025 preview build is broken for this app's configuration:
// it accepts the session, then kills it mid-response with 1007
// "The audio content type (CONTENT_TYPE_AUDIO) is not supported for this
// model configuration" once real mic audio streams during a model turn.
// The -09-2025 build handles the identical session correctly (verified 2026-07-12).
const MODEL = 'models/gemini-2.5-flash-native-audio-preview-09-2025';
// Each token opens one voice session
const DAILY_LIMIT = envInt('AI_DAILY_VOICE_LIMIT', 20);

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const denied = await guard(req, 'voice', DAILY_LIMIT);
    if (denied) return denied;

    const key = geminiKey();
    if (!key) return json({ error: 'AI is not configured' }, 500);

    const now = Date.now();
    const res = await fetch('https://generativelanguage.googleapis.com/v1alpha/auth_tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
            uses: 1,
            // The session has to start within a minute and can then run 30 minutes
            newSessionExpireTime: new Date(now + 60_000).toISOString(),
            expireTime: new Date(now + 30 * 60_000).toISOString(),
            // Locks only the model (whatever model the client asks for is replaced
            // by this one); the app still sends its own voice, tools and instructions.
            bidiGenerateContentSetup: { model: MODEL },
            fieldMask: 'model',
        }),
    });
    if (!res.ok) {
        console.error(`auth_tokens failed: ${res.status} ${await res.text()}`);
        return json({ error: 'Could not start a voice session' }, 502);
    }

    const { name } = await res.json();
    return json({ token: name, model: MODEL });
});
