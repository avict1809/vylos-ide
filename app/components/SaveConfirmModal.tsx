'use client';

import { useFileStore } from "@/app/lib/useFileStore";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/app/lib/utils";

export default function SaveConfirmModal() {
    const { fileToClose, setFileToClose, saveActiveFile, closeFile, openFiles, activeFileIndex } = useFileStore();

    if (!fileToClose) return null;

    const handleSave = async () => {
        // Find index of the file to close to temporarily make it active? 
        // Or just write directly.
        if (window.electron) {
            await window.electron.fs.write(fileToClose.path, fileToClose.content);
        }
        // Force close without dirt check
        const newFiles = openFiles.filter(f => f.path !== fileToClose.path);
        let newIndex = activeFileIndex;
        if (newFiles.length === 0) newIndex = null;
        else if (activeFileIndex !== null && activeFileIndex >= newFiles.length) newIndex = newFiles.length - 1;

        useFileStore.setState({ openFiles: newFiles, activeFileIndex: newIndex, fileToClose: null });
    };

    const handleDontSave = () => {
        const newFiles = openFiles.filter(f => f.path !== fileToClose.path);
        let newIndex = activeFileIndex;
        if (newFiles.length === 0) newIndex = null;
        else if (activeFileIndex !== null && activeFileIndex >= newFiles.length) newIndex = newFiles.length - 1;

        useFileStore.setState({ openFiles: newFiles, activeFileIndex: newIndex, fileToClose: null });
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-[400px] bg-[#18181b] border border-[#27272a] shadow-2xl rounded-lg overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-4 flex items-start gap-4">
                    <div className="p-2 bg-amber-500/10 rounded-full">
                        <AlertTriangle className="text-amber-500" size={24} />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-sm font-semibold text-white mb-1">Unsaved Changes</h3>
                        <p className="text-[13px] text-gray-400 leading-relaxed">
                            Do you want to save the changes you made to <span className="text-gray-200 font-medium">{fileToClose.name}</span>?
                            <br />
                            Your changes will be lost if you don't save them.
                        </p>
                    </div>
                </div>

                <div className="bg-[#09090b] p-3 flex justify-end gap-2 border-t border-[#27272a]">
                    <button
                        onClick={() => setFileToClose(null)}
                        className="px-3 py-1.5 text-[12px] text-gray-400 hover:text-white hover:bg-[#27272a] rounded transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleDontSave}
                        className="px-3 py-1.5 text-[12px] text-gray-300 hover:text-white border border-[#27272a] hover:bg-[#27272a] rounded transition-colors"
                    >
                        Don't Save
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-1.5 text-[12px] font-medium bg-[var(--vylos-green)] hover:bg-[var(--vylos-green-dark)] text-black rounded transition-colors"
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
}
