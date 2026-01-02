'use client';

import { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
    // Add contexts here if needed (e.g. Theme, Auth)
    return (
        <>
            {children}
        </>
    );
}
