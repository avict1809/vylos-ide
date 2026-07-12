'use client';

import { ReactNode, useEffect } from 'react';
import { useAuthStore } from './lib/stores/auth-store';

export function Providers({ children }: { children: ReactNode }) {
    const initialize = useAuthStore((s) => s.initialize);

    useEffect(() => {
        initialize();
    }, [initialize]);

    return (
        <>
            {children}
        </>
    );
}
