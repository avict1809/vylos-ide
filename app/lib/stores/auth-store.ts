'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Session } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured, readStoredSession, supabaseConfig } from '../supabase';
import { registerDevice } from '../device';

export type AuthMode = 'signin' | 'signup';

interface User {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    subscription: 'free' | 'pro' | 'enterprise';
}

interface AuthStore {
    isAuthenticated: boolean;
    hasCompletedOnboarding: boolean;
    user: User | null;
    // Signed in on a stored session that Supabase couldn't be reached to
    // confirm, i.e. working offline
    isOfflineSession: boolean;
    // Set while the system browser is open and we're waiting for the web
    // auth page to hand the session back
    isWaitingForBrowser: boolean;
    error: string | null;

    initialize: () => Promise<void>;
    signInViaBrowser: (mode: AuthMode) => Promise<void>;
    cancelBrowserSignIn: () => void;
    logout: () => Promise<void>;
    setHasCompletedOnboarding: (value: boolean) => void;
    clearError: () => void;
}

function toUser(session: Session | null): User | null {
    const u = session?.user;
    if (!u) return null;
    const meta = u.user_metadata ?? {};
    return {
        id: u.id,
        email: u.email ?? '',
        name: meta.full_name || meta.name || u.email?.split('@')[0] || 'User',
        avatarUrl: meta.avatar_url || null,
        subscription: 'free',
    };
}

// Distinguishes a stale browser sign-in attempt from the active one
let browserSignInAttempt = 0;

// initialize() subscribes to Supabase and to 'online'; those subscriptions
// belong to the client, not to whatever mounted first
let initialized = false;

/** Ends a session the app decided not to use, so its tokens stop working. */
function revokeSession(accessToken: string) {
    void fetch(`${supabaseConfig.supabaseUrl}/auth/v1/logout?scope=local`, {
        method: 'POST',
        headers: { apikey: supabaseConfig.supabaseAnonKey, Authorization: `Bearer ${accessToken}` },
    }).catch(() => { });
}

interface BrowserTokens {
    access_token: string;
    refresh_token: string;
}

/**
 * Takes the session the browser handed back. Shared by the sign-in the app is
 * waiting on and by one that finished after it gave up waiting; `isCurrent`
 * lets the waiting path bail out if a newer attempt has superseded it.
 */
async function applyBrowserSession(tokens: BrowserTokens, isCurrent: () => boolean = () => true) {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase is not configured.');

    // Checked before the session is kept, so a refused account never opens the app
    const check = await registerDevice(tokens.access_token);
    if (!isCurrent()) return;
    if (check.ok === false) {
        revokeSession(tokens.access_token);
        throw new Error(check.message);
    }

    const { error } = await supabase.auth.setSession({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
    });
    if (error) throw new Error(error.message);
}

