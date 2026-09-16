'use client';

import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Passed to the Electron main process, which serves the web auth page on
// localhost:51735 (the page needs the anon key — it is public by design).
// Whitelist http://localhost:51735/ in Supabase: Auth > URL Configuration >
// Redirect URLs (used as the OAuth return address for the auth page).
export const supabaseConfig = {
    supabaseUrl: supabaseUrl ?? '',
    supabaseAnonKey: supabaseAnonKey ?? '',
};

/**
 * Where the signed-in session is kept between launches. Supabase would pick a
 * key of its own; naming it here lets the app read the session back itself,
 * which is what keeps a learner signed in while offline (readStoredSession).
 */
const SESSION_KEY = 'vylos-session';

/** Adopts a session stored under Supabase's own key, from before SESSION_KEY. */
function adoptLegacySession() {
    try {
        if (localStorage.getItem(SESSION_KEY)) return;
        const ref = new URL(supabaseUrl!).hostname.split('.')[0];
        const legacy = localStorage.getItem(`sb-${ref}-auth-token`);
        if (legacy) localStorage.setItem(SESSION_KEY, legacy);
    } catch {
        // No storage yet, or a URL that doesn't parse: nothing to adopt.
    }
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
    if (!isSupabaseConfigured) return null;
    if (!client) {
        adoptLegacySession();
        client = createClient(supabaseUrl!, supabaseAnonKey!, {
            auth: {
                storageKey: SESSION_KEY,
                flowType: 'pkce',
                persistSession: true,
                autoRefreshToken: true,
                // Sign-in happens on the web auth page, never via redirects
                // into this window; sessions arrive through setSession().
                detectSessionInUrl: false,
            },
        });
    }
    return client;
}

/**
 * The session as it stands in storage, even when its access token has expired.
 *
 * Supabase deletes it only when the server rejects the refresh token; a refresh
 * that never reached the server leaves it untouched. So a stored session means
 * "these credentials are still good, we just may be offline" — getSession()
 * answers null in that case, because it cannot mint a fresh access token.
 */
export function readStoredSession(): Session | null {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        const session = raw ? (JSON.parse(raw) as Session) : null;
        return session?.access_token && session?.refresh_token ? session : null;
    } catch {
        return null;
    }
}
