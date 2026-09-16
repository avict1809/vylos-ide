'use client';

import { useState, useEffect, useRef } from 'react';
import { useFileStore } from '../lib/useFileStore';
import { Search } from 'lucide-react';
import FileIcon from './ui/FileIcon';
import { cn } from '../lib/utils';

export default function QuickOpenModal() {
    const { showQuickOpen, setShowQuickOpen, projectRoot, openFileByPath, recentFiles } = useFileStore();
    const [query, setQuery] = useState('');
    const [files, setFiles] = useState<string[]>([]);
    const [filteredFiles, setFilteredFiles] = useState<string[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!showQuickOpen) return;
        setQuery('');
        setSelectedIndex(0);
        if (projectRoot) {
            (window as any).electron?.fs.listAll(projectRoot).then((res: string[]) => setFiles(res));
        }
        setTimeout(() => inputRef.current?.focus(), 50);
    }, [showQuickOpen, projectRoot]);

    useEffect(() => {
        // Recently opened files first (even outside the project), then the rest of the project
        const recent = new Set(recentFiles);
        const pool = [...recentFiles, ...files.filter(f => !recent.has(f))];
        if (!query) {
            setFilteredFiles(pool.slice(0, 10));
            return;
        }
        const lower = query.toLowerCase();
        const filtered = pool
            .filter(f => f.toLowerCase().includes(lower))
            .sort((a, b) => {
                const aName = a.split(/[\\/]/).pop()?.toLowerCase() || '';
                const bName = b.split(/[\\/]/).pop()?.toLowerCase() || '';
                if (aName.startsWith(lower) && !bName.startsWith(lower)) return -1;
                if (!aName.startsWith(lower) && bName.startsWith(lower)) return 1;
                return a.length - b.length;
            })
            .slice(0, 10);
        setFilteredFiles(filtered);
        setSelectedIndex(0);
    }, [query, files, recentFiles]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(i => (i + 1) % filteredFiles.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(i => (i - 1 + filteredFiles.length) % filteredFiles.length);
        } else if (e.key === 'Enter') {
            if (filteredFiles[selectedIndex]) {
                openFileByPath(filteredFiles[selectedIndex]);
                setShowQuickOpen(false);
            }
        } else if (e.key === 'Escape') {
            setShowQuickOpen(false);
        }
    };

    if (!showQuickOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-start justify-center pt-20 bg-black/40 backdrop-blur-sm">
            <div
                className="w-full max-w-2xl bg-[#18181b] border border-[#27272a] shadow-2xl rounded-lg overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center px-4 py-3 border-b border-[#27272a] gap-3">
                    <Search size={18} className="text-[var(--vylos-green)]" />
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Search files by name..."
                        className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder-gray-500"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                </div>

                <div className="max-h-[400px] overflow-y-auto py-2">
                    {filteredFiles.length > 0 ? (
                        filteredFiles.map((file, index) => {
                            const name = file.split(/[\\/]/).pop();
                            const relativePath = projectRoot ? file.replace(projectRoot, '').replace(/^[\\/]/, '') : file;
                            return (
                                <div
                                    key={file}
                                    className={cn(
                                        "px-4 py-2 flex items-center gap-3 cursor-pointer select-none",
                                        selectedIndex === index ? "bg-[var(--vylos-green-dark)]/20 border-l-2 border-[var(--vylos-green)]" : "hover:bg-[#27272a]"
                                    )}
                                    onClick={() => {
                                        openFileByPath(file);
                                        setShowQuickOpen(false);
                                    }}
                                    onMouseEnter={() => setSelectedIndex(index)}
                                >
                                    <FileIcon name={name ?? file} size={16} />
                                    <div className="flex flex-col flex-1 min-w-0">
                                        <span className={cn("text-sm", selectedIndex === index ? "text-[var(--vylos-green)] font-medium" : "text-gray-200")}>
                                            {name}
                                        </span>
                                        <span className="text-[11px] text-gray-500 truncate">{relativePath}</span>
                                    </div>
                                    {recentFiles.includes(file) && (
                                        <span className="text-[10px] text-gray-500 shrink-0">recently opened</span>
                                    )}
                                </div>
                            );
                        })
                    ) : (
                        <div className="px-4 py-8 text-center text-gray-500 text-sm">
                            {query ? `No files matching "${query}"` : 'No recently opened files'}
                        </div>
                    )}
                </div>

                <div className="px-4 py-2 bg-[#09090b] border-t border-[#27272a] flex justify-between items-center">
                    <span className="text-[10px] text-gray-500 uppercase tracking-widest">Quick Open</span>
                    <span className="text-[10px] text-gray-400">Esc to dismiss</span>
                </div>
            </div>
            <div className="absolute inset-0 -z-10" onClick={() => setShowQuickOpen(false)} />
        </div>
    );
}
