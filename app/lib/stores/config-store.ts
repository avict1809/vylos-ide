'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ConfigStore {
    theme: 'dark' | 'light';
    fontSize: number;
    autoSave: boolean;
    voiceTutorEnabled: boolean;

    setTheme: (theme: 'dark' | 'light') => void;
    setFontSize: (size: number) => void;
    setAutoSave: (enabled: boolean) => void;
    setVoiceTutorEnabled: (enabled: boolean) => void;
}

export const useConfigStore = create<ConfigStore>()(
    persist(
        (set) => ({
            theme: 'dark',
            fontSize: 14,
            autoSave: false,
            voiceTutorEnabled: true,

            setTheme: (theme) => set({ theme }),
            setFontSize: (fontSize) => set({ fontSize }),
            setAutoSave: (autoSave) => set({ autoSave }),
            setVoiceTutorEnabled: (voiceTutorEnabled) => set({ voiceTutorEnabled }),
        }),
        {
            name: 'vylos-config',
        }
    )
);
