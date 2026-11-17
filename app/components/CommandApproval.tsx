'use client';

import { useEffect, useRef } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useApprovalStore } from '@/app/lib/security/approval-store';

/**
 * Asks the learner before the AI tutor or an extension runs a command that
 * isn't plainly "run this project file" (see command-policy.ts). Deny has
 * the focus, so a stray Enter never approves anything.
 */
export default function CommandApproval() {
    const request = useApprovalStore((s) => s.queue[0]);
    const waiting = useApprovalStore((s) => s.queue.length);
    const decide = useApprovalStore((s) => s.decide);
    const denyRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        denyRef.current?.focus();
    }, [request?.id]);

    if (!request) return null;

    return (
        <div
            role="alertdialog"
            aria-labelledby="command-approval-title"
            aria-describedby="command-approval-command"
            onKeyDown={(e) => {
                if (e.key === 'Escape') decide(request.id, false);
            }}
            className="fixed bottom-16 left-1/2 z-[100] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 rounded-xl border border-amber-700/60 bg-[#0c0a09] p-4 shadow-2xl"
        >
            <div className="flex items-start gap-3">
                <ShieldAlert size={18} className="mt-0.5 shrink-0 text-amber-400" />
                <div className="min-w-0 flex-1">
                    <p id="command-approval-title" className="text-sm font-semibold text-white">
                        {request.requester} wants to run a command
                    </p>
                    <pre
                        id="command-approval-command"
                        className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md border border-white/10 bg-black px-3 py-2 font-mono text-xs text-gray-200"
                    >
                        {request.command}
                    </pre>
                    <p className="mt-2 text-[11px] text-gray-500">
                        {request.cwd ? <>In <span className="font-mono">{request.cwd}</span>. </> : null}
                        {request.reason} Only approve it if you understand what it does.
                    </p>
                    <div className="mt-3 flex items-center justify-end gap-2">
                        {waiting > 1 && <span className="mr-auto text-[11px] text-gray-500">{waiting - 1} more waiting</span>}
                        <button
                            ref={denyRef}
                            onClick={() => decide(request.id, false)}
                            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-gray-200 hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-white/30"
                        >
                            Don&apos;t run
                        </button>
                        <button
                            onClick={() => decide(request.id, true)}
                            className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-300"
                        >
                            Run it
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