export const useAuthStore = create<AuthStore>()(
    persist(
        (set) => ({
            isAuthenticated: false,
            hasCompletedOnboarding: false,
            user: null,
            isOfflineSession: false,
            isWaitingForBrowser: false,
            error: null,

            initialize: async () => {
                const supabase = getSupabase();
                if (!supabase || initialized) return;
                initialized = true;

                // Open on the stored session right away. Refreshing an expired
                // access token with no network takes Supabase ~30s to give up
                // on, and the learner shouldn't stare at the sign-in screen
                // while it does.
                const stored = readStoredSession();
                if (stored) set({ isAuthenticated: true, user: toUser(stored) });

                // A sign-in that finished after the app stopped waiting for it.
                // The main process only sends this for a state it is still
                // holding, so it answers a sign-in this app really did start.
                // Deliberately does not supersede an attempt in flight: that
                // would leave its own resolution unable to clear the spinner.
                window.electron?.auth?.onCompleted?.((tokens) => {
                    set({ error: null, isWaitingForBrowser: false });
                    void applyBrowserSession(tokens).catch((e) => {
                        set({ error: e instanceof Error ? e.message : 'Sign-in failed.' });
                    });
                });

                supabase.auth.onAuthStateChange((event, session) => {
                    if (session) {
                        set({ isAuthenticated: true, user: toUser(session), isOfflineSession: false });
                        return;
                    }
                    // No session: signed out for real, or a refresh that never
                    // reached Supabase — which leaves the session in storage.
                    const offline = event === 'SIGNED_OUT' ? null : readStoredSession();
                    set({ isAuthenticated: !!offline, user: toUser(offline), isOfflineSession: !!offline });
                });

                // Answers null when the access token has expired and it can't
                // be refreshed; the stored session is still good in that case,
                // so keep it rather than asking for a new sign-in.
                const { data: { session } } = await supabase.auth.getSession();
                const active = session ?? readStoredSession();
                set({
                    isAuthenticated: !!active,
                    user: toUser(active),
                    isOfflineSession: !session && !!active,
                });

                // Back online: have Supabase confirm the stored session, so an
                // account that lost access elsewhere stops working here too.
                window.addEventListener('online', () => {
                    const refreshToken = readStoredSession()?.refresh_token;
                    if (refreshToken) void supabase.auth.refreshSession({ refresh_token: refreshToken });
                });

                // A session from before device limits, or from another computer's
                // copy of this profile: check it against this device's limits
                if (session) {
                    const check = await registerDevice();
                    if (check.ok === false) {
                        await supabase.auth.signOut();
                        set({ isAuthenticated: false, user: null, error: check.message });
                    }
                }
            },

            signInViaBrowser: async (mode) => {
                const supabase = getSupabase();
                if (!supabase) {
                    set({ error: 'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.' });
                    return;
                }
                if (!window.electron?.auth) {
                    set({ error: 'Sign-in runs through the desktop app. Launch Vylos via "npm run electron:dev".' });
                    return;
                }

                const attempt = ++browserSignInAttempt;
                set({ error: null, isWaitingForBrowser: true });
                try {
                    const result = await window.electron.auth.signInViaBrowser({ mode });

                    // A newer attempt or a cancel superseded this one
                    if (attempt !== browserSignInAttempt) return;
                    if (result.error === 'cancelled') return;
                    // The app stopped waiting, but the tab is still live and
                    // the hand-off is still accepted, so say so rather than
                    // sending them back to the start.
                    if (result.error === 'timeout') {
                        set({ error: 'Vylos stopped waiting for the browser. Finish signing in there and it will pick up from where you left off.' });
                        return;
                    }
                    if (result.error || !result.access_token || !result.refresh_token) {
                        throw new Error(result.error || 'Sign-in was not completed.');
                    }

                    await applyBrowserSession(
                        { access_token: result.access_token, refresh_token: result.refresh_token },
                        () => attempt === browserSignInAttempt,
                    );
                } catch (e) {
                    if (attempt === browserSignInAttempt) {
                        set({ error: e instanceof Error ? e.message : 'Sign-in failed.' });
                    }
                } finally {
                    if (attempt === browserSignInAttempt) {
                        set({ isWaitingForBrowser: false });
                    }
                }
            },

            cancelBrowserSignIn: () => {
                browserSignInAttempt++;
                window.electron?.auth?.cancel();
                set({ isWaitingForBrowser: false });
            },

            logout: async () => {
                const supabase = getSupabase();
                await supabase?.auth.signOut();
                set({ isAuthenticated: false, user: null, isOfflineSession: false, hasCompletedOnboarding: false });
            },

            setHasCompletedOnboarding: (hasCompletedOnboarding) => set({ hasCompletedOnboarding }),
            clearError: () => set({ error: null }),
        }),
        {
            name: 'vylos-auth',
            // Session/user live in Supabase's own storage; only persist the flag
            partialize: (state) => ({ hasCompletedOnboarding: state.hasCompletedOnboarding }),
        }
    )
);

export { isSupabaseConfigured };
