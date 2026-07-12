'use client';

import { createClient, SupabaseClient } from '@supabase/supabase-js';

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

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
    if (!isSupabaseConfigured) return null;
    if (!client) {
        client = createClient(supabaseUrl!, supabaseAnonKey!, {
            auth: {
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
