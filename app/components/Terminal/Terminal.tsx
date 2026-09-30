'use client';

import '@xterm/xterm/css/xterm.css';
import { useEffect, useRef, useState } from 'react';
import ErrorHelp from './ErrorHelp';
import { AudioLines, ChevronDown, Eraser, Lightbulb, Play, Plus, Puzzle, Square, SquareTerminal, X, type LucideIcon } from 'lucide-react';
import { useTerminalStore, type TermTab } from '@/app/lib/stores/terminal-store';
import { useFileStore } from '@/app/lib/useFileStore';
import { attach, detach, fit, focus } from '@/app/lib/terminal/xterm-host';
import { cn } from '@/app/lib/utils';

function tabIcon(tab: TermTab): LucideIcon {
    if (tab.kind === 'shell') return SquareTerminal;
    if (tab.source === 'tutor') return AudioLines;
    if (tab.source === 'extension') return Puzzle;
    return Play;
}

function IconButton({ icon: Icon, label, onClick, className }: { icon: LucideIcon; label: string; onClick: () => void; className?: string }) {
    return (
        <button
            onClick={onClick}
            title={label}
            aria-label={label}
            className={cn('p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-[#27272a] transition-colors', className)}
        >
            <Icon size={13} />
        </button>
    );
}

export default function Terminal() {
    const { tabs, activeTabId, info, init, newShell, ensureShell, setActiveTab, closeTab, stop, clearTab } = useTerminalStore();
    const projectRoot = useFileStore((s) => s.projectRoot);
    const setShowTerminal = useFileStore((s) => s.setShowTerminal);
    const hostRef = useRef<HTMLDivElement>(null);
    const hadTabs = useRef(tabs.length > 0);
    const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
    const runs = useTerminalStore((s) => s.runs);
    const [helpRunId, setHelpRunId] = useState<number | null>(null);
    // The last run in the active tab, if it failed and has finished
    const failedRun = activeTab?.kind === 'run' && activeTab.status === 'failed' && !activeTab.running
        ? runs.filter((r) => r.tabId === activeTab.id).at(-1) ?? null
        : null;
    const helpRun = helpRunId !== null ? runs.find((r) => r.id === helpRunId) ?? null : null;
    const desktop = typeof window !== 'undefined' && !!window.electron?.term;

    useEffect(() => { init(); }, [init]);

    // The first time the panel opens, start a shell in the project folder
    useEffect(() => {
        if (info) ensureShell(projectRoot);
    }, [info, ensureShell, projectRoot]);

    // Closing the last tab hides the panel, like in VS Code
    useEffect(() => {
        if (tabs.length > 0) hadTabs.current = true;
        else if (hadTabs.current) {
            hadTabs.current = false;
            setShowTerminal(false);
        }
    }, [tabs.length, setShowTerminal]);

    // Show the active tab's terminal
    useEffect(() => {
        const container = hostRef.current;
        if (!activeTabId || !container) return;
        attach(activeTabId, container);
        return () => detach(activeTabId);
    }, [activeTabId]);

    // Opening the panel (Ctrl+`) puts the cursor in the terminal, like in VS Code
    useEffect(() => {
        const id = useTerminalStore.getState().activeTabId;
        if (id) focus(id);
    }, []);

    // Keep the terminal filling the panel as it's resized
    useEffect(() => {
        const container = hostRef.current;
        if (!container) return;
        const observer = new ResizeObserver(() => {
            const id = useTerminalStore.getState().activeTabId;
            if (id) fit(id);
        });
        observer.observe(container);
        return () => observer.disconnect();
    }, []);

    return (
        <div className="h-full w-full bg-[#09090b] flex flex-col">
            <div className="h-8 shrink-0 border-b border-[#27272a] flex items-center gap-2 pl-4 pr-2">
                <span className="text-[10px] uppercase tracking-widest text-[#10b981] font-bold shrink-0">Terminal</span>

                <div role="tablist" className="flex-1 min-w-0 flex items-center gap-0.5 overflow-x-auto scrollbar-hide">
                    {tabs.map((tab) => {
                        const Icon = tabIcon(tab);
                        const active = tab.id === activeTabId;
                        return (
                            <div
                                key={tab.id}
                                role="tab"
                                aria-selected={active}
                                onClick={() => setActiveTab(tab.id)}
                                onAuxClick={(e) => e.button === 1 && closeTab(tab.id)}
                                className={cn(
                                    'group shrink-0 flex items-center gap-1.5 h-6 pl-2 pr-1 rounded text-[11px] cursor-pointer transition-colors',
                                    active ? 'bg-[#1f1f23] text-zinc-100' : 'text-zinc-500 hover:text-zinc-300 hover:bg-[#18181b]'
                                )}
                            >
                                <Icon size={12} className={cn('shrink-0', active && 'text-[var(--vylos-green-accent)]')} />
                                <span className="max-w-[140px] truncate">{tab.title}</span>
                                {tab.kind === 'run' && (tab.running || tab.status === 'failed') && (
                                    <span
                                        className={cn('w-1.5 h-1.5 rounded-full shrink-0', tab.running ? 'bg-[var(--vylos-green)] animate-pulse' : 'bg-red-400')}
                                        title={tab.running ? 'Running' : 'The last run failed'}
                                    />
                                )}
                                <button
                                    onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                                    title={tab.running ? 'Stop and close' : 'Close'}
                                    aria-label={`Close ${tab.title}`}
                                    className={cn('p-0.5 rounded hover:bg-[#3f3f46] transition-opacity', active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}
                                >
                                    <X size={10} />
                                </button>
                            </div>
                        );
                    })}
                </div>

                <div className="shrink-0 flex items-center gap-0.5">
                    {failedRun && failedRun.id !== helpRunId && (
                        <button
                            onClick={() => setHelpRunId(failedRun.id)}
                            title="Explain this error in plain words, with hints"
                            className="flex items-center gap-1 px-1.5 h-6 mr-1 rounded text-[10px] font-semibold text-amber-300 hover:bg-amber-500/10 transition-colors"
                        >
                            <Lightbulb size={11} /> Explain
                        </button>
                    )}
                    {activeTab?.kind === 'run' && activeTab.running && (
                        <button
                            onClick={() => stop(activeTab.id)}
                            title="Stop the program (Ctrl+C in the terminal also works)"
                            className="flex items-center gap-1 px-1.5 h-6 mr-1 rounded text-[10px] font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                            <Square size={9} fill="currentColor" /> Stop
                        </button>
                    )}
                    {info?.interactive && <IconButton icon={Plus} label="New terminal (Ctrl+Shift+`)" onClick={() => void newShell(projectRoot)} />}
                    {activeTab && <IconButton icon={Eraser} label="Clear" onClick={() => clearTab(activeTab.id)} />}
                    <IconButton icon={ChevronDown} label="Hide panel (Ctrl+`)" onClick={() => setShowTerminal(false)} />
                </div>
            </div>

            <div className="relative flex-1 min-h-0">
                <div ref={hostRef} className="absolute inset-0 pl-3 pr-1 pt-1.5" />
                {helpRun && <ErrorHelp key={helpRun.id} run={helpRun} onClose={() => setHelpRunId(null)} />}
                {tabs.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-xs text-zinc-500">
                        {!desktop
                            ? 'The terminal is available in the Vylos desktop app.'
                            : info && !info.interactive
                                ? <p className="max-w-md leading-relaxed">
                                    The interactive terminal couldn&apos;t start{info.error ? ` (${info.error})` : ''}.
                                    Files you run with the Run button, and code the voice tutor runs, still show their output here.
                                </p>
                                : 'Starting terminal…'}
                    </div>
                )}
            </div>
        </div>
    );
}
