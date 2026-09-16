import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useTerminalStore } from './stores/terminal-store';

const MAX_RECENT_FILES = 20;
const MAX_RECENT_FOLDERS = 10;

interface FileNode {
    name: string;
    isDirectory: boolean;
    path: string;
    children?: FileNode[];
    isExpanded?: boolean;
}

export interface FileTab extends FileNode {
    content: string;
    originalContent: string;
    isDirty: boolean;
    // The editor group showing this tab, as a cell in the grid of groups:
    // `column` counts from the left, `row` from the top of that column. Both are
    // packed to 0..n-1 after every change, so a group closes with its last tab.
    column: number;
    row: number;
    // Bumped whenever the tab is focused. The highest in a group is the tab that
    // group shows — per-group selection without a second index to keep in sync.
    activatedAt: number;
}

// Open editors as saved between launches (paths only; content is re-read from disk)
interface WorkspaceSession {
    // Editor groups, each with its place in the grid and the tab it was showing.
    // A group without a column/row is one written before groups could stack.
    groups?: { column?: number; row?: number; files: string[]; activePath: string | null }[];
    // Written before editor groups existed: one group's worth of paths
    files?: string[];
    activePath: string | null;
}

const isUntitled = (path: string) => path.startsWith('untitled-');
const baseName = (path: string) => path.split(/[\\/]/).pop() || 'Untitled';

// True when path is target itself or anything inside it
const isInside = (path: string, target: string) =>
    path === target || path.startsWith(target + '/') || path.startsWith(target + '\\');

// Rewrite a path after its file (or an ancestor folder) moved from `from` to `to`
const retarget = (path: string, from: string, to: string) =>
    isInside(path, from) ? to + path.slice(from.length) : path;

// Most recent first, without duplicates
const pushRecent = (list: string[], path: string, max: number) =>
    [path, ...list.filter(p => p !== path)].slice(0, max);

/** How many editor groups can be open at once, counting every cell of the grid. */
export const MAX_EDITOR_GROUPS = 4;

/**
 * One editor group's place in the layout: groups sit in columns across the
 * editor area, and stack in rows inside their column. A half-step number asks
 * for a new column or row in that position — `packGroups` turns it into a real
 * one, so `{ column: 0.5, row: 0 }` means "a new column between 0 and 1".
 */
export interface EditorCell {
    column: number;
    row: number;
}

export const sameCell = (a: EditorCell, b: EditorCell) => a.column === b.column && a.row === b.row;
const cellOf = (tab: FileTab): EditorCell => ({ column: tab.column, row: tab.row });
const inCell = (tab: FileTab, cell: EditorCell) => tab.column === cell.column && tab.row === cell.row;

// Focus order for tabs. Only the relative values matter, so it isn't persisted.
let activationSeq = 0;
const nextActivation = () => ++activationSeq;

/** The columns of groups, left to right. */
export const editorColumns = (files: FileTab[]): number[] =>
    [...new Set(files.map(f => f.column))].sort((a, b) => a - b);

/** The rows of groups stacked in one column, top to bottom. */
export const editorRows = (files: FileTab[], column: number): number[] =>
    [...new Set(files.filter(f => f.column === column).map(f => f.row))].sort((a, b) => a - b);

/** Every open group, in reading order. */
export const editorCells = (files: FileTab[]): EditorCell[] =>
    editorColumns(files).flatMap(column => editorRows(files, column).map(row => ({ column, row })));

/** The tab a group shows: whichever of its tabs was focused last. */
export const visibleTab = (files: FileTab[], cell: EditorCell): FileTab | null =>
    files.reduce<FileTab | null>(
        (best, f) => (inCell(f, cell) && (!best || f.activatedAt > best.activatedAt) ? f : best), null);

/** Where a file opens when no group is named: the group holding the focused tab. */
const focusedCell = (files: FileTab[], activeFileIndex: number | null): EditorCell => {
    const tab = activeFileIndex !== null ? files[activeFileIndex] : undefined;
    return tab ? cellOf(tab) : { column: 0, row: 0 };
};

/**
 * Renumbers columns and rows to 0..n-1: emptied groups disappear, and the
 * half-step numbers that ask for a new column or row become real ones.
 */
const packGroups = (files: FileTab[]): FileTab[] => {
    const columns = editorColumns(files);
    return files.map(f => {
        const column = columns.indexOf(f.column);
        const row = editorRows(files, f.column).indexOf(f.row);
        return column === f.column && row === f.row ? f : { ...f, column, row };
    });
};

