'use client';

import { Search as SearchIcon, FileText, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useFileStore } from '@/app/lib/useFileStore';

export default function SearchView() {
    const { openFile, projectRoot } = useFileStore();
    const [query, setQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [results, setResults] = useState<any[]>([]);

    useEffect(() => {
        const timeoutId = setTimeout(async () => {
            if (!query.trim()) {
                setResults([]);
                return;
            }

            const electron = (window as any).electron;
            if (!electron) return;

            setIsSearching(true);
            try {
                const root = projectRoot || '.';
                const res = await electron.find.search(query, root);
                setResults(res);
            } catch (e) {
                console.error("Search error", e);
            } finally {
                setIsSearching(false);
            }
        }, 300); // 300ms debounce

        return () => clearTimeout(timeoutId);
    }, [query, projectRoot]);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        // The real search logic is now in the useEffect above
    };

    const handleResultClick = async (res: any) => {
        const electron = (window as any).electron;
        if (electron) {
            const content = await electron.fs.read(res.path);
            if (content !== null) {
                openFile(
                    { name: res.name, path: res.path, isDirectory: false },
                    content,
                    { query: query, line: res.line }
                );
            }
        }
    };

    return (
        <div className="h-full flex flex-col bg-[var(--vylos-black)] text-[var(--vylos-text-primary)]">
            <div className="p-3 border-b border-[var(--vylos-grey-border)]">
                <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--vylos-text-secondary)]">Search</h2>
            </div>

            <div className="p-3">
                <form onSubmit={handleSearch} className="flex flex-col gap-2">
                    <div className="relative">
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search..."
                            className="w-full bg-[var(--vylos-grey-dark)] border border-[var(--vylos-grey-border)] rounded px-8 py-1.5 text-sm outline-none focus:border-[var(--vylos-green)] transition-all"
                        />
                        <SearchIcon size={14} className="absolute left-2.5 top-2.5 text-gray-500" />
                    </div>
                </form>
            </div>

            <div className="flex-1 overflow-y-auto px-3 pb-3">
                {isSearching ? (
                    <div className="flex items-center justify-center py-10 text-gray-500 gap-2">
                        <Loader2 size={16} className="animate-spin text-[var(--vylos-green)]" />
                        <span className="text-sm">Searching files...</span>
                    </div>
                ) : results.length > 0 ? (
                    <div className="space-y-2">
                        {results.map((res, i) => (
                            <div
                                key={i}
                                className="p-2 border border-[var(--vylos-grey-border)] rounded hover:bg-[var(--vylos-grey-medium)] cursor-pointer group transition-colors"
                                onClick={() => handleResultClick(res)}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <FileText size={14} className="text-gray-400" />
                                    <span className="text-sm font-medium truncate">{res.name}</span>
                                    <span className="text-[10px] text-gray-500 ml-auto">Line {res.line}</span>
                                </div>
                                <div className="text-xs text-gray-500 truncate group-hover:text-gray-300 italic">
                                    {res.text}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : query && !isSearching ? (
                    <div className="text-center py-10 text-gray-500 text-sm">
                        No results found for "{query}"
                    </div>
                ) : (
                    <div className="text-center py-10 text-gray-500 text-sm opacity-50">
                        Type something to search across your workspace
                    </div>
                )}
            </div>
        </div>
    );
}
