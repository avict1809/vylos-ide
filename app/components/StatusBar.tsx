'use client';

import { useFileStore } from "../lib/useFileStore";
import { Cpu, Globe, CheckCircle2, FileCode } from "lucide-react";

export default function StatusBar() {
    const { openFiles, activeFileIndex } = useFileStore();
    const activeFile = activeFileIndex !== null ? openFiles[activeFileIndex] : null;

    return (
        <div className="h-6 bg-[var(--vylos-green-dark)] text-white flex items-center px-3 text-[11px] select-none">
            <div className="flex items-center gap-3 h-full">
                <div className="flex items-center gap-1.5 hover:bg-white/10 px-2 h-full cursor-pointer transition-colors">
                    <Globe size={12} />
                    <span>vylos-ai</span>
                </div>

                <div className="flex items-center gap-1.5 hover:bg-white/10 px-2 h-full cursor-pointer transition-colors">
                    <CheckCircle2 size={12} className="text-green-300" />
                    <span>AI Ready</span>
                </div>

                {activeFile && (
                    <div className="flex items-center gap-1.5 px-2 text-white/80 border-l border-white/10 ml-2">
                        <FileCode size={12} />
                        <span className="truncate max-w-[300px]">{activeFile.path}</span>
                    </div>
                )}
            </div>

            <div className="flex-1" />

            <div className="flex items-center gap-3 h-full">
                {activeFile && (
                    <>
                        <div className="px-2 hover:bg-white/10 h-full flex items-center cursor-pointer transition-colors">
                            Ln {activeFile.content.split('\n').length}, Col 1 (({activeFile.content.length} chars))
                        </div>
                        <div className="px-2 hover:bg-white/10 h-full flex items-center cursor-pointer transition-colors uppercase">
                            {activeFile.name.split('.').pop() || 'Text'}
                        </div>
                    </>
                )}

                <div className="flex items-center gap-1.5 hover:bg-white/10 px-2 h-full cursor-pointer transition-colors">
                    <Cpu size={12} />
                    <span>Vylos</span>
                </div>
            </div>
        </div>
    );
}