/** Holds a drop target inside the group limit; past it, the nearest group takes the tab. */
const withinGroupLimit = (files: FileTab[], cell: EditorCell): EditorCell => {
    const cells = editorCells(files);
    if (cells.some(c => sameCell(c, cell)) || cells.length < MAX_EDITOR_GROUPS) return cell;

    const distance = (c: EditorCell) => Math.abs(c.column - cell.column) + Math.abs(c.row - cell.row);
    return cells.reduce((best, c) => (distance(c) < distance(best) ? c : best), cells[0]);
};

/** Puts `path` in `cell`, before `beforePath` or else last in that group. */
const placeTab = (files: FileTab[], path: string, cell: EditorCell, beforePath?: string): FileTab[] => {
    const moving = files.find(f => f.path === path);
    if (!moving) return files;

    const rest = files.filter(f => f.path !== path);
    const placed: FileTab = { ...moving, ...cell, activatedAt: nextActivation() };
    const before = beforePath ? rest.findIndex(f => f.path === beforePath) : -1;
    if (before !== -1) return [...rest.slice(0, before), placed, ...rest.slice(before)];

    // Tab order within a group follows this array, so append after the group's last tab
    let last = -1;
    rest.forEach((f, i) => { if (inCell(f, cell)) last = i; });
    return last === -1 ? [...rest, placed] : [...rest.slice(0, last + 1), placed, ...rest.slice(last + 1)];
};

/** State after a tab closes: focus stays in its group, and an emptied group closes. */
const closedTabState = (files: FileTab[], activeFileIndex: number | null, path: string): Partial<FileStore> => {
    const index = files.findIndex(f => f.path === path);
    if (index === -1) return {};

    const closing = files[index];
    const activePath = activeFileIndex !== null ? files[activeFileIndex]?.path : null;
    const remaining = packGroups(files.filter(f => f.path !== path));
    if (remaining.length === 0) return { openFiles: remaining, activeFileIndex: null, fileToClose: null };

    // Focus moves only when the closing tab had it: to its neighbour in the same
    // group, or to the nearest tab anywhere when the group closes with it
    const keep = (activePath && activePath !== path
        ? files[activeFileIndex!]
        : files.slice(0, index).filter(f => inCell(f, cellOf(closing))).pop()
        ?? files.slice(index + 1).find(f => inCell(f, cellOf(closing)))
        ?? files[index - 1] ?? files[index + 1])?.path;

    const openFiles = remaining.map(f => (f.path === keep ? { ...f, activatedAt: nextActivation() } : f));
    const active = openFiles.findIndex(f => f.path === keep);
    return { openFiles, activeFileIndex: active === -1 ? 0 : active, fileToClose: null };
};

const snapshotSession = ({ openFiles, activeFileIndex }: Pick<FileStore, 'openFiles' | 'activeFileIndex'>): WorkspaceSession => ({
    groups: editorCells(openFiles)
        .map(cell => {
            const files = openFiles.filter(f => inCell(f, cell) && !isUntitled(f.path)).map(f => f.path);
            const visible = visibleTab(openFiles, cell)?.path;
            return { ...cell, files, activePath: visible && files.includes(visible) ? visible : files.at(-1) ?? null };
        })
        .filter(g => g.files.length > 0),
    activePath: activeFileIndex !== null ? openFiles[activeFileIndex]?.path ?? null : null,
});

// After a rename/move, point open tabs, recents, expanded folders and the selection at the new path
const movedState = (state: FileStore, from: string, to: string): Partial<FileStore> => {
    const move = <T extends { path: string; name: string }>(item: T): T => {
        const path = retarget(item.path, from, to);
        return path === item.path ? item : { ...item, path, name: baseName(path) };
    };
    return {
        openFiles: state.openFiles.map(move),
        recentFiles: state.recentFiles.map(p => retarget(p, from, to)),
        expandedPaths: new Set([...state.expandedPaths].map(p => retarget(p, from, to))),
        selectedNode: state.selectedNode && move(state.selectedNode),
    };
};

let restoringSession: Promise<void> | null = null;

interface FileStore {
    openFiles: FileTab[];
    activeFileIndex: number | null;
    isReading: boolean;
    activeView: 'explorer' | 'search' | 'ai' | 'settings' | 'learning' | 'git' | 'account' | 'tutor' | 'extensions';
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
    // Explorer cut/copy (a file or folder waiting to be pasted)
    explorerClipboard: { path: string; cut: boolean } | null;

