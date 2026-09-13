'use client';

import { useEffect, useState } from 'react';
import { useFileStore } from '../lib/useFileStore';
import { X, Cpu, Github, Globe } from 'lucide-react';
import Image from 'next/image';

export default function AboutModal() {
    const { showAbout, setShowAbout } = useFileStore();
    // The running app's version (null in the browser-only dev build)
    const [version, setVersion] = useState<string | null>(null);

    useEffect(() => {
        window.electron?.getVersion().then(setVersion);
    }, []);

    if (!showAbout) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
            <div className="w-full max-w-md bg-[#18181b] border border-[#27272a] shadow-2xl rounded-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="relative h-32 bg-gradient-to-br from-[#09090b] to-[#10b981]/10 flex items-center justify-center border-b border-[#27272a]">
                    <button
                        onClick={() => setShowAbout(false)}
                        className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
                    >
                        <X size={20} />
                    </button>
                    <Image src="/logo.svg" alt="Vylos Logo" width={60} height={60} className="drop-shadow-[0_0_15px_rgba(16,185,129,0.3)]" />
                </div>

                <div className="p-8 flex flex-col items-center text-center">
                    <h2 className="text-2xl font-bold text-white tracking-tight">Vylos IDE</h2>
                    {version && (
                        <p className="text-[#10b981] text-xs font-mono mt-1 font-bold uppercase tracking-widest">Version {version} Alpha</p>
                    )}

                    <p className="mt-6 text-gray-400 text-[13px] leading-relaxed">
                        A state-of-the-art, AI-native programming environment designed to accelerate learning and development.
                    </p>

                    <div className="w-full h-px bg-[#27272a] my-6" />

                    <div className="grid grid-cols-1 w-full gap-3 text-[13px]">
                        <div className="flex items-center gap-3 px-4 py-2 bg-[#09090b] rounded-lg border border-[#27272a] text-gray-300">
                            <Cpu size={16} className="text-[#10b981]" />
                            <span className="flex-1 text-left">Developed by vylos group</span>
                        </div>
                        <div className="flex items-center gap-3 px-4 py-2 bg-[#09090b] rounded-lg border border-[#27272a] text-gray-300">
                            <Globe size={16} className="text-[#10b981]" />
                            <span className="flex-1 text-left select-text">vylos.co</span>
                        </div>
                    </div>

                    <button
                        onClick={() => setShowAbout(false)}
                        className="mt-8 w-full py-2.5 bg-[#10b981] hover:bg-[#059669] text-black font-bold rounded-lg transition-all active:scale-95"
                    >
                        Close
                    </button>

                    <p className="mt-6 text-[10px] text-gray-600 uppercase tracking-tighter">
                        © 2026 Vylos Team. All Rights Reserved.
                    </p>
                </div>
            </div>
            <div className="absolute inset-0 -z-10" onClick={() => setShowAbout(false)} />
        </div>
    );
}
