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
        <div className="h-full flex flex-col bg-[#000000]">
            <div className="p-4 border-b border-[#1a1a1a] bg-gradient-to-br from-[#050505] to-black">
                <div className="flex items-center gap-2 mb-3">
                    <SearchIcon size={14} className="text-[var(--vylos-green)]" />
                    <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Global Search</span>
                </div>
                <form onSubmit={handleSearch} className="relative group">
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search files..."
                        className="w-full bg-[#09090b] border border-[#1a1a1a] focus:border-[var(--vylos-green-dark)] text-[13px] text-white rounded-xl px-9 py-2 outline-none transition-all placeholder:text-gray-600 shadow-xl"
                    />
                    <SearchIcon size={14} className="absolute left-3 top-2.5 text-gray-500 group-focus-within:text-[var(--vylos-green)] transition-colors" />
                </form>
            </div>



            <div className="flex-1 overflow-y-auto px-2 pb-3 custom-scrollbar">
                {isSearching ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3">
                        <Loader2 size={24} className="animate-spin text-[var(--vylos-green)]" />
                        <span className="text-[10px] text-[var(--vylos-green)] font-black uppercase tracking-widest animate-pulse">Scanning Files...</span>
                    </div>
                ) : results.length > 0 ? (
                    <div className="space-y-1 pt-2">
                        {results.map((res, i) => (
                            <div
                                key={i}
                                className="p-3 bg-black border border-transparent hover:border-[#1a1a1a] hover:bg-[#050505] rounded-xl cursor-pointer group transition-all"
                                onClick={() => handleResultClick(res)}
                            >
                                <div className="flex items-center gap-2 mb-2">
                                    <FileText size={12} className="text-[var(--vylos-green)] opacity-50" />
                                    <span className="text-[12px] font-bold text-gray-300 truncate group-hover:text-white transition-colors">{res.name}</span>
                                    <span className="text-[9px] text-gray-600 ml-auto font-mono uppercase">L{res.line}</span>
                                </div>
                                <div className="text-[11px] text-gray-500 truncate group-hover:text-gray-400 italic font-mono bg-[#09090b]/50 p-2 rounded-lg border border-[#111]">
                                    {res.text}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : query && !isSearching ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="w-12 h-12 bg-[#09090b] rounded-2xl flex items-center justify-center mb-4 border border-[#1a1a1a]">
                            <SearchIcon size={20} className="text-gray-700" />
                        </div>
                        <h3 className="text-gray-400 text-sm font-bold">No results found</h3>
                        <p className="text-[10px] text-gray-600 mt-1 uppercase tracking-widest">Try a broader term</p>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-20 opacity-30">
                        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-300">Enter Query Above</div>
                    </div>
                )}
            </div>
        </div>
    );
}
