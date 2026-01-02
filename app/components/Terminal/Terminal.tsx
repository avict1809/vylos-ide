'use client';

import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { useConfigStore } from '@/app/lib/stores/config-store';
import 'xterm/css/xterm.css';

export default function Terminal() {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<XTerm | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const { terminalFontSize } = useConfigStore();

    useEffect(() => {
        if (!terminalRef.current || xtermRef.current) return;

        const term = new XTerm({
            cursorBlink: true,
            theme: {
                background: '#09090b',
                foreground: '#ffffff',
                cursor: '#10b981',
                black: '#000000',
                red: '#ef4444',
                green: '#10b981',
                yellow: '#f59e0b',
                blue: '#3b82f6',
                magenta: '#8b5cf6',
                cyan: '#06b6d4',
                white: '#ffffff',
            },
            fontFamily: "'Geist Mono', monospace",
            fontSize: terminalFontSize,
            allowProposedApi: true
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);
        fitAddon.fit();

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;

        // Initialize IPC Terminal
        if (window.electron) {
            (window as any).electron.terminal.create();

            const cleanup = (window as any).electron.terminal.onData((data: string) => {
                term.write(data);
            });

            term.onData((data) => {
                (window as any).electron.terminal.write(data);
            });

            term.onResize(({ cols, rows }) => {
                (window as any).electron.terminal.resize(cols, rows);
            });

            return () => {
                cleanup();
                term.dispose();
                xtermRef.current = null;
            };
        }
    }, []);

    // Reactive Font Size Update
    useEffect(() => {
        if (xtermRef.current) {
            xtermRef.current.options.fontSize = terminalFontSize;
            fitAddonRef.current?.fit();
        }
    }, [terminalFontSize]);

    useEffect(() => {
        const handleResize = () => {
            fitAddonRef.current?.fit();
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return (
        <div className="h-full w-full bg-[#09090b] p-2 overflow-hidden">
            <div ref={terminalRef} className="h-full w-full" />
        </div>
    );
}
