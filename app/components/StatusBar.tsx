'use client';

import { useSyncExternalStore } from "react";
import { useFileStore } from "../lib/useFileStore";
import { Cpu, Globe, FileCode, PanelLeft } from "lucide-react";
import { editorStatus, languageName, runEditorAction } from "../lib/editor-bridge";

export default function StatusBar() {
    const { openFiles, activeFileIndex, showSidebar, toggleSidebar } = useFileStore();
    const activeFile = activeFileIndex !== null ? openFiles[activeFileIndex] : null;
    // The focused editor's cursor, selection and settings, live
    const status = useSyncExternalStore(editorStatus.subscribe, editorStatus.get, () => null);

    return (
        <div className="h-6 bg-[#09090b] text-gray-400 border-t border-[#27272a] flex items-center px-3 text-[10.5px] select-none">
            <div className="flex items-center h-full">
                <button
                    type="button"
                    onClick={toggleSidebar}
                    title={`${showSidebar ? 'Hide' : 'Show'} Side Bar (Ctrl+B)`}
                    className="flex items-center hover:bg-[#27272a] hover:text-white px-2 h-full transition-colors"
                >
                    <PanelLeft size={12} className={showSidebar ? 'text-[var(--vylos-green)]' : ''} />
                </button>

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
                {activeFile && status && (
                    <>
                        <button
                            type="button"
                            onClick={() => runEditorAction('editor.action.gotoLine')}
                            title="Go to Line/Column (Ctrl+G)"
                            className="px-3 border-l border-[#27272a] hover:bg-[#27272a] hover:text-white h-full flex items-center transition-colors"
                        >
                            Ln {status.line}, Col {status.column}
                            {status.cursors > 1
                                ? ` (${status.cursors} selections)`
                                : status.selectedChars > 0 ? ` (${status.selectedChars} selected)` : ''}
                        </button>
                        <span className="px-3 border-l border-[#27272a] h-full flex items-center" title="Indentation">
                            {status.insertSpaces ? 'Spaces' : 'Tab Size'}: {status.tabSize}
                        </span>
                        <span className="px-3 border-l border-[#27272a] h-full flex items-center">UTF-8</span>
                        <span className="px-3 border-l border-[#27272a] h-full flex items-center" title="End of line sequence">{status.eol}</span>
                        <span className="px-3 border-l border-[#27272a] h-full flex items-center font-bold text-[#10b981]">
                            {languageName(status.languageId)}
                        </span>
                    </>
                )}

                <div className="flex items-center gap-1.5 hover:bg-[var(--vylos-green-dark)]/20 hover:text-[var(--vylos-green)] px-3 h-full cursor-pointer transition-colors border-l border-[#27272a]">
                    <Cpu size={12} />
                    <span className="font-black uppercase tracking-tighter italic">Vylos 0.1.0</span>
                </div>
            </div>
        </div>
    );
}
