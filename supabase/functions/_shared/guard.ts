import { createClient, type User } from 'npm:@supabase/supabase-js@2';

export const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-vylos-device',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

/** Reads a positive integer setting (`supabase secrets set NAME=...`), or the fallback. */
export function envInt(name: string, fallback: number): number {
    const value = Number(Deno.env.get(name));
    return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function geminiKey(): string | null {
    const key = Deno.env.get('GEMINI_API_KEY');
    if (!key) console.error('GEMINI_API_KEY is not set: run `supabase secrets set GEMINI_API_KEY=...`');
    return key ?? null;
}

export const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
);

/** SHA-256 hex of the machine id, sent by the app as x-vylos-device (see electron/device.ts). */
export const DEVICE_PATTERN = /^[0-9a-f]{64}$/;

/**
 * The signed-in (non-anonymous) user behind the request, or the error
 * response to send back.
 *
 * The session is checked here rather than at the gateway (verify_jwt = false
 * in config.toml) so this works with both legacy and asymmetric JWT keys.
 */
export async function authenticate(req: Request): Promise<{ user: User } | { response: Response }> {
    const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!jwt) return { response: json({ error: 'Not signed in' }, 401) };

    const { data, error } = await admin.auth.getUser(jwt);
    if (error || !data.user || data.user.is_anonymous) return { response: json({ error: 'Not signed in' }, 401) };
    return { user: data.user };
}

// Off until every installed app sends x-vylos-device; turn on
// with `supabase secrets set REQUIRE_DEVICE=true`. See docs/DEVICE-LIMITS.md.
const REQUIRE_DEVICE = Deno.env.get('REQUIRE_DEVICE') === 'true';

/**
 * Admits a request only from a signed-in (non-anonymous) user who is still
 * under today's `dailyLimit` for `kind`, and counts it against that limit.
 * With REQUIRE_DEVICE, the request must also come from a device the account
 * is registered on (device-register), so accounts beyond a device's limit get
 * no free AI. Returns the error response to send back, or null to go ahead.
 */
export async function guard(req: Request, kind: 'text' | 'voice', dailyLimit: number): Promise<Response | null> {
    const auth = await authenticate(req);
    if ('response' in auth) return auth.response;
    const { user } = auth;

    if (REQUIRE_DEVICE) {
        const device = req.headers.get('x-vylos-device') ?? '';
        const { data: known, error: deviceError } = DEVICE_PATTERN.test(device)
            ? await admin.from('device_accounts').select('user_id').eq('device_hash', device).eq('user_id', user.id).maybeSingle()
            : { data: null, error: null };
        if (deviceError) {
            console.error('device check failed:', deviceError.message);
            return json({ error: 'Usage check failed' }, 500);
        }
        if (!known) return json({ error: 'This device is not registered for this account', code: 'device_unregistered' }, 403);
    }

    const { data: allowed, error: quotaError } = await admin.rpc('consume_ai_quota', {
        p_user_id: user.id,
        p_kind: kind,
        p_limit: dailyLimit,
    });
    if (quotaError) {
        console.error('consume_ai_quota failed:', quotaError.message);
        return json({ error: 'Usage check failed' }, 500);
    }
    if (!allowed) return json({ error: 'Daily AI limit reached' }, 429);
    return null;
}