    // Actions
    restoreSession: () => Promise<void>;
    setExplorerClipboard: (clipboard: { path: string; cut: boolean } | null) => void;
    pasteInto: (destDir: string) => Promise<string | null>;
    moveInto: (srcPath: string, destDir: string) => Promise<string | null>;
    collapseAll: () => void;
    openTerminalAt: (dir: string) => void;
    openFolderPath: (dirPath: string) => void;
    openLaunchPaths: (requests: CliOpenRequest[]) => Promise<void>;
    clearRecent: () => void;
    setFileTree: (tree: FileNode[]) => void;
    setSelectedNode: (node: FileNode | null) => void;
    togglePathExpansion: (path: string) => void;
    refreshFileTree: () => Promise<void>;
    watchProjectRoot: () => void;
    createFile: (dirPath: string, fileName: string) => Promise<boolean>;
    createFolder: (dirPath: string, folderName: string) => Promise<boolean>;
    deletePath: (path: string, permanent?: boolean) => Promise<boolean>;
    renamePath: (oldPath: string, newPath: string) => Promise<boolean>;
    openFile: (file: FileNode, content: string, searchMetadata?: { query: string; line?: number }, cell?: EditorCell) => void;
    openFileByPath: (path: string, cell?: EditorCell) => Promise<void>;
    openExternalFile: () => Promise<void>;
    openFolder: () => Promise<void>;
    createNewFile: () => void;
    closeFile: (path: string) => void;
    /** Closes a tab whose edits the learner chose not to keep (the save prompt). */
    discardAndCloseFile: (path: string) => void;
    setFileToClose: (file: FileTab | null) => void;
    setActiveIndex: (index: number | null) => void;
    /** Drops a tab into another editor group, before `beforePath` or last in it. */
    moveTabToGroup: (path: string, cell: EditorCell, beforePath?: string) => void;
    /** Moves the focused tab into a new group beside ('right') or under ('down') its own. */
    moveEditorToNewGroup: (direction?: 'right' | 'down') => void;
    updateActiveContent: (content: string) => void;
    updateFileContent: (path: string, content: string) => void;
    saveActiveFile: () => Promise<void>;
    saveFile: (path: string) => Promise<void>;
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
    explorerClipboard: null,

    setExplorerClipboard: (clipboard) => set({ explorerClipboard: clipboard }),

    pasteInto: async (destDir) => {
        const electron = (window as any).electron;
        const { explorerClipboard } = get();
        if (!electron || !explorerClipboard) return null;

        const { path: src, cut } = explorerClipboard;
        if (cut) {
            const target = await get().moveInto(src, destDir);
            // A cut item can only be pasted once
            if (target) set({ explorerClipboard: null });
            return target;
        }

        const target: string | null = await electron.fs.pasteInto(src, destDir, false);
        if (target) get().refreshFileTree();
        return target;
    },

    // Move a file/folder into destDir (cut+paste, drag and drop); open tabs follow it
    moveInto: async (srcPath, destDir) => {
        const electron = (window as any).electron;
        if (!electron) return null;
        const target: string | null = await electron.fs.pasteInto(srcPath, destDir, true);
        if (!target) return null;
        set(state => movedState(state, srcPath, target));
        get().refreshFileTree();
        return target;
    },

    collapseAll: () => set({ expandedPaths: new Set<string>() }),

    openTerminalAt: (dir) => {
        set({ showTerminal: true });
        void useTerminalStore.getState().newShell(dir);
    },

