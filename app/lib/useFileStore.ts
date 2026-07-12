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
    activeView: 'explorer' | 'search' | 'ai' | 'settings' | 'learning' | 'git' | 'account' | 'tutor';
    projectRoot: string | null;
    fileToClose: FileTab | null;
    showTerminal: boolean;
    showQuickOpen: boolean;
    showAbout: boolean;
    monacoAction: string | null;
    searchMetadata: { query: string; line?: number } | null;
    fileTree: FileNode[];
    selectedNode: FileNode | null;
    expandedPaths: Set<string>;

    // Actions
    setFileTree: (tree: FileNode[]) => void;
    setSelectedNode: (node: FileNode | null) => void;
    togglePathExpansion: (path: string) => void;
    refreshFileTree: () => Promise<void>;
    watchProjectRoot: () => void;
    createFile: (dirPath: string, fileName: string) => Promise<boolean>;
    createFolder: (dirPath: string, folderName: string) => Promise<boolean>;
    deletePath: (path: string) => Promise<boolean>;
    renamePath: (oldPath: string, newPath: string) => Promise<boolean>;
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
    setActiveView: (view: 'explorer' | 'search' | 'ai' | 'settings' | 'learning' | 'git' | 'account' | 'tutor') => void;
    toggleTerminal: () => void;
    setShowTerminal: (show: boolean) => void;
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
    fileTree: [],
    selectedNode: null,
    expandedPaths: new Set<string>(),

    setFileTree: (tree) => set({ fileTree: tree }),
    setSelectedNode: (node) => set({ selectedNode: node }),

    togglePathExpansion: (path) => {
        const { expandedPaths } = get();
        const newPaths = new Set(expandedPaths);
        if (newPaths.has(path)) {
            newPaths.delete(path);
        } else {
            newPaths.add(path);
        }
        set({ expandedPaths: newPaths });
    },

    refreshFileTree: async () => {
        const { projectRoot, fileTree } = get();
        const electron = (window as any).electron;
        if (!projectRoot || !electron) return;

        try {
            const items = await electron.fs.list(projectRoot);
            const newList = items.map((f: any) => ({ ...f, children: [], isExpanded: false }));

            // Merge with existing tree to preserve expansion states
            const merged = newList.map((newNode: FileNode) => {
                const existing = fileTree.find(n => n.path === newNode.path);
                if (existing) {
                    return { ...newNode, isExpanded: existing.isExpanded, children: existing.children };
                }
                return newNode;
            });

            set({ fileTree: merged });
        } catch (e) {
            console.error("Failed to refresh file tree", e);
        }
    },

    watchProjectRoot: () => {
        const { projectRoot, refreshFileTree } = get();
        const electron = (window as any).electron;
        if (!projectRoot || !electron) return;

        electron.fs.watch(projectRoot);
        electron.fs.onChanged(({ event, path: changedPath }: { event: string; path: string }) => {
            console.log(`FS Change: ${event} on ${changedPath}`);
            // For now, simple full refresh on structure changes
            // A more optimized approach would be to update only the affected branch
            if (['add', 'unlink', 'addDir', 'unlinkDir'].includes(event)) {
                refreshFileTree();
            }
        });
    },

    createFile: async (dirPath, fileName) => {
        const electron = (window as any).electron;
        if (!electron) return false;
        const filePath = `${dirPath}/${fileName}`.replace(/\/+/g, '/');
        const success = await electron.fs.createFile(filePath);
        if (success) {
            // Auto open the new file
            get().openFileByPath(filePath);
        }
        return success;
    },

    createFolder: async (dirPath, folderName) => {
        const electron = (window as any).electron;
        if (!electron) return false;
        const folderPath = `${dirPath}/${folderName}`;
        return await electron.fs.createDirectory(folderPath);
    },

    deletePath: async (targetPath) => {
        const electron = (window as any).electron;
        if (!electron) return false;
        return await electron.fs.delete(targetPath);
    },

    renamePath: async (oldPath, newPath) => {
        const electron = (window as any).electron;
        if (!electron) return false;
        return await electron.fs.rename(oldPath, newPath);
    },

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
            get().refreshFileTree();
            get().watchProjectRoot();
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

    setShowTerminal: (show) => set({ showTerminal: show }),

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
