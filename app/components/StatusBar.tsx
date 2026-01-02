'use client';

import { Sparkles } from 'lucide-react';

export default function StatusBar() {
    return (
        <div className="h-6 bg-[var(--vylos-green-dark)] flex items-center justify-between px-3 text-xs text-white select-none">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                    <Sparkles size={12} />
                    <span>Vylos AI Ready</span>
                </div>
                <span>master*</span>
                <span>0 errors</span>
            </div>
            <div className="flex items-center gap-4">
                <span>Ln 12, Col 34</span>
                <span>UTF-8</span>
                <span>TypeScript React</span>
            </div>
        </div>
    );
}
