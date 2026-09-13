import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const MAX_RECENT_FILES = 20;
const MAX_RECENT_FOLDERS = 10;

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

// Open editors as saved between launches (paths only; content is re-read from disk)
interface WorkspaceSession {
    files: string[];
    activePath: string | null;
}

const isUntitled = (path: string) => path.startsWith('untitled-');
const baseName = (path: string) => path.split(/[\\/]/).pop() || 'Untitled';

// Most recent first, without duplicates
const pushRecent = (list: string[], path: string, max: number) =>
    [path, ...list.filter(p => p !== path)].slice(0, max);

const snapshotSession = ({ openFiles, activeFileIndex }: Pick<FileStore, 'openFiles' | 'activeFileIndex'>): WorkspaceSession => ({
    files: openFiles.filter(f => !isUntitled(f.path)).map(f => f.path),
    activePath: activeFileIndex !== null ? openFiles[activeFileIndex]?.path ?? null : null,
});

let restoringSession: Promise<void> | null = null;

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
    recentFiles: string[];
    recentFolders: string[];
    // Session loaded from the previous launch; only read by restoreSession
    session: WorkspaceSession | null;
    sessionRestored: boolean;

    // Actions
    restoreSession: () => Promise<void>;
    openFolderPath: (dirPath: string) => void;
    clearRecent: () => void;
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

export const useFileStore = create<FileStore>()(persist((set, get) => ({
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
    recentFiles: [],
    recentFolders: [],
    session: null,
    sessionRestored: false,

    restoreSession: () => {
        const electron = (window as any).electron;
        if (get().sessionRestored || !electron) return Promise.resolve();

        restoringSession ??= (async () => {
            const paths = get().session?.files ?? [];
            const contents: (string | null)[] = await Promise.all(paths.map(p => electron.fs.read(p)));

            // Files deleted or moved since the last launch are skipped (and dropped from recents)
            const restored: FileTab[] = [];
            const missing = new Set<string>();
            paths.forEach((path, i) => {
                const content = contents[i];
                if (content == null) {
                    missing.add(path);
                    return;
                }
                restored.push({ name: baseName(path), path, isDirectory: false, content, originalContent: content, isDirty: false });
            });

            // Keep anything the user opened while the session was being read
            const { openFiles, activeFileIndex, session, recentFiles } = get();
            const merged = [...restored, ...openFiles.filter(f => !restored.some(r => r.path === f.path))];
            const activePath = activeFileIndex !== null ? openFiles[activeFileIndex]?.path : session?.activePath;
            const index = merged.findIndex(f => f.path === activePath);

            set({
                openFiles: merged,
                activeFileIndex: index !== -1 ? index : merged.length > 0 ? 0 : null,
                recentFiles: recentFiles.filter(p => !missing.has(p)),
                sessionRestored: true,
            });
        })();
        return restoringSession;
    },

    openFolderPath: (dirPath) => {
        set(state => ({
            projectRoot: dirPath,
            activeView: 'explorer',
            recentFolders: pushRecent(state.recentFolders, dirPath, MAX_RECENT_FOLDERS),
        }));
        get().refreshFileTree();
        get().watchProjectRoot();
    },

    clearRecent: () => set({ recentFiles: [], recentFolders: [] }),

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
        const { openFiles, recentFiles } = get();
        const existingIndex = openFiles.findIndex(f => f.path === file.path);
        const newRecent = isUntitled(file.path) ? recentFiles : pushRecent(recentFiles, file.path, MAX_RECENT_FILES);

        if (existingIndex !== -1) {
            set({ activeFileIndex: existingIndex, recentFiles: newRecent });
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
            searchMetadata: searchMetadata || null,
            recentFiles: newRecent
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
        if (dirPath) get().openFolderPath(dirPath);
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
            set({ openFiles: newFiles, recentFiles: pushRecent(get().recentFiles, newPath, MAX_RECENT_FILES) });
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
        if (content == null) {
            // Deleted or unreadable: stop offering it as a recent file
            set(state => ({ recentFiles: state.recentFiles.filter(p => p !== filePath) }));
            return;
        }
        openFile({ name: baseName(filePath), path: filePath, isDirectory: false }, content);
    },

    setShowAbout: (show) => set({ showAbout: show }),

    setMonacoAction: (action) => set({ monacoAction: action }),

    clearSearchMetadata: () => set({ searchMetadata: null }),
}), {
    name: 'vylos-workspace',
    partialize: (state) => ({
        projectRoot: state.projectRoot,
        activeView: state.activeView,
        recentFiles: state.recentFiles,
        recentFolders: state.recentFolders,
        // Until the saved tabs are reopened, keep them as-is so an early write can't wipe them
        session: state.sessionRestored ? snapshotSession(state) : state.session,
    }),
}));
