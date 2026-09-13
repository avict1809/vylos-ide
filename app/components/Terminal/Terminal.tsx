'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, Square, Trash2, Clock } from 'lucide-react';
import { useTerminalStore } from '@/app/lib/stores/terminal-store';
import { useFileStore } from '@/app/lib/useFileStore';
import { cn } from '@/app/lib/utils';

export default function Terminal() {
    const { runs, init, runCommand, kill, clear } = useTerminalStore();
    const { projectRoot, terminalCwd } = useFileStore();
    // "Open in Integrated Terminal" picks a folder; otherwise the project root
    const cwd = terminalCwd ?? projectRoot;
    const [input, setInput] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => { init(); }, [init]);

    // Follow output as it streams
    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [runs]);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const command = input.trim();
        if (!command) return;
        setInput('');
        runCommand(command, cwd ?? undefined);
    };

    return (
        <div className="h-full w-full bg-[#09090b] flex flex-col font-mono text-xs">
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
                {runs.length === 0 && (
                    <p className="text-zinc-600">
                        Run a command below, or let the voice tutor run code here for you.
                    </p>
                )}

                {runs.map((run) => (
                    <div key={run.id} className="group">
                        <div className="flex items-center gap-2 text-zinc-400">
                            <ChevronRight size={12} className="text-[var(--vylos-green)] shrink-0" />
                            <span className="text-zinc-200 break-all">{run.command}</span>
                            {run.running ? (
                                <button
                                    onClick={() => kill(run.id)}
                                    className="ml-auto shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-red-400 hover:bg-red-500/10 transition-colors"
                                    title="Stop"
                                >
                                    <Square size={9} fill="currentColor" /> Stop
                                </button>
                            ) : (
                                <span className={cn(
                                    'ml-auto shrink-0 text-[10px] flex items-center gap-1',
                                    run.timedOut ? 'text-yellow-500' : run.exitCode === 0 ? 'text-[var(--vylos-green)]' : 'text-red-400'
                                )}>
                                    {run.timedOut && <Clock size={9} />}
                                    {run.timedOut ? 'timed out' : `exit ${run.exitCode}`}
                                </span>
                            )}
                        </div>
                        {run.output && (
                            <pre className="mt-1 ml-5 text-zinc-400 whitespace-pre-wrap break-all leading-relaxed max-h-64 overflow-y-auto">
                                {run.output}
                            </pre>
                        )}
                        {run.running && !run.output && (
                            <p className="mt-1 ml-5 text-zinc-600 animate-pulse">running…</p>
                        )}
                    </div>
                ))}
            </div>

            <form onSubmit={submit} className="border-t border-[#1f1f1f] flex items-center gap-2 px-3 py-2">
                <ChevronRight size={13} className="text-[var(--vylos-green)] shrink-0" />
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={cwd ? `Run a command in ${cwd.split(/[\\/]/).pop()}…` : 'Run a command…'}
                    className="flex-1 bg-transparent outline-none text-zinc-200 placeholder:text-zinc-700"
                    spellCheck={false}
                />
                {runs.length > 0 && (
                    <button
                        type="button"
                        onClick={clear}
                        className="shrink-0 p-1 text-zinc-600 hover:text-zinc-300 transition-colors"
                        title="Clear finished runs"
                    >
                        <Trash2 size={12} />
                    </button>
                )}
            </form>
        </div>
    );
}
