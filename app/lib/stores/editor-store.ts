import { create } from 'zustand';

export interface EditorState {
    activeFile: string | null;
    openFiles: string[];
    fileContents: Record<string, string>;

    openFile: (path: string, content: string) => void;
    closeFile: (path: string) => void;
    setActiveFile: (path: string) => void;
    updateFileContent: (path: string, content: string) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
    activeFile: null,
    openFiles: [],
    fileContents: {},

    openFile: (path, content) =>
        set((state) => {
            const isOpen = state.openFiles.includes(path);
            return {
                activeFile: path,
                openFiles: isOpen ? state.openFiles : [...state.openFiles, path],
                fileContents: { ...state.fileContents, [path]: content },
            };
        }),

    closeFile: (path) =>
        set((state) => {
            const newOpenFiles = state.openFiles.filter((f) => f !== path);
            const newActive = state.activeFile === path
                ? (newOpenFiles.length > 0 ? newOpenFiles[newOpenFiles.length - 1] : null)
                : state.activeFile;
            // Clean up content if desired, or keep for cache
            return {
                openFiles: newOpenFiles,
                activeFile: newActive
            };
        }),

    setActiveFile: (path) => set({ activeFile: path }),

    updateFileContent: (path, content) =>
        set((state) => ({
            fileContents: { ...state.fileContents, [path]: content },
        })),
}));
