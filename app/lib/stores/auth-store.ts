'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
    id: string;
    email: string;
    name: string;
    subscription: 'free' | 'pro' | 'enterprise';
}

interface AuthStore {
    isAuthenticated: boolean;
    hasCompletedOnboarding: boolean;
    user: User | null;

    login: (email: string) => void;
    logout: () => void;
    setHasCompletedOnboarding: (value: boolean) => void;
}

export const useAuthStore = create<AuthStore>()(
    persist(
        (set) => ({
            isAuthenticated: false,
            hasCompletedOnboarding: false,
            user: null,

            login: (email) => set({
                isAuthenticated: true,
                user: {
                    id: '1',
                    email,
                    name: email.split('@')[0],
                    subscription: 'enterprise'
                }
            }),
            logout: () => set({ isAuthenticated: false, user: null, hasCompletedOnboarding: false }),
            setHasCompletedOnboarding: (hasCompletedOnboarding) => set({ hasCompletedOnboarding }),
        }),
        {
            name: 'vylos-auth',
        }
    )
);
