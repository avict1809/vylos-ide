'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useFileStore } from '../lib/useFileStore';
import { COMMANDS, formatBinding } from '../lib/commands';
import { editorActions, runEditorAction } from '../lib/editor-bridge';
import { cn } from '../lib/utils';

// The command palette (Ctrl+Shift+P / F1): every workbench command with its
// shortcut, plus the focused editor's own commands (comment, format, rename…).

interface Item {
    id: string;
    label: string;
    shortcut?: string;
    run: () => void;
}

const MAX_RECENT = 5;
// Kept for the app's lifetime, like VS Code's "recently used"
const recentlyUsed: string[] = [];

/** Every word typed appears in the label, in order: "tog side" finds "Toggle Side Bar". */
function score(label: string, query: string): number {
    const text = label.toLowerCase();
    let at = 0;
    let gaps = 0;
    for (const word of query.toLowerCase().split(/\s+/).filter(Boolean)) {
        const found = text.indexOf(word, at);
        if (found === -1) return -1;
        gaps += found - at;
        at = found + word.length;
    }
    return gaps;
}

export default function CommandPalette() {
    const { showCommandPalette, setShowCommandPalette } = useFileStore();
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState(0);
    const [editorItems, setEditorItems] = useState<Item[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!showCommandPalette) return;
        // Read once per opening: the focused editor's actions depend on its language
        const actions = editorActions().map((a) => ({ id: a.id, label: a.label, run: () => { runEditorAction(a.id); } }));
        const id = requestAnimationFrame(() => {
            setQuery('');
            setSelected(0);
            setEditorItems(actions);
            inputRef.current?.focus();
        });
        return () => cancelAnimationFrame(id);
    }, [showCommandPalette]);

    const items = useMemo(() => {
        const ours: Item[] = COMMANDS.filter((c) => c.id !== 'workbench.commandPalette').map((c) => ({
            id: c.id,
            label: c.label,
            shortcut: c.keys?.[0] ? formatBinding(c.keys[0]) : undefined,
            run: () => void c.run(),
        }));
        // Editor actions whose name we already have (e.g. Go to Line) show once
        const names = new Set(ours.map((i) => i.label.toLowerCase()));
        const all = [...ours, ...editorItems.filter((i) => !names.has(i.label.toLowerCase()))];

        const q = query.replace(/^>\s*/, '').trim();
        if (!q) {
            const recent = recentlyUsed.map((id) => all.find((i) => i.id === id)).filter((i): i is Item => !!i);
            const rest = all.filter((i) => !recentlyUsed.includes(i.id)).sort((a, b) => a.label.localeCompare(b.label));
            return { recentCount: recent.length, list: [...recent, ...rest] };
        }
        const list = all
            .map((item) => ({ item, s: score(item.label, q) }))
            .filter((x) => x.s >= 0)
            .sort((a, b) => a.s - b.s || a.item.label.length - b.item.label.length)
            .map((x) => x.item);
        return { recentCount: 0, list };
    }, [query, editorItems]);

    // Keep the highlighted row in view while moving with the arrows
    useEffect(() => {
        listRef.current?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [selected]);

    const run = (item: Item | undefined) => {
        if (!item) return;
        setShowCommandPalette(false);
        const at = recentlyUsed.indexOf(item.id);
        if (at !== -1) recentlyUsed.splice(at, 1);
        recentlyUsed.unshift(item.id);
        recentlyUsed.length = Math.min(recentlyUsed.length, MAX_RECENT);
        // After the palette closes, so focus lands where the command puts it
        setTimeout(item.run, 0);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        const count = items.list.length;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (count) setSelected((i) => (i + 1) % count);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (count) setSelected((i) => (i - 1 + count) % count);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            run(items.list[selected]);
        } else if (e.key === 'Escape') {
            setShowCommandPalette(false);
        }
    };

    if (!showCommandPalette) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-start justify-center pt-20 bg-black/40 backdrop-blur-sm">
            <div className="w-full max-w-2xl bg-[#18181b] border border-[#27272a] shadow-2xl rounded-lg overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center px-4 py-3 border-b border-[#27272a] gap-3">
                    <ChevronRight size={18} className="text-[var(--vylos-green)]" />
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Type a command…"
                        aria-label="Command"
                        className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder-gray-500"
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setSelected(0);
                        }}
                        onKeyDown={handleKeyDown}
                    />
                </div>

                <div ref={listRef} role="listbox" className="max-h-[400px] overflow-y-auto py-1">
                    {items.list.length === 0 ? (
                        <div className="px-4 py-8 text-center text-gray-500 text-sm">No matching commands</div>
                    ) : (
                        items.list.map((item, index) => (
                            <div
                                key={item.id}
                                data-index={index}
                                role="option"
                                aria-selected={selected === index}
                                className={cn(
                                    'px-4 py-1.5 flex items-center gap-3 cursor-pointer select-none text-sm',
                                    selected === index ? 'bg-[var(--vylos-green-dark)]/20 border-l-2 border-[var(--vylos-green)] text-white' : 'text-gray-300 hover:bg-[#27272a]',
                                    index === items.recentCount && items.recentCount > 0 && 'border-t border-[#27272a]'
                                )}
                                onClick={() => run(item)}
                                onMouseEnter={() => setSelected(index)}
                            >
                                <span className="flex-1 truncate">{item.label}</span>
                                {index < items.recentCount && <span className="text-[10px] text-gray-500">recently used</span>}
                                {item.shortcut && (
                                    <kbd className="text-[10px] text-gray-400 bg-[#09090b] border border-[#27272a] rounded px-1.5 py-0.5 font-mono">{item.shortcut}</kbd>
                                )}
                            </div>
                        ))
                    )}
                </div>

                <div className="px-4 py-2 bg-[#09090b] border-t border-[#27272a] flex justify-between items-center">
                    <span className="text-[10px] text-gray-500 uppercase tracking-widest">Command Palette</span>
                    <span className="text-[10px] text-gray-400">Enter to run · Esc to dismiss</span>
                </div>
            </div>
            <div className="absolute inset-0 -z-10" onClick={() => setShowCommandPalette(false)} />
        </div>
    );
}
