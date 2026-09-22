'use client';

import { ReactNode, useEffect } from 'react';
import { useAuthStore } from './lib/stores/auth-store';
import { startProgressSync } from './lib/learning/progress-sync';
import { startPractice } from './lib/learning/practice';
import RewardToasts from './components/learning/RewardToasts';

export function Providers({ children }: { children: ReactNode }) {
    const initialize = useAuthStore((s) => s.initialize);

    useEffect(() => {
        initialize();
    }, [initialize]);

    useEffect(() => {
        startPractice();
        startProgressSync();
    }, []);

    return (
        <>
            {children}
            <RewardToasts />
        </>
    );
}
