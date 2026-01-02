'use client';

import { Files, Search, GitGraph, Terminal, Settings, Sparkles } from 'lucide-react';
import { cn } from '@/app/lib/utils';
import { useState } from 'react';

type Activity = 'files' | 'search' | 'git' | 'ai' | 'terminal' | 'settings';

export default function ActivityBar() {
    const [active, setActive] = useState<Activity>('files');

    const ActivityIcon = ({ id, icon: Icon, label }: { id: Activity; icon: any; label: string }) => (
        <button
            onClick={() => setActive(id)}
            className={cn(
                "p-3 w-12 h-12 flex items-center justify-center transition-colors relative",
                active === id
                    ? "text-[var(--vylos-green)] border-l-2 border-[var(--vylos-green)] bg-[var(--vylos-grey-dark)]"
                    : "text-[var(--vylos-text-secondary)] hover:text-[var(--vylos-text-primary)]"
            )}
            title={label}
        >
            <Icon size={24} />
        </button>
    );

    return (
        <div className="w-12 h-full bg-[var(--vylos-black)] border-r border-[var(--vylos-grey-border)] flex flex-col justify-between z-50">
            <div className="flex flex-col">
                <ActivityIcon id="files" icon={Files} label="Explorer" />
                <ActivityIcon id="search" icon={Search} label="Search" />
                <ActivityIcon id="git" icon={GitGraph} label="Source Control" />
                <ActivityIcon id="ai" icon={Sparkles} label="Vylos AI" />
            </div>
            <div className="flex flex-col">
                <ActivityIcon id="terminal" icon={Terminal} label="Terminal" />
                <ActivityIcon id="settings" icon={Settings} label="Settings" />
            </div>
        </div>
    );
}
