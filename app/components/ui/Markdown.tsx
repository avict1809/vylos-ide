'use client';

import { Fragment, useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/app/lib/utils';

/**
 * The Markdown AI answers use: headings, paragraphs, lists, quotes, fenced
 * code, `inline code`, **bold**, *italic* and links. Builds React elements
 * directly, never HTML, so model output can't inject markup.
 */

type Block =
    | { kind: 'code'; lang: string; text: string }
    | { kind: 'heading'; level: number; text: string }
    | { kind: 'list'; ordered: boolean; items: string[] }
    | { kind: 'quote'; text: string }
    | { kind: 'para'; text: string };

export function parseBlocks(source: string): Block[] {
    const lines = source.replace(/\r\n?/g, '\n').split('\n');
    const blocks: Block[] = [];
    let para: string[] = [];
    const flush = () => {
        if (para.length) blocks.push({ kind: 'para', text: para.join('\n') });
        para = [];
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const fence = line.match(/^\s*```\s*([\w+#.-]*)\s*$/);
        if (fence) {
            flush();
            const code: string[] = [];
            for (i++; i < lines.length && !/^\s*```\s*$/.test(lines[i]); i++) code.push(lines[i]);
            blocks.push({ kind: 'code', lang: fence[1], text: code.join('\n') });
            continue;
        }
        const heading = line.match(/^(#{1,4})\s+(.*)$/);
        if (heading) {
            flush();
            blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] });
            continue;
        }
        const item = line.match(/^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/);
        if (item) {
            flush();
            const ordered = !!item[2];
            const last = blocks[blocks.length - 1];
            if (last?.kind === 'list' && last.ordered === ordered) last.items.push(item[3]);
            else blocks.push({ kind: 'list', ordered, items: [item[3]] });
            continue;
        }
        const quote = line.match(/^>\s?(.*)$/);
        if (quote) {
            flush();
            const last = blocks[blocks.length - 1];
            if (last?.kind === 'quote') last.text += `\n${quote[1]}`;
            else blocks.push({ kind: 'quote', text: quote[1] });
            continue;
        }
        if (!line.trim()) flush();
        else if (/^\s{2,}\S/.test(line) && blocks[blocks.length - 1]?.kind === 'list' && para.length === 0) {
            // A wrapped list item
            const list = blocks[blocks.length - 1] as Extract<Block, { kind: 'list' }>;
            list.items[list.items.length - 1] += ` ${line.trim()}`;
        } else para.push(line);
    }
    flush();
    return blocks;
}

/** `code`, **bold**, *italic*, _italic_ and [links](https://…). */
function inline(text: string, key = 0): ReactNode[] {
    const out: ReactNode[] = [];
    const pattern = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*|_[^_\n]+_)|(\[[^\]\n]+\]\((https?:\/\/[^)\s]+)\))/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text))) {
        if (m.index > last) out.push(<Fragment key={`${key}-${last}`}>{text.slice(last, m.index)}</Fragment>);
        const k = `${key}-${m.index}`;
        if (m[1]) {
            out.push(<code key={k} className="px-1 py-px rounded bg-black/40 border border-[#27272a] text-[var(--vylos-green-accent)] font-mono text-[0.9em] break-words">{m[1].slice(1, -1)}</code>);
        } else if (m[2]) {
            out.push(<strong key={k} className="font-semibold text-gray-100">{inline(m[2].slice(2, -2), m.index)}</strong>);
        } else if (m[3]) {
            out.push(<em key={k}>{m[3].slice(1, -1)}</em>);
        } else if (m[4]) {
            const label = m[4].slice(1, m[4].indexOf(']'));
            const url = m[5];
            out.push(
                // Opens in the system browser (the main process routes window.open there)
                <a key={k} href={url} onClick={(e) => { e.preventDefault(); window.open(url); }} className="text-[var(--vylos-green-accent)] underline underline-offset-2 hover:text-[var(--vylos-green)]">
                    {label}
                </a>
            );
        }
        last = m.index + m[0].length;
    }
    if (last < text.length) out.push(<Fragment key={`${key}-${last}`}>{text.slice(last)}</Fragment>);
    return out;
}

function CodeBlock({ lang, text }: { lang: string; text: string }) {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            /* clipboard unavailable */
        }
    };
    return (
        <div className="group relative my-2 rounded-lg border border-[#27272a] bg-black overflow-hidden">
            <div className="flex items-center justify-between px-2.5 py-1 border-b border-[#1f1f22] text-[9px] font-mono uppercase tracking-wider text-gray-600">
                <span>{lang || 'code'}</span>
                <button onClick={copy} title="Copy" className="flex items-center gap-1 text-gray-500 hover:text-gray-200 transition-colors">
                    {copied ? <Check size={10} /> : <Copy size={10} />} {copied ? 'Copied' : 'Copy'}
                </button>
            </div>
            <pre className="p-2.5 overflow-x-auto font-mono text-[11px] leading-relaxed text-gray-200"><code>{text}</code></pre>
        </div>
    );
}

export default function Markdown({ text, className }: { text: string; className?: string }) {
    return (
        <div className={cn('space-y-2 break-words', className)}>
            {parseBlocks(text).map((block, i) => {
                switch (block.kind) {
                    case 'code':
                        return <CodeBlock key={i} lang={block.lang} text={block.text} />;
                    case 'heading':
                        return (
                            <p key={i} className={cn('font-bold text-gray-100', block.level <= 2 ? 'text-[13px] pt-1' : 'text-[12px]')}>
                                {inline(block.text, i)}
                            </p>
                        );
                    case 'list': {
                        const List = block.ordered ? 'ol' : 'ul';
                        return (
                            <List key={i} className={cn('pl-5 space-y-1', block.ordered ? 'list-decimal' : 'list-disc', 'marker:text-gray-600')}>
                                {block.items.map((item, j) => <li key={j}>{inline(item, j)}</li>)}
                            </List>
                        );
                    }
                    case 'quote':
                        return <blockquote key={i} className="border-l-2 border-[#3f3f46] pl-3 text-gray-400">{inline(block.text, i)}</blockquote>;
                    default:
                        return <p key={i} className="whitespace-pre-wrap">{inline(block.text, i)}</p>;
                }
            })}
        </div>
    );
}
