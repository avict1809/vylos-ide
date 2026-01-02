import { Files, Search, Settings, Sparkles, GitGraph, UserCircle, BookOpen } from "lucide-react";
import { useFileStore } from "../lib/useFileStore";
import { cn } from "@/app/lib/utils";
import { useState, useEffect } from 'react';

export function ActivityBar() {
    const { activeView, setActiveView } = useFileStore();
    const [gitChanges, setGitChanges] = useState(0);

    // Mock Git change detection
    useEffect(() => {
        const interval = setInterval(() => {
            const electron = (window as any).electron;
            if (electron && electron.git) {
                electron.git.status().then((status: any) => {
                    const count = (status.staged?.length || 0) + (status.unstaged?.length || 0);
                    setGitChanges(count);
                }).catch(() => { });
            }
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    const ActivityIcon = ({ id, icon: Icon, label, badge }: { id: string; icon: any; label: string; badge?: number }) => (
        <button
            onClick={() => setActiveView(id as any)}
            className={cn(
                "p-3 w-12 h-12 flex items-center justify-center transition-colors relative",
                activeView === id
                    ? "text-[var(--vylos-green)] border-l-2 border-[var(--vylos-green)] bg-[var(--vylos-grey-dark)]"
                    : "text-[var(--vylos-text-secondary)] hover:text-[var(--vylos-text-primary)]"
            )}
            title={label}
        >
            <Icon size={24} />
            {badge !== undefined && badge > 0 && (
                <div className="absolute top-2 right-2 min-w-[14px] h-[14px] bg-[var(--vylos-green-dark)] text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 border border-black shadow-lg">
                    {badge > 9 ? '9+' : badge}
                </div>
            )}
        </button>
    );

    return (
        <div className="w-12 h-full bg-[var(--vylos-black)] border-r border-[var(--vylos-grey-border)] flex flex-col justify-between z-50">
            <div className="flex flex-col">
                <ActivityIcon id="explorer" icon={Files} label="Explorer" />
                <ActivityIcon id="search" icon={Search} label="Search" />
                <ActivityIcon id="learning" icon={BookOpen} label="Learning Path" />
                <ActivityIcon id="ai" icon={Sparkles} label="Vylos AI" />
                <ActivityIcon id="git" icon={GitGraph} label="Source Control" badge={gitChanges} />
            </div>
            <div className="flex flex-col">
                <ActivityIcon id="account" icon={UserCircle} label="Account" />
                <ActivityIcon id="settings" icon={Settings} label="Settings" />
            </div>
        </div>
    );
}
