'use client';

import { useEffect, useState } from 'react';
import { Check, CheckCircle2, ChevronDown, Copy, ExternalLink, Loader2, RefreshCw, TriangleAlert, Wrench } from 'lucide-react';
import type { Course } from '@/app/lib/learning/types';
import { checkCourseSetup, checkTool, courseTools, useSetupStore } from '@/app/lib/setup/setup-check';
import { installSteps, OS_LABELS, TOOLS, type ToolDef } from '@/app/lib/setup/tools';
import { cn } from '@/app/lib/utils';

function CommandLine({ command }: { command: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <div className="mt-1 flex items-center gap-1 rounded bg-black border border-[#27272a] pl-2 pr-1 py-1">
            <code className="flex-1 min-w-0 font-mono text-[10px] text-gray-200 break-all">{command}</code>
            <button
                onClick={async () => {
                    try {
                        await navigator.clipboard.writeText(command);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                    } catch { /* clipboard unavailable */ }
                }}
                title="Copy the command"
                className="shrink-0 p-1 text-gray-500 hover:text-gray-200"
            >
                {copied ? <Check size={11} /> : <Copy size={11} />}
            </button>
        </div>
    );
}

function InstallHelp({ tool }: { tool: ToolDef }) {
    const os = useSetupStore((s) => s.os);
    const steps = os ? installSteps(tool, os) : null;
    return (
        <div className="mt-2 ml-5 space-y-2 text-[10.5px] leading-relaxed text-gray-400">
            {os && <p className="text-[9px] uppercase tracking-widest text-gray-600 font-bold">On {OS_LABELS[os]}</p>}
            {steps ? (
                <ol className="space-y-2 list-decimal pl-4 marker:text-gray-600">
                    {steps.map((step, i) => (
                        <li key={i}>
                            {step.text}
                            {step.command && <CommandLine command={step.command} />}
                        </li>
                    ))}
                </ol>
            ) : (
                <p>Follow the official instructions for your system.</p>
            )}
            <button
                onClick={() => window.open(tool.url)}
                className="flex items-center gap-1 text-[var(--vylos-green-accent)] hover:text-[var(--vylos-green)]"
            >
                <ExternalLink size={10} /> Official install page
            </button>
        </div>
    );
}

/** Whether this computer has the tools the course needs, and how to get the missing ones. */
export default function SetupCard({ course }: { course: Course }) {
    const ids = courseTools(course);
    const status = useSetupStore((s) => s.status);
    const [open, setOpen] = useState<boolean | null>(null);
    const [help, setHelp] = useState<string | null>(null);
    const desktop = typeof window !== 'undefined' && !!window.electron?.term;

    useEffect(() => { void checkCourseSetup(course); }, [course]);

    if (!desktop || ids.length === 0) return null;

    const states = ids.map((id) => status[id]?.state);
    const checking = states.some((s) => !s || s === 'checking');
    const problems = ids.filter((id) => status[id]?.state === 'missing' || status[id]?.state === 'outdated');
    // Open by default only when something needs attention
    const expanded = open ?? problems.length > 0;

    return (
        <div className={cn(
            'mx-4 mt-4 rounded-xl border',
            problems.length ? 'border-amber-500/30 bg-amber-500/5' : 'border-[#27272a] bg-[#09090b]'
        )}>
            <button onClick={() => setOpen(!expanded)} className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left">
                {checking ? <Loader2 size={13} className="text-gray-500 animate-spin shrink-0" />
                    : problems.length ? <TriangleAlert size={13} className="text-amber-400 shrink-0" />
                        : <CheckCircle2 size={13} className="text-[var(--vylos-green)] shrink-0" />}
                <span className="flex-1 min-w-0 text-[11px] font-semibold text-gray-200 truncate">
                    {checking ? 'Checking your computer…'
                        : problems.length ? `Install ${problems.map((id) => TOOLS[id].name).join(' and ')} to follow this course`
                            : `Ready: ${ids.map((id) => `${TOOLS[id].name}${status[id]?.version ? ` ${status[id].version}` : ''}`).join(', ')}`}
                </span>
                <ChevronDown size={13} className={cn('text-gray-600 shrink-0 transition-transform', expanded && 'rotate-180')} />
            </button>

            {expanded && (
                <div className="px-3.5 pb-3 space-y-2.5 border-t border-[#27272a]/60 pt-2.5">
                    {ids.map((id) => {
                        const tool = TOOLS[id];
                        const s = status[id];
                        const needsHelp = s?.state === 'missing' || s?.state === 'outdated';
                        return (
                            <div key={id}>
                                <div className="flex items-start gap-2 text-[11px]">
                                    {s?.state === 'checking' || !s ? <Loader2 size={12} className="text-gray-500 animate-spin mt-0.5 shrink-0" />
                                        : needsHelp ? <TriangleAlert size={12} className="text-amber-400 mt-0.5 shrink-0" />
                                            : <CheckCircle2 size={12} className="text-[var(--vylos-green)] mt-0.5 shrink-0" />}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-gray-200">
                                            {tool.name}{' '}
                                            <span className="text-gray-500">
                                                {s?.state === 'found' ? (s.version ?? 'installed')
                                                    : s?.state === 'outdated' ? `${s.version} is too old`
                                                        : s?.state === 'missing' ? 'not found' : ''}
                                            </span>
                                        </p>
                                        {s?.state === 'outdated' && tool.minReason && <p className="text-[10px] text-gray-500">{tool.minReason}</p>}
                                    </div>
                                    {needsHelp && (
                                        <button
                                            onClick={() => setHelp(help === id ? null : id)}
                                            className="shrink-0 text-[10px] font-semibold text-amber-300 hover:text-amber-200"
                                        >
                                            {help === id ? 'Hide' : 'How to install'}
                                        </button>
                                    )}
                                </div>
                                {needsHelp && help === id && <InstallHelp tool={tool} />}
                            </div>
                        );
                    })}
                    <button
                        onClick={() => { for (const id of ids) void checkTool(id, { force: true }); }}
                        disabled={checking}
                        className="flex items-center gap-1.5 text-[10px] text-gray-500 hover:text-gray-200 disabled:opacity-50"
                    >
                        <RefreshCw size={10} className={checking ? 'animate-spin' : ''} /> Check again
                    </button>
                    {problems.length > 0 && (
                        <p className="flex items-start gap-1.5 text-[10px] text-gray-600 leading-relaxed">
                            <Wrench size={10} className="shrink-0 mt-0.5" />
                            You can still read the lessons and chat with the tutor; running code needs these installed.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
