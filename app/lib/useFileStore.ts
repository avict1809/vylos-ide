import { create } from 'zustand';

interface FileNode {
    name: string;
    isDirectory: boolean;
    path: string;
    children?: FileNode[];
    isExpanded?: boolean;
}

interface FileTab extends FileNode {
    content: string;
    originalContent: string;
    isDirty: boolean;
}

interface FileStore {
    openFiles: FileTab[];
    activeFileIndex: number | null;
    isReading: boolean;
    activeView: 'explorer' | 'search' | 'ai' | 'settings' | 'learning' | 'git' | 'account';
    projectRoot: string | null;
    fileToClose: FileTab | null;
    showTerminal: boolean;
    showQuickOpen: boolean;
    showAbout: boolean;
    monacoAction: string | null;
    searchMetadata: { query: string; line?: number } | null;

    // Actions
    openFile: (file: FileNode, content: string, searchMetadata?: { query: string; line?: number }) => void;
    openFileByPath: (path: string) => Promise<void>;
    openExternalFile: () => Promise<void>;
    openFolder: () => Promise<void>;
    createNewFile: () => void;
    closeFile: (path: string) => void;
    setFileToClose: (file: FileTab | null) => void;
    setActiveIndex: (index: number | null) => void;
    updateActiveContent: (content: string) => void;
    saveActiveFile: () => Promise<void>;
    saveActiveFileAs: () => Promise<void>;
    setActiveView: (view: 'explorer' | 'search' | 'ai' | 'settings' | 'learning' | 'git' | 'account') => void;
    toggleTerminal: () => void;
    setShowQuickOpen: (show: boolean) => void;
    setShowAbout: (show: boolean) => void;
    setMonacoAction: (action: string | null) => void;
    clearSearchMetadata: () => void;
}

export const useFileStore = create<FileStore>((set, get) => ({
    openFiles: [],
    activeFileIndex: null,
    isReading: false,
    activeView: 'learning',
    projectRoot: null,
    fileToClose: null,
    showTerminal: false,
    showQuickOpen: false,
    showAbout: false,
    monacoAction: null,
    searchMetadata: null,

    openFile: (file, content, searchMetadata) => {
        const { openFiles } = get();
        const existingIndex = openFiles.findIndex(f => f.path === file.path);

        if (existingIndex !== -1) {
            set({ activeFileIndex: existingIndex });
            return;
        }

        const newTab: FileTab = {
            ...file,
            content,
            originalContent: content,
            isDirty: false
        };

        set({
            openFiles: [...openFiles, newTab],
            activeFileIndex: openFiles.length,
            searchMetadata: searchMetadata || null
        });
    },

    openExternalFile: async () => {
        const electron = (window as any).electron;
        if (!electron) return;
        const filePath = await electron.dialog.openFile();
        if (!filePath) return;

        const content = await electron.fs.read(filePath);
        const name = filePath.split(/[\\/]/).pop() || 'untitled';

        get().openFile({ name, path: filePath, isDirectory: false }, content || '');
    },

    openFolder: async () => {
        const electron = (window as any).electron;
        if (!electron) return;
        const dirPath = await electron.dialog.openDirectory();
        if (dirPath) {
            set({ projectRoot: dirPath, activeView: 'explorer' });
        }
    },

    createNewFile: () => {
        const { openFiles } = get();
        const untitledPaths = openFiles.filter(f => f.path.startsWith('untitled-')).map(f => f.path);
        let nextNum = 1;
        while (untitledPaths.includes(`untitled-${nextNum}`)) nextNum++;

        const path = `untitled-${nextNum}`;
        const newTab: FileTab = {
            name: `Untitled-${nextNum}`,
            path,
            isDirectory: false,
            content: '',
            originalContent: '',
            isDirty: true
        };

        set({
            openFiles: [...openFiles, newTab],
            activeFileIndex: openFiles.length
        });
    },

    closeFile: (path) => {
        const { openFiles, activeFileIndex } = get();
        const index = openFiles.findIndex(f => f.path === path);
        if (index === -1) return;

        const file = openFiles[index];
        if (file.isDirty) {
            set({ fileToClose: file });
            return;
        }

        const newFiles = openFiles.filter(f => f.path !== path);
        let newIndex = activeFileIndex;

        if (newFiles.length === 0) {
            newIndex = null;
        } else if (activeFileIndex === index) {
            newIndex = Math.max(0, index - 1);
        } else if (activeFileIndex !== null && activeFileIndex > index) {
            newIndex = activeFileIndex - 1;
        }

        set({ openFiles: newFiles, activeFileIndex: newIndex });
    },

    setFileToClose: (file) => set({ fileToClose: file }),

    setActiveIndex: (index) => set({ activeFileIndex: index }),

    updateActiveContent: (content) => {
        const { openFiles, activeFileIndex } = get();
        if (activeFileIndex === null) return;

        const newFiles = [...openFiles];
        const tab = newFiles[activeFileIndex];
        tab.content = content;
        tab.isDirty = content !== tab.originalContent;

        set({ openFiles: newFiles });
    },

    saveActiveFile: async () => {
        const { openFiles, activeFileIndex } = get();
        const electron = (window as any).electron;
        if (activeFileIndex === null || !electron) return;

        const tab = openFiles[activeFileIndex];

        // If it's a virtual untitled file, use "Save As" logic
        if (tab.path.startsWith('untitled-')) {
            return get().saveActiveFileAs();
        }

        if (!tab.isDirty) return;

        const success = await electron.fs.write(tab.path, tab.content);
        if (success) {
            const newFiles = [...openFiles];
            newFiles[activeFileIndex] = {
                ...tab,
                originalContent: tab.content,
                isDirty: false
            };
            set({ openFiles: newFiles });
        }
    },

    saveActiveFileAs: async () => {
        const { openFiles, activeFileIndex } = get();
        if (activeFileIndex === null || !(window as any).electron) return;

        const tab = openFiles[activeFileIndex];
        const newPath = await (window as any).electron.dialog.saveFile(tab.content, tab.path.startsWith('untitled') ? undefined : tab.path);

        if (newPath) {
            const newName = newPath.split(/[\\/]/).pop() || tab.name;
            const newFiles = [...openFiles];
            newFiles[activeFileIndex] = {
                ...tab,
                name: newName,
                path: newPath,
                originalContent: tab.content,
                isDirty: false
            };
            set({ openFiles: newFiles });
        }
    },

    setActiveView: (view) => set({ activeView: view }),

    toggleTerminal: () => set((state) => ({ showTerminal: !state.showTerminal })),

    setShowQuickOpen: (show) => set({ showQuickOpen: show }),

    openFileByPath: async (filePath) => {
        const { openFiles, openFile } = get();
        const existingIndex = openFiles.findIndex(f => f.path === filePath);
        if (existingIndex !== -1) {
            set({ activeFileIndex: existingIndex });
            return;
        }

        const content = await (window as any).electron?.fs.read(filePath);
        if (content !== null) {
            const name = filePath.split(/[\\/]/).pop() || 'Untitled';
            openFile({ name, path: filePath, isDirectory: false }, content);
        }
    },

    setShowAbout: (show) => set({ showAbout: show }),

    setMonacoAction: (action) => set({ monacoAction: action }),

    clearSearchMetadata: () => set({ searchMetadata: null }),
}));
