'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ConfigStore {
    theme: 'dark' | 'light';
    fontSize: number;
    terminalFontSize: number;
    autoSave: boolean;
    minimapEnabled: boolean;
    lineNumbers: 'on' | 'off';
    wordWrap: 'on' | 'off';

    setTheme: (theme: 'dark' | 'light') => void;
    setFontSize: (size: number) => void;
    setTerminalFontSize: (size: number) => void;
    setAutoSave: (enabled: boolean) => void;
    setMinimapEnabled: (enabled: boolean) => void;
    setLineNumbers: (value: 'on' | 'off') => void;
    setWordWrap: (value: 'on' | 'off') => void;
}

export const useConfigStore = create<ConfigStore>()(
    persist(
        (set) => ({
            theme: 'dark',
            fontSize: 14,
            terminalFontSize: 12,
            autoSave: false,
            minimapEnabled: true,
            lineNumbers: 'on',
            wordWrap: 'on',

            setTheme: (theme) => set({ theme }),
            setFontSize: (fontSize) => set({ fontSize }),
            setTerminalFontSize: (terminalFontSize) => set({ terminalFontSize }),
            setAutoSave: (autoSave) => set({ autoSave }),
            setMinimapEnabled: (minimapEnabled) => set({ minimapEnabled }),
            setLineNumbers: (lineNumbers) => set({ lineNumbers }),
            setWordWrap: (wordWrap) => set({ wordWrap }),
        }),
        {
            name: 'vylos-config',
        }
    )
);
