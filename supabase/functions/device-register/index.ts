// Called by the app after every sign-in and on startup: records the account on
// this device, or refuses it when the device is over its account limits (see
// migrations/*_device_accounts.sql). The app signs out a refused account; with
// REQUIRE_DEVICE set, the AI functions also refuse it.
import { admin, authenticate, corsHeaders, DEVICE_PATTERN, envInt, json } from '../_shared/guard.ts';

// Accounts that may start on one device, and accounts that may sign in on it
const MAX_REGISTERED = envInt('DEVICE_MAX_NEW_ACCOUNTS', 2);
const MAX_ACCOUNTS = envInt('DEVICE_MAX_ACCOUNTS', 4);

const REFUSALS: Record<string, string> = {
    registration_limit: `This computer already has ${MAX_REGISTERED} Vylos accounts. Sign in with one of them to keep learning.`,
    account_limit: `${MAX_ACCOUNTS} accounts have already signed in on this computer, which is the limit. Sign in with one of them.`,
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const auth = await authenticate(req);
    if ('response' in auth) return auth.response;

    const device = req.headers.get('x-vylos-device') ?? '';
    if (!DEVICE_PATTERN.test(device)) return json({ error: 'Missing or malformed device id' }, 400);

    const { data: result, error } = await admin.rpc('register_device', {
        p_user_id: auth.user.id,
        p_device: device,
        p_max_registered: MAX_REGISTERED,
        p_max_accounts: MAX_ACCOUNTS,
    });
    if (error) {
        console.error('register_device failed:', error.message);
        return json({ error: 'Device check failed' }, 500);
    }
    if (result !== 'ok') return json({ error: REFUSALS[result] ?? 'This device cannot use this account', code: result }, 403);
    return json({ ok: true });
});
