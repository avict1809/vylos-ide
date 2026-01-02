'use client';

import { X } from 'lucide-react';
import MonacoEditor from './MonacoEditor';
import { useFileStore } from '@/app/lib/useFileStore';
import { useEffect } from 'react';

export default function EditorArea() {
    const { activeFile, fileContent, setFileContent, isReading, setIsReading } = useFileStore();

    useEffect(() => {
        const loadFile = async () => {
            if (activeFile && window.electron) {
                setIsReading(true);
                try {
                    const content = await window.electron.fs.read(activeFile.path);
                    setFileContent(content || '');
                } catch (e) {
                    console.error("Failed to read file", e);
                    setFileContent('');
                } finally {
                    setIsReading(false);
                }
            }
        };
        loadFile();
    }, [activeFile, setFileContent, setIsReading]);

    if (!activeFile) {
        return (
            <div className="h-full w-full bg-[var(--vylos-grey-dark)] flex items-center justify-center text-[var(--vylos-text-secondary)]">
                <div className="text-center">
                    <p>No file is open</p>
                    <p className="text-xs mt-2 opacity-50">Select a file from the explorer to start editing</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full w-full bg-[var(--vylos-grey-dark)] flex flex-col">
            {/* Tabs */}
            <div className="flex bg-[var(--vylos-black)] overflow-x-auto">
                <div className="px-3 py-2 bg-[var(--vylos-grey-dark)] text-[var(--vylos-text-primary)] text-sm border-t-2 border-[var(--vylos-green)] flex items-center min-w-[120px] justify-between">
                    <span>{activeFile.name}</span>
                    <X size={14} className="ml-2 hover:bg-[var(--vylos-grey-light)] rounded p-0.5 cursor-pointer" />
                </div>
            </div>

            {/* Editor Content */}
            <div className="flex-1 overflow-hidden relative">
                {isReading ? (
                    <div className="flex items-center justify-center h-full text-[var(--vylos-text-secondary)]">Loading...</div>
                ) : (
                    <MonacoEditor
                        language={activeFile.name.endsWith('.ts') || activeFile.name.endsWith('.tsx') ? 'typescript' : 'javascript'}
                        defaultValue={fileContent}
                        // Force re-render when file changes to update content
                        key={activeFile.path}
                    />
                )}
            </div>
        </div>
    );
}
