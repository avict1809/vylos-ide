import { createClient, type User } from 'npm:@supabase/supabase-js@2';

export const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-vylos-device',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    // Lets the app read why a request was refused for billing (see guard)
    'Access-Control-Expose-Headers': 'x-vylos-billing',
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

// Off until paid plans are on sale and the app that explains them is out; turn
// on with `supabase secrets set BILLING_ENFORCED=true`. Until then everyone
// gets today's daily limits and nothing spends credits. With it on, Vylos AI
// needs a plan: Seed gets none (local models still work, they never come
// here), Root's credits cover voice only, Sprout and Canopy cover both.
const BILLING_ENFORCED = Deno.env.get('BILLING_ENFORCED') === 'true';

// What one request costs, in millicredits (1 credit = 1000). A text request is
// one model call; a text-tutor reply that uses tools makes several. A voice
// request is one voice tutor session.
const CREDIT_COST = {
    text: envInt('CREDIT_COST_TEXT_MILLI', 10),
    voice: envInt('CREDIT_COST_VOICE_MILLI', 250),
};

const BILLING_REFUSALS: Record<string, string> = {
    no_plan: 'Vylos AI needs a plan. Use your own local model for free, or add the Vylos AI tutor at vylos.co/pricing.',
    not_included: 'Your Root plan covers the voice tutor. Use your local model for this, or move to Sprout for all of Vylos AI.',
    out_of_credits: "You've used this month's Vylos AI credits. They renew with your plan, or move up a plan at vylos.co/pricing.",
};

function billingRefusal(reason: string): Response {
    return new Response(JSON.stringify({ error: BILLING_REFUSALS[reason] ?? 'Vylos AI needs a plan.', code: reason }), {
        status: 402,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'x-vylos-billing': reason },
    });
}

/**
 * Admits a request only from a signed-in (non-anonymous) user who is still
 * under today's `dailyLimit` for `kind`, and counts it against that limit.
 * With BILLING_ENFORCED, it must also be covered by the account's plan and
 * spends its credits; refusals are 402 with the reason in x-vylos-billing.
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

    // After the daily cap, so a request that cap refuses never spends credits
    if (BILLING_ENFORCED) {
        const { data: outcome, error: creditError } = await admin.rpc('consume_ai_credits', {
            p_user_id: user.id,
            p_kind: kind,
            p_cost_milli: CREDIT_COST[kind],
        });
        if (creditError) {
            console.error('consume_ai_credits failed:', creditError.message);
            return json({ error: 'Usage check failed' }, 500);
        }
        if (outcome !== 'ok') return billingRefusal(String(outcome));
    }
    return null;
}
