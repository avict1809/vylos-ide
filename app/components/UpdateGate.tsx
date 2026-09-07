'use client';

import { useEffect, useState } from 'react';
import { Download, RefreshCw, ArrowUpCircle } from 'lucide-react';

/**
 * Blocks the app while a mandatory update is pending.
 *
 * Vylos speaks to versioned backend services, so an out-of-date client is not
 * just missing features — it can fail in ways the learner cannot diagnose.
 * Once the main process reports an update, the only way forward is to install
 * it. The gate never traps the user: quitting stays available, and an update
 * that cannot be reached fails open (`required` stays false) rather than
 * bricking the app.
 */
export default function UpdateGate() {
    const [update, setUpdate] = useState<UpdateState | null>(null);

    useEffect(() => {
        const api = typeof window !== 'undefined' ? window.electron?.updates : undefined;
        // Running in a plain browser (next dev): there is nothing to update
        if (!api) return;

        let cancelled = false;
        api.getState().then((state) => {
            // The startup check can finish before this window is listening
            if (!cancelled) setUpdate(state);
        });
        const unsubscribe = api.onState(setUpdate);

        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, []);

    if (!update?.required) return null;

    const installing = update.status === 'downloaded';
    const percent = update.status === 'downloading' ? update.percent : null;

    return (
        <div className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-sm flex flex-col items-center justify-center app-region-drag">
            <div className="w-[26rem] max-w-[calc(100vw-4rem)] bg-[#0d0d0d] border border-[var(--vylos-grey-border)] rounded-xl shadow-2xl overflow-hidden app-region-no-drag">
                <div className="p-6 border-b border-[var(--vylos-grey-border)] bg-gradient-to-br from-[#050505] to-black">
                    <div className="flex items-center gap-2 mb-1">
                        <ArrowUpCircle size={14} className="text-[var(--vylos-green)]" />
                        <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Update Required</span>
                    </div>
                    <h2 className="text-lg font-black text-white italic uppercase tracking-tighter">
                        Vylos <span className="text-[var(--vylos-green)]">{update.version ?? 'Update'}</span>
                    </h2>
                </div>

                <div className="p-6">
                    <p className="text-[12px] text-gray-400 leading-relaxed mb-5">
                        {installing
                            ? 'The update is ready. Vylos will restart to finish installing it.'
                            : 'A new version of Vylos is required to keep going. It is downloading now — this only takes a moment.'}
                    </p>

                    {!installing && (
                        <div className="mb-5">
                            <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                                <div
                                    className={
                                        percent === null
                                            ? 'h-full w-1/3 bg-[var(--vylos-green)] animate-pulse'
                                            : 'h-full bg-[var(--vylos-green)] transition-all duration-300'
                                    }
                                    style={percent === null ? undefined : { width: `${percent}%` }}
                                />
                            </div>
                            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-gray-500">
                                <Download size={10} />
                                {percent === null ? 'Preparing download…' : `Downloading… ${percent}%`}
                            </div>
                        </div>
                    )}

                    <button
                        onClick={() => window.electron?.updates.install()}
                        disabled={!installing}
                        className={
                            installing
                                ? 'w-full bg-[var(--vylos-green)] hover:bg-[var(--vylos-green-accent)] text-black font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm transition-all transform active:scale-95 shadow-[0_0_15px_rgba(0,255,0,0.2)]'
                                : 'w-full bg-[#1a1a1a] text-gray-600 font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm cursor-not-allowed'
                        }
                    >
                        <RefreshCw size={15} /> Restart &amp; Update
                    </button>

                    <div className="mt-3 flex items-center justify-between text-[10px] text-gray-600">
                        <span>Installed: v{update.currentVersion}</span>
                        <button
                            onClick={() => window.electron?.window.close()}
                            className="hover:text-gray-400 transition-colors"
                        >
                            Quit Vylos
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
