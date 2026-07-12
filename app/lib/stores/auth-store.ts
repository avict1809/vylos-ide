'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Session } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured, supabaseConfig } from '../supabase';

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

export const useAuthStore = create<AuthStore>()(
    persist(
        (set) => ({
            isAuthenticated: false,
            hasCompletedOnboarding: false,
            user: null,
            isWaitingForBrowser: false,
            error: null,

            initialize: async () => {
                const supabase = getSupabase();
                if (!supabase) return;

                const { data: { session } } = await supabase.auth.getSession();
                set({ isAuthenticated: !!session, user: toUser(session) });

                supabase.auth.onAuthStateChange((_event, session) => {
                    set({ isAuthenticated: !!session, user: toUser(session) });
                });
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
                    const result = await window.electron.auth.signInViaBrowser({ ...supabaseConfig, mode });

                    // A newer attempt or a cancel superseded this one
                    if (attempt !== browserSignInAttempt) return;
                    if (result.error === 'cancelled') return;
                    if (result.error || !result.access_token || !result.refresh_token) {
                        throw new Error(result.error || 'Sign-in was not completed.');
                    }

                    const { error } = await supabase.auth.setSession({
                        access_token: result.access_token,
                        refresh_token: result.refresh_token,
                    });
                    if (error) throw new Error(error.message);
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
                set({ isAuthenticated: false, user: null, hasCompletedOnboarding: false });
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
