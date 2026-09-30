'use client';

import { ReactNode, useEffect } from 'react';
import { useAuthStore } from './lib/stores/auth-store';
import { startProgressSync } from './lib/learning/progress-sync';
import { startPractice } from './lib/learning/practice';
import { startConversationSync } from './lib/memory/conversation-sync';
import RewardToasts from './components/learning/RewardToasts';

export function Providers({ children }: { children: ReactNode }) {
    const initialize = useAuthStore((s) => s.initialize);

    useEffect(() => {
        initialize();
    }, [initialize]);

    useEffect(() => {
        startPractice();
        startProgressSync();
        // The tutor's conversations: kept here, backed up to the database in batches
        startConversationSync();
    }, []);

    return (
        <>
            {children}
            <RewardToasts />
        </>
    );
}
