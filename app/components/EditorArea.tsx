'use client';

import type { ReactNode } from 'react';
import { X, Folder, File } from 'lucide-react';
import MonacoEditor from './MonacoEditor';
import { useFileStore } from '@/app/lib/useFileStore';
import { cn } from '@/app/lib/utils';

function RecentEntry({ path, icon, onOpen }: { path: string; icon: ReactNode; onOpen: () => void }) {
    const parts = path.split(/[\\/]/);
    const name = parts.pop();
    return (
        <button onClick={onOpen} title={path} className="w-full flex items-center gap-2 py-1 text-left group">
            <span className="text-gray-500 shrink-0">{icon}</span>
            <span className="text-[var(--vylos-green)] group-hover:underline shrink-0">{name}</span>
            <span className="text-gray-600 text-[12px] truncate">{parts.join('/')}</span>
        </button>
    );
}

export default function EditorArea() {
    const {
        openFiles, activeFileIndex, setActiveIndex, closeFile, updateActiveContent,
        recentFolders, recentFiles, openFolderPath, openFileByPath
    } = useFileStore();
    const activeFile = activeFileIndex !== null ? openFiles[activeFileIndex] : null;

    if (!activeFile) {
        return (
            <div className="h-full w-full bg-[#1e1e1e] flex flex-col items-center overflow-y-auto select-none">
                <div className="my-auto py-8 w-full flex flex-col items-center">
                    <div className="flex flex-col items-center opacity-20">
                        <img src="/logo.svg" alt="Vylos Logo" className="w-64 h-64 grayscale contrast-50" />
                    </div>

                    <div className="mt-12 space-y-4 max-w-sm w-full px-8">
                        <div className="flex justify-between items-center text-[13px]">
                            <span className="text-gray-500">Go to File</span>
                            <div className="flex gap-1">
                                <kbd className="px-1.5 py-0.5 bg-[#333] rounded text-gray-300 min-w-[20px] text-center border border-[#444] shadow-sm">Ctrl</kbd>
                                <span className="text-gray-600">+</span>
                                <kbd className="px-1.5 py-0.5 bg-[#333] rounded text-gray-300 min-w-[20px] text-center border border-[#444] shadow-sm">P</kbd>
                            </div>
                        </div>

                        <div className="flex justify-between items-center text-[13px]">
                            <span className="text-gray-500">Open Folder</span>
                            <div className="flex gap-1">
                                <kbd className="px-1.5 py-0.5 bg-[#333] rounded text-gray-300 min-w-[20px] text-center border border-[#444] shadow-sm">Ctrl</kbd>
                                <span className="text-gray-600">+</span>
                                <kbd className="px-1.5 py-0.5 bg-[#333] rounded text-gray-300 min-w-[20px] text-center border border-[#444] shadow-sm">K</kbd>
                                <span className="text-gray-600">,</span>
                                <kbd className="px-1.5 py-0.5 bg-[#333] rounded text-gray-300 min-w-[20px] text-center border border-[#444] shadow-sm">O</kbd>
                            </div>
                        </div>

                        <div className="flex justify-between items-center text-[13px]">
                            <span className="text-gray-500">Toggle Terminal</span>
                            <div className="flex gap-1">
                                <kbd className="px-1.5 py-0.5 bg-[#333] rounded text-gray-300 min-w-[20px] text-center border border-[#444] shadow-sm">Ctrl</kbd>
                                <span className="text-gray-600">+</span>
                                <kbd className="px-1.5 py-0.5 bg-[#333] rounded text-gray-300 min-w-[20px] text-center border border-[#444] shadow-sm">`</kbd>
                            </div>
                        </div>

                        <div className="flex justify-between items-center text-[13px]">
                            <span className="text-gray-500">Toggle Voice Tutor</span>
                            <div className="flex gap-1">
                                <kbd className="px-1.5 py-0.5 bg-[#333] rounded text-gray-300 min-w-[20px] text-center border border-[#444] shadow-sm">Ctrl</kbd>
                                <span className="text-gray-600">+</span>
                                <kbd className="px-1.5 py-0.5 bg-[#333] rounded text-gray-300 min-w-[20px] text-center border border-[#444] shadow-sm">L</kbd>
                            </div>
                        </div>
                    </div>

                    {(recentFolders.length > 0 || recentFiles.length > 0) && (
                        <div className="mt-10 max-w-sm w-full px-8 text-[13px]">
                            <div className="text-[11px] uppercase tracking-widest text-gray-500 mb-2">Recent</div>
                            {recentFolders.slice(0, 5).map(p => (
                                <RecentEntry key={p} path={p} icon={<Folder size={13} />} onOpen={() => openFolderPath(p)} />
                            ))}
                            {recentFiles.slice(0, 5).map(p => (
                                <RecentEntry key={p} path={p} icon={<File size={13} />} onOpen={() => openFileByPath(p)} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="h-full w-full bg-[var(--vylos-grey-dark)] flex flex-col">
            {/* Tab Bar */}
            <div className="flex bg-[#0d0d0d] overflow-x-auto scrollbar-hide border-b border-[#27272a] h-9">
                {openFiles.map((file, index) => (
                    <div
                        key={file.path}
                        onClick={() => setActiveIndex(index)}
                        className={cn(
                            "group flex items-center min-w-[120px] max-w-[200px] px-3 h-full border-r border-[#27272a] cursor-pointer transition-colors relative",
                            activeFileIndex === index
                                ? "bg-[var(--vylos-black)] text-[var(--vylos-green)]"
                                : "bg-[#18181b] text-gray-500 hover:bg-[#1a1a1e] hover:text-gray-300"
                        )}
                    >
                        <span className="truncate text-[12px] flex-1">{file.name}</span>

                        {/* Dirty indicator / Close button */}
                        <div className="flex items-center ml-2 w-4">
                            {file.isDirty ? (
                                <div className="w-2 h-2 rounded-full bg-[var(--vylos-green)] group-hover:hidden" />
                            ) : null}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    closeFile(file.path);
                                }}
                                className={cn(
                                    "p-0.5 rounded-sm hover:bg-[#27272a] hover:text-white transition-opacity",
                                    file.isDirty ? "hidden group-hover:flex" : "hidden group-hover:flex",
                                    activeFileIndex === index && !file.isDirty ? "flex" : ""
                                )}
                            >
                                <X size={12} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Editor Content */}
            <div className="flex-1 overflow-hidden relative">
                <MonacoEditor
                    language={activeFile.name.endsWith('.ts') || activeFile.name.endsWith('.tsx') ? 'typescript' : 'javascript'}
                    value={activeFile.content}
                    onChange={(val) => updateActiveContent(val || "")}
                    key={activeFile.path}
                />
            </div>
        </div>
    );
}
