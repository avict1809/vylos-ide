import { Files, Search, Settings, Sparkles, GitGraph, Terminal, BookOpen } from "lucide-react";
import { useFileStore } from "../lib/useFileStore";
import { cn } from "@/app/lib/utils";

export function ActivityBar() {
    const { activeView, setActiveView } = useFileStore();

    const ActivityIcon = ({ id, icon: Icon, label }: { id: string; icon: any; label: string }) => (
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
        </button>
    );

    return (
        <div className="w-12 h-full bg-[var(--vylos-black)] border-r border-[var(--vylos-grey-border)] flex flex-col justify-between z-50">
            <div className="flex flex-col">
                <ActivityIcon id="explorer" icon={Files} label="Explorer" />
                <ActivityIcon id="search" icon={Search} label="Search" />
                <ActivityIcon id="learning" icon={BookOpen} label="Learning Path" />
                <ActivityIcon id="ai" icon={Sparkles} label="Vylos AI" />
                <ActivityIcon id="git" icon={GitGraph} label="Source Control" />
            </div>
            <div className="flex flex-col">
                <ActivityIcon id="terminal" icon={Terminal} label="Terminal" />
                <ActivityIcon id="settings" icon={Settings} label="Settings" />
            </div>
        </div>
    );
}