    restoreSession: () => {
        const electron = (window as any).electron;
        if (get().sessionRestored || !electron) return Promise.resolve();

        restoringSession ??= (async () => {
            // Sessions saved before editor groups existed hold one flat list of paths
            const saved = get().session;
            const groups = saved?.groups ?? (saved?.files ? [{ files: saved.files, activePath: saved.activePath }] : []);
            const paths = groups.flatMap(g => g.files);
            const contents: (string | null)[] = await Promise.all(paths.map(p => electron.fs.read(p)));
            const readByPath = new Map(paths.map((path, i) => [path, contents[i]] as const));

            // Files deleted or moved since the last launch are skipped (and dropped from recents)
            const restored: FileTab[] = [];
            const missing = new Set<string>();
            groups.forEach((g, i) => {
                // Groups saved before they could stack sat in a single row
                const cell = { column: g.column ?? i, row: g.row ?? 0 };
                for (const path of g.files) {
                    const content = readByPath.get(path);
                    if (content == null) {
                        missing.add(path);
                        continue;
                    }
                    restored.push({
                        name: baseName(path), path, isDirectory: false,
                        content, originalContent: content, isDirty: false,
                        ...cell, activatedAt: nextActivation(),
                    });
                }
            });

            // Each group opens on the tab it was showing
            for (const g of groups) {
                const tab = restored.find(f => f.path === g.activePath);
                if (tab) tab.activatedAt = nextActivation();
            }

            // Keep anything the user opened while the session was being read
            const { openFiles, activeFileIndex, recentFiles } = get();
            const merged = packGroups([...restored, ...openFiles.filter(f => !restored.some(r => r.path === f.path))]);
            const activePath = activeFileIndex !== null ? openFiles[activeFileIndex]?.path : saved?.activePath;
            const found = merged.findIndex(f => f.path === activePath);
            const index = found !== -1 ? found : merged.length > 0 ? 0 : null;
            if (index !== null) merged[index] = { ...merged[index], activatedAt: nextActivation() };

            set({
                openFiles: merged,
                activeFileIndex: index,
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

    // Paths from `vylos .` / `vylos app.py` in a terminal
    openLaunchPaths: async (requests) => {
        for (const { path, kind } of requests) {
            if (kind === 'directory') get().openFolderPath(path);
            else if (kind === 'file') await get().openFileByPath(path);
            // A file that doesn't exist yet: an empty editor, written on save
            else get().openFile({ name: baseName(path), path, isDirectory: false }, '');
        }
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
        const { projectRoot } = get();
        const electron = (window as any).electron;
        if (!projectRoot || !electron) return;

        // Re-read every expanded folder too, so changes inside subfolders show up
        const load = async (dir: string): Promise<FileNode[]> => {
            const items: FileNode[] = await electron.fs.list(dir);
            const { expandedPaths } = get();
            return Promise.all(items.map(async (f) => ({
                ...f,
                children: f.isDirectory && expandedPaths.has(f.path) ? await load(f.path) : [],
                isExpanded: false,
            })));
        };

        try {
            set({ fileTree: await load(projectRoot) });
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

    deletePath: async (targetPath, permanent = false) => {
        const electron = (window as any).electron;
        if (!electron) return false;
        const success = await (permanent ? electron.fs.delete(targetPath) : electron.fs.trash(targetPath));
        if (success) {
            // Close editors for what was deleted; unsaved ones stay open so the edits aren't lost
            const { openFiles, activeFileIndex } = get();
            const activePath = activeFileIndex !== null ? openFiles[activeFileIndex]?.path : null;
            const remaining = packGroups(openFiles.filter(f => f.isDirty || !isInside(f.path, targetPath)));
            const index = remaining.findIndex(f => f.path === activePath);
            set(state => ({
                openFiles: remaining,
                activeFileIndex: index !== -1 ? index : remaining.length > 0 ? Math.min(activeFileIndex ?? 0, remaining.length - 1) : null,
                recentFiles: state.recentFiles.filter(p => !isInside(p, targetPath)),
                selectedNode: state.selectedNode && isInside(state.selectedNode.path, targetPath) ? null : state.selectedNode,
                explorerClipboard: state.explorerClipboard && isInside(state.explorerClipboard.path, targetPath) ? null : state.explorerClipboard,
            }));
            get().refreshFileTree();
        }
        return success;
    },

    renamePath: async (oldPath, newPath) => {
        const electron = (window as any).electron;
        if (!electron) return false;
        const success = await electron.fs.rename(oldPath, newPath);
        if (success) {
            set(state => movedState(state, oldPath, newPath));
            get().refreshFileTree();
        }
        return success;
    },

    // `cell` is the editor group to open in (a drop target); it defaults to the
    // group in use, and a half-step column or row asks for a new group there.
    openFile: (file, content, searchMetadata, cell) => {
        const { openFiles, activeFileIndex, recentFiles } = get();
        const existingIndex = openFiles.findIndex(f => f.path === file.path);
        const newRecent = isUntitled(file.path) ? recentFiles : pushRecent(recentFiles, file.path, MAX_RECENT_FILES);

        // Already open: focus it where it is, or move it when another group asked for it
        if (existingIndex !== -1) {
            const tab = openFiles[existingIndex];
            const target = cell !== undefined ? withinGroupLimit(openFiles, cell) : cellOf(tab);
            const files = !sameCell(target, cellOf(tab))
                ? packGroups(placeTab(openFiles, tab.path, target))
                : openFiles.map((f, i) => (i === existingIndex ? { ...f, activatedAt: nextActivation() } : f));

            set({ openFiles: files, activeFileIndex: files.findIndex(f => f.path === file.path), recentFiles: newRecent });
            return;
        }

        const newTab: FileTab = {
            ...file,
            content,
            originalContent: content,
            isDirty: false,
            ...withinGroupLimit(openFiles, cell ?? focusedCell(openFiles, activeFileIndex)),
            activatedAt: nextActivation(),
        };
        const files = packGroups([...openFiles, newTab]);

        set({
            openFiles: files,
            activeFileIndex: files.findIndex(f => f.path === file.path),
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
        const { openFiles, activeFileIndex } = get();
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
            isDirty: true,
            ...focusedCell(openFiles, activeFileIndex),
            activatedAt: nextActivation(),
        };

        set({
            openFiles: [...openFiles, newTab],
            activeFileIndex: openFiles.length
        });
    },

    closeFile: (path) => {
        const { openFiles, activeFileIndex } = get();
        const file = openFiles.find(f => f.path === path);
        if (!file) return;

        if (file.isDirty) {
            set({ fileToClose: file });
            return;
        }
        set(closedTabState(openFiles, activeFileIndex, path));
    },

    discardAndCloseFile: (path) => {
        const { openFiles, activeFileIndex } = get();
        set(closedTabState(openFiles, activeFileIndex, path));
    },

    setFileToClose: (file) => set({ fileToClose: file }),

    setActiveIndex: (index) => {
        if (index === null) {
            set({ activeFileIndex: null });
            return;
        }
        set(state => ({
            activeFileIndex: index,
            openFiles: state.openFiles.map((f, i) => (i === index ? { ...f, activatedAt: nextActivation() } : f)),
        }));
    },

    moveTabToGroup: (path, cell, beforePath) => {
        const { openFiles } = get();
        const tab = openFiles.find(f => f.path === path);
        if (!tab) return;

        const target = withinGroupLimit(openFiles, cell);
        // Dropped back where it came from: just focus it
        if (sameCell(target, cellOf(tab)) && !beforePath) {
            get().setActiveIndex(openFiles.indexOf(tab));
            return;
        }

        const files = packGroups(placeTab(openFiles, path, target, beforePath));
        set({ openFiles: files, activeFileIndex: files.findIndex(f => f.path === path) });
    },

    moveEditorToNewGroup: (direction = 'right') => {
        const { openFiles, activeFileIndex } = get();
        if (activeFileIndex === null) return;

        const tab = openFiles[activeFileIndex];
        // A group with one tab would only swap places with the new one
        if (openFiles.filter(f => inCell(f, cellOf(tab))).length < 2) return;
        get().moveTabToGroup(tab.path, direction === 'down'
            ? { column: tab.column, row: tab.row + 0.5 }
            : { column: tab.column + 0.5, row: 0 });
    },

    updateActiveContent: (content) => {
        const { openFiles, activeFileIndex } = get();
        if (activeFileIndex === null) return;
        get().updateFileContent(openFiles[activeFileIndex].path, content);
    },

    // Edits go to the tab that made them, which need not be the focused one
    updateFileContent: (path, content) => set(state => ({
        openFiles: state.openFiles.map(f =>
            f.path === path ? { ...f, content, isDirty: content !== f.originalContent } : f),
    })),

    saveActiveFile: async () => {
        const { openFiles, activeFileIndex } = get();
        if (activeFileIndex === null) return;

        const tab = openFiles[activeFileIndex];
        // A virtual untitled file needs somewhere to go first
        return isUntitled(tab.path) ? get().saveActiveFileAs() : get().saveFile(tab.path);
    },

    saveFile: async (path) => {
        const electron = (window as any).electron;
        const tab = get().openFiles.find(f => f.path === path);
        // Untitled files are only saved through the Save As dialog
        if (!electron || !tab || !tab.isDirty || isUntitled(tab.path)) return;

        const written = tab.content;
        if (!await electron.fs.write(tab.path, written)) return;
        set(state => ({
            openFiles: state.openFiles.map(f =>
                // Anything typed while the write was in flight keeps the tab dirty
                f.path === path ? { ...f, originalContent: written, isDirty: f.content !== written } : f),
        }));
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

    openFileByPath: async (filePath, cell) => {
        const { openFiles, openFile } = get();
        const open = openFiles.find(f => f.path === filePath);
        if (open) {
            openFile(open, open.content, undefined, cell);
            return;
        }

        const content = await (window as any).electron?.fs.read(filePath);
        if (content == null) {
            // Deleted or unreadable: stop offering it as a recent file
            set(state => ({ recentFiles: state.recentFiles.filter(p => p !== filePath) }));
            return;
        }
        openFile({ name: baseName(filePath), path: filePath, isDirectory: false }, content, undefined, cell);
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
