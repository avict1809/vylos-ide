'use client';

import { useFileStore } from "../lib/useFileStore";
import { Cpu, Globe, CheckCircle2, FileCode } from "lucide-react";

export default function StatusBar() {
    const { openFiles, activeFileIndex } = useFileStore();
    const activeFile = activeFileIndex !== null ? openFiles[activeFileIndex] : null;

    return (
        <div className="h-6 bg-[#09090b] text-gray-400 border-t border-[#27272a] flex items-center px-3 text-[10.5px] select-none">
            <div className="flex items-center h-full">
                <div className="flex items-center gap-1.5 hover:bg-[#27272a] hover:text-white px-2 h-full cursor-pointer transition-colors group">
                    <Globe size={12} className="group-hover:text-[var(--vylos-green)]" />
                    <span className="font-medium">vylos-ai</span>
                </div>

                <div className="flex items-center gap-1.5 hover:bg-[#27272a] px-2 h-full cursor-pointer transition-colors border-r border-[#27272a]">
                    <span className="w-2 h-2 rounded-full bg-[var(--vylos-green)] shadow-[0_0_8px_rgba(0,255,0,0.5)] animate-pulse" />
                    <span className="text-[var(--vylos-green)] font-bold tracking-tight">AI READY</span>
                </div>

                {activeFile && (
                    <div className="flex items-center gap-3 px-3">
                        <div className="flex items-center gap-1.5">
                            <FileCode size={12} className="opacity-50" />
                            <span className="truncate max-w-[200px] opacity-70">{activeFile.name}</span>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex-1" />

            <div className="flex items-center h-full">
                {activeFile && (
                    <>
                        <div className="px-3 border-l border-[#27272a] hover:bg-[#27272a] h-full flex items-center cursor-pointer transition-colors">
                            <span className="opacity-60">Ln</span>&nbsp;{activeFile.content.split('\n').length},&nbsp;
                            <span className="opacity-60">Col</span>&nbsp;1&nbsp;
                            <span className="ml-2 text-[9px] px-1 bg-[#18181b] rounded border border-[#27272a]">
                                {activeFile.content.length} chars
                            </span>
                        </div>
                        <div className="px-3 border-l border-[#27272a] hover:bg-[#27272a] h-full flex items-center cursor-pointer transition-colors font-bold uppercase tracking-widest text-[#10b981]">
                            {activeFile.name.split('.').pop() || 'plain text'}
                        </div>
                    </>
                )}

                <div className="flex items-center gap-1.5 hover:bg-[var(--vylos-green-dark)]/20 hover:text-[var(--vylos-green)] px-3 h-full cursor-pointer transition-colors border-l border-[#27272a]">
                    <Cpu size={12} />
                    <span className="font-black uppercase tracking-tighter italic">Vylos 2.0</span>
                </div>
            </div>
        </div>
    );
}
