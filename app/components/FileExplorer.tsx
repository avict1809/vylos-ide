'use client';

import { ChevronRight, ChevronDown, File, Folder, RefreshCw, FilePlus, FolderPlus, Trash2, FolderOpen, Scissors, Copy, ClipboardPaste, Link, Pencil, SquareTerminal, ChevronsDownUp } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/app/lib/utils';
import { useFileStore } from '@/app/lib/useFileStore';
import { fileIconUrl, folderIconUrl } from '@/app/lib/file-icons';
import { FILE_DRAG, PATH_DRAG } from '@/app/lib/dnd';
import ContextMenu, { type ContextMenuItem } from './ContextMenu';

interface FileNode {
    name: string;
    path: string;
    isDirectory: boolean;
    children?: FileNode[];
    isExpanded?: boolean;
}

interface DragProps {
    // Folder currently highlighted as the drop target
    targetDir: string | null;
    onDragOver: (e: React.DragEvent, node: FileNode | null) => void;
    onDrop: (e: React.DragEvent, node: FileNode | null) => void;
}

interface RenameProps {
    path: string | null;
    value: string;
    error: string | null;
    onChange: (val: string) => void;
    onSubmit: (fromBlur?: boolean) => void;
    onCancel: () => void;
}

const baseName = (p: string) => p.split(/[\\/]/).pop() || p;
const parentOf = (p: string) => p.slice(0, Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')));
const separatorOf = (p: string) => (p.includes('\\') && !p.includes('/') ? '\\' : '/');

// What "show in the system file manager" is called on this OS (VS Code's wording)
const revealLabel = () => {
    const platform = typeof navigator !== 'undefined' ? navigator.platform : '';
    if (/Win/.test(platform)) return 'Reveal in File Explorer';
    if (/Mac/.test(platform)) return 'Reveal in Finder';
    return 'Open Containing Folder';
};

const FileItem = ({
    item,
    depth = 0,
    onToggle,
    activePath,
    onDelete,
    selectedNode,
    onSelect,
    creationType,
    inputValue,
    onInputChange,
    onSubmitCreation,
    onCancelCreation,
    expandedPaths,
    onContextMenu,
    rename,
    cutPath,
    drag
}: {
    item: FileNode;
    depth?: number;
    onToggle: (item: FileNode) => void;
    activePath: string | null;
    onDelete: (path: string) => void;
    selectedNode: FileNode | null;
    onSelect: (node: FileNode) => void;
    creationType: 'file' | 'folder' | null;
    inputValue: string;
    onInputChange: (val: string) => void;
    onSubmitCreation: () => void;
    onCancelCreation: () => void;
    expandedPaths: Set<string>;
    onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
    rename: RenameProps;
    cutPath: string | null;
    drag: DragProps;
}) => {
    const { openFile } = useFileStore();
    const isActive = item.path === activePath;
    const isSelected = selectedNode?.path === item.path;
    const isExpanded = expandedPaths.has(item.path);
    const isRenaming = rename.path === item.path;
    const inputRef = useRef<HTMLInputElement>(null);
    const renameRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isSelected && creationType && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isSelected, creationType]);

    // Like VS Code: focus the rename box with the name (minus extension) selected
    useEffect(() => {
        const input = renameRef.current;
        if (!isRenaming || !input) return;
        input.focus();
        const dot = item.isDirectory ? -1 : item.name.lastIndexOf('.');
        input.setSelectionRange(0, dot > 0 ? dot : item.name.length);
    }, [isRenaming, item.isDirectory, item.name]);

    const handleClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        onSelect(item);
        if (isRenaming) return;
        if (item.isDirectory) {
            onToggle(item);
        } else {
            if (window.electron) {
                try {
                    const content = await (window as any).electron.fs.read(item.path);
                    openFile(item, content || "");
                } catch (e) {
                    console.error("Failed to open file", e);
                }
            }
        }
    };

    const childProps = { onToggle, activePath, onDelete, selectedNode, onSelect, creationType, inputValue, onInputChange, onSubmitCreation, onCancelCreation, expandedPaths, onContextMenu, rename, cutPath, drag };
    const iconUrl = item.isDirectory ? folderIconUrl(item.name, isExpanded) : fileIconUrl(item.name);

    return (
        <div className={cn("group/file", item.isDirectory && drag.targetDir === item.path && "bg-[var(--vylos-green-dark)]/15 outline outline-1 -outline-offset-1 outline-[var(--vylos-green)]/40")}>
            <div
                className={cn(
                    "flex items-center py-1.5 px-3 hover:bg-[#050505] cursor-pointer text-sm group/item transition-all",
                    isActive ? "bg-[var(--vylos-green-dark)]/10 border-l-2 border-[var(--vylos-green)] text-[var(--vylos-green)]" :
                        isSelected ? "bg-white/5 text-white" : "text-gray-400 hover:text-gray-200",
                    cutPath === item.path && "opacity-50"
                )}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
                onClick={handleClick}
                onContextMenu={(e) => onContextMenu(e, item)}
                draggable={!isRenaming}
                onDragStart={(e) => {
                    e.dataTransfer.setData(PATH_DRAG, item.path);
                    // Files can also be dropped on an editor group, which opens them there
                    if (!item.isDirectory) e.dataTransfer.setData(FILE_DRAG, item.path);
                    e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => drag.onDragOver(e, item)}
                onDrop={(e) => drag.onDrop(e, item)}
            >
                <span className="mr-1">
                    {item.isDirectory && (
                        isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                    )}
                    {!item.isDirectory && <File size={14} className="opacity-0" />}
                </span>
                <span className="mr-2 shrink-0">
                    {iconUrl ? (
                        <img src={iconUrl} alt="" width={16} height={16} draggable={false} className="w-4 h-4" />
                    ) : item.isDirectory ? (
                        <Folder size={14} className={cn("text-[var(--vylos-text-secondary)]", isActive && "text-[var(--vylos-green)]")} />
                    ) : (
                        <File size={14} className={cn("text-[var(--vylos-text-secondary)]", isActive && "text-[var(--vylos-green)]")} />
                    )}
                </span>
                {isRenaming ? (
                    <input
                        ref={renameRef}
                        value={rename.value}
                        onChange={(e) => rename.onChange(e.target.value)}
                        onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') rename.onSubmit();
                            if (e.key === 'Escape') rename.onCancel();
                        }}
                        onBlur={() => rename.onSubmit(true)}
                        onClick={(e) => e.stopPropagation()}
                        className={cn(
                            "bg-[#09090b] border rounded px-1.5 py-0 text-sm text-white outline-none w-full min-w-0",
                            rename.error ? "border-red-500/70" : "border-[var(--vylos-green)]/40"
                        )}
                        spellCheck={false}
                    />
                ) : (
                    <span className="truncate font-medium flex-1">{item.name}</span>
                )}
                {!isRenaming && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(item.path);
                        }}
                        className="opacity-0 group-hover/file:opacity-100 p-1 hover:text-red-500 transition-all"
                    >
                        <Trash2 size={12} />
                    </button>
                )}
            </div>
            {isRenaming && rename.error && (
                <div className="text-[10px] text-red-400 py-0.5" style={{ paddingLeft: `${depth * 12 + 44}px` }}>
                    {rename.error}
                </div>
            )}
            {isExpanded && isSelected && creationType && (
                <div
                    className="flex items-center py-1.5 px-3 bg-[#050505] gap-2"
                    style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
                >
                    {creationType === 'file' ? <File size={14} className="text-[var(--vylos-green)]" /> : <Folder size={14} className="text-[var(--vylos-green)]" />}
                    <input
                        ref={inputRef}
                        value={inputValue}
                        onChange={(e) => onInputChange(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') onSubmitCreation();
                            if (e.key === 'Escape') onCancelCreation();
                        }}
                        onBlur={() => {
                            if (!inputValue) onCancelCreation();
                        }}
                        className="bg-[#09090b] border border-[var(--vylos-green)]/30 rounded px-2 py-0.5 text-xs text-white outline-none w-full"
                        placeholder={creationType === 'file' ? 'filename.ext' : 'folder-name'}
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
            {isExpanded && item.children && (
                <div>
                    {item.children.map((child) => (
                        <FileItem key={child.path} item={child} depth={depth + 1} {...childProps} />
                    ))}
                </div>
            )}
        </div>
    );
};

export function FileExplorer() {
    const {
        projectRoot, openFiles, activeFileIndex, openFolder,
        fileTree, refreshFileTree, setFileTree, watchProjectRoot,
        createFile, createFolder, deletePath, renamePath, selectedNode, setSelectedNode,
        expandedPaths, togglePathExpansion,
        explorerClipboard, setExplorerClipboard, pasteInto, moveInto,
        collapseAll, openTerminalAt
    } = useFileStore();

    const [loading, setLoading] = useState(false);
    const [creationType, setCreationType] = useState<'file' | 'folder' | null>(null);
    const [inputValue, setInputValue] = useState('');
    // Delete dialog: moves to the Trash unless `permanent` (Shift+Delete, or Trash unavailable)
    const [toDelete, setToDelete] = useState<{ path: string; permanent: boolean; trashFailed?: boolean } | null>(null);
    const [dropDir, setDropDir] = useState<string | null>(null);
    const [menu, setMenu] = useState<{ x: number; y: number; node: FileNode | null } | null>(null);
    const [renaming, setRenaming] = useState<{ path: string; value: string; error: string | null } | null>(null);
    const renameBusy = useRef(false);
    const rootInputRef = useRef<HTMLInputElement>(null);

    const activeFile = activeFileIndex !== null ? openFiles[activeFileIndex] : null;
    const activePath = activeFile ? activeFile.path : null;

    useEffect(() => {
        if (projectRoot) {
            refreshFileTree();
            watchProjectRoot();
        }
    }, [projectRoot]);

    useEffect(() => {
        if (creationType && !selectedNode && rootInputRef.current) {
            rootInputRef.current.focus();
        }
    }, [creationType, selectedNode]);

    const closeMenu = useCallback(() => setMenu(null), []);

    const handleToggle = async (node: FileNode) => {
        if (!node.isDirectory) return;

        const isExpanding = !expandedPaths.has(node.path);
        togglePathExpansion(node.path);

        if (isExpanding) {
            try {
                const children = await (window as any).electron.fs.list(node.path);
                const childNodes = children.map((f: any) => ({ ...f, children: [], isExpanded: false }));
                updateFileNode(node.path, { children: childNodes });
            } catch (error) {
                console.error("Failed to read directory", error);
            }
        }
    };

    const updateFileNode = (path: string, updates: Partial<FileNode>) => {
        const updateRecursive = (nodes: FileNode[]): FileNode[] => {
            return nodes.map(n => {
                if (n.path === path) {
                    return { ...n, ...updates };
                }
                if (n.children && n.children.length > 0) {
                    return { ...n, children: updateRecursive(n.children) };
                }
                return n;
            });
        };
        setFileTree(updateRecursive(fileTree));
    };

    const getCreationParent = () => {
        if (!selectedNode) return projectRoot;
        if (selectedNode.isDirectory) return selectedNode.path;
        const parts = selectedNode.path.split(/[\\/]/);
        parts.pop();
        return parts.join('/');
    };

    // The folder that new items and pastes go into: the folder itself, or a file's parent
    const folderFor = (node: FileNode | null) =>
        !node ? projectRoot! : node.isDirectory ? node.path : parentOf(node.path);

    const startCreation = async (type: 'file' | 'folder', node: FileNode | null) => {
        const dir = folderFor(node);
        const folder = dir === projectRoot ? null : findNodeByPath(fileTree, dir);
        setSelectedNode(folder);
        // The inline input renders under an expanded folder
        if (folder && !expandedPaths.has(folder.path)) await handleToggle(folder);
        setInputValue('');
        setCreationType(type);
    };

    const handleSubmitCreation = async () => {
        if (!inputValue.trim()) {
            setCreationType(null);
            return;
        }

        const parent = getCreationParent();
        if (!parent) return;

        let success = false;
        if (creationType === 'file') {
            success = await createFile(parent, inputValue);
        } else {
            success = await createFolder(parent, inputValue);
        }

        if (success) {
            setInputValue('');
            setCreationType(null);
            // Ensure parent is expanded to show new item
            if (parent !== projectRoot && !expandedPaths.has(parent)) {
                // We need to fetch children if it was never expanded
                const node = findNodeByPath(fileTree, parent);
                if (node) handleToggle(node);
            } else {
                refreshFileTree();
            }
        }
    };

    const findNodeByPath = (nodes: FileNode[], path: string): FileNode | null => {
        for (const node of nodes) {
            if (node.path === path) return node;
            if (node.children) {
                const found = findNodeByPath(node.children, path);
                if (found) return found;
            }
        }
        return null;
    };

    const setPathToDelete = (path: string | null, permanent = false) =>
        setToDelete(path ? { path, permanent } : null);

    const confirmDelete = async () => {
        if (!toDelete) return;
        const ok = await deletePath(toDelete.path, toDelete.permanent);
        // Some systems have no Trash: offer a permanent delete instead, like VS Code
        if (!ok && !toDelete.permanent) setToDelete({ path: toDelete.path, permanent: true, trashFailed: true });
        else setToDelete(null);
    };

    // Drag and drop: drop onto a folder (or a file, meaning its folder, or empty space = root)
    const dragProps: DragProps = {
        targetDir: dropDir,
        onDragOver: (e, node) => {
            if (!e.dataTransfer.types.includes(PATH_DRAG)) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            const dir = folderFor(node);
            if (dir !== dropDir) setDropDir(dir);
        },
        onDrop: async (e, node) => {
            const src = e.dataTransfer.getData(PATH_DRAG);
            e.preventDefault();
            e.stopPropagation();
            setDropDir(null);
            const dir = folderFor(node);
            if (!src || dir === parentOf(src)) return;
            if (await moveInto(src, dir)) {
                if (dir !== projectRoot && !expandedPaths.has(dir)) togglePathExpansion(dir);
                await refreshFileTree();
            }
        },
    };

    const startRename = (node: FileNode) => {
        setCreationType(null);
        setSelectedNode(node);
        setRenaming({ path: node.path, value: node.name, error: null });
    };

    const submitRename = async (fromBlur = false) => {
        if (!renaming || renameBusy.current) return;
        const name = renaming.value.trim();
        if (!name || name === baseName(renaming.path)) {
            setRenaming(null);
            return;
        }

        const invalid = /[\\/]/.test(name) ? 'A name can\'t contain / or \\' : null;
        renameBusy.current = true;
        const ok = !invalid && await renamePath(renaming.path, parentOf(renaming.path) + separatorOf(renaming.path) + name);
        renameBusy.current = false;

        // Clicking away from a name that can't be used just cancels, like VS Code
        if (ok || fromBlur) setRenaming(null);
        else setRenaming({ ...renaming, error: invalid ?? `"${name}" already exists here, or it can't be renamed` });
    };

    const paste = async (node: FileNode | null) => {
        const dir = folderFor(node);
        const target = await pasteInto(dir);
        if (!target) return;
        // Open the destination folder so the pasted item is visible
        if (dir !== projectRoot && !expandedPaths.has(dir)) togglePathExpansion(dir);
        await refreshFileTree();
    };

    const relativePath = (path: string) =>
        projectRoot && path.startsWith(projectRoot) ? path.slice(projectRoot.length + 1) : path;

    const openMenu = (e: React.MouseEvent, node: FileNode | null) => {
        e.preventDefault();
        e.stopPropagation();
        if (node) setSelectedNode(node);
        setMenu({ x: e.clientX, y: e.clientY, node });
    };

    const menuItems = (node: FileNode | null): ContextMenuItem[] => {
        const path = node?.path ?? projectRoot!;
        const isFolder = !node || node.isDirectory;
        const items: ContextMenuItem[] = [];

        if (isFolder) {
            items.push(
                { label: 'New File...', icon: FilePlus, onClick: () => startCreation('file', node) },
                { label: 'New Folder...', icon: FolderPlus, onClick: () => startCreation('folder', node) },
                { separator: true },
            );
        }
        items.push(
            { label: revealLabel(), icon: FolderOpen, onClick: () => window.electron?.shell?.showItemInFolder(path) },
            { label: 'Open in Integrated Terminal', icon: SquareTerminal, onClick: () => openTerminalAt(folderFor(node)) },
            { separator: true },
        );
        if (node) {
            items.push(
                { label: 'Cut', icon: Scissors, shortcut: 'Ctrl+X', onClick: () => setExplorerClipboard({ path, cut: true }) },
                { label: 'Copy', icon: Copy, shortcut: 'Ctrl+C', onClick: () => setExplorerClipboard({ path, cut: false }) },
            );
        }
        if (isFolder) {
            items.push({ label: 'Paste', icon: ClipboardPaste, shortcut: 'Ctrl+V', disabled: !explorerClipboard, onClick: () => paste(node) });
        }
        items.push(
            { separator: true },
            { label: 'Copy Path', icon: Link, onClick: () => navigator.clipboard.writeText(path) },
        );
        if (node) {
            items.push(
                { label: 'Copy Relative Path', onClick: () => navigator.clipboard.writeText(relativePath(path)) },
                { separator: true },
                { label: 'Rename...', icon: Pencil, shortcut: 'F2', onClick: () => startRename(node) },
                { label: 'Delete', icon: Trash2, shortcut: 'Delete', danger: true, onClick: () => setPathToDelete(path) },
                { label: 'Delete Permanently', shortcut: 'Shift+Del', danger: true, onClick: () => setPathToDelete(path, true) },
            );
        }
        return items;
    };

    // Explorer shortcuts, active while the tree has focus
    const handleTreeKeyDown = (e: React.KeyboardEvent) => {
        if ((e.target as HTMLElement).tagName === 'INPUT') return;
        const mod = e.ctrlKey || e.metaKey;
        const key = e.key.toLowerCase();
        const node = selectedNode;

        if (e.key === 'F2' && node) startRename(node);
        else if (e.key === 'Delete' && node) setPathToDelete(node.path, e.shiftKey);
        else if (mod && key === 'x' && node) setExplorerClipboard({ path: node.path, cut: true });
        else if (mod && key === 'c' && node) setExplorerClipboard({ path: node.path, cut: false });
        else if (mod && key === 'v' && explorerClipboard) paste(node);
        else return;
        e.preventDefault();
    };

    const renameProps: RenameProps = {
        path: renaming?.path ?? null,
        value: renaming?.value ?? '',
        error: renaming?.error ?? null,
        onChange: (value) => setRenaming(r => r && { ...r, value, error: null }),
        onSubmit: submitRename,
        onCancel: () => setRenaming(null),
    };

    if (!projectRoot) {
        return (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center">
                <div className="w-12 h-12 bg-[var(--vylos-grey-medium)] rounded-full flex items-center justify-center mb-4 text-[var(--vylos-text-secondary)]">
                    <Folder size={24} />
                </div>
                <h3 className="text-sm font-bold text-white mb-2 uppercase tracking-widest">No Folder Opened</h3>
                <p className="text-xs text-gray-400 mb-6 leading-relaxed">
                    Open a folder to see your project files and start coding.
                </p>
                <button
                    onClick={() => openFolder()}
                    className="px-4 py-2 bg-[var(--vylos-green-dark)] hover:bg-[var(--vylos-green)] text-[var(--vylos-black)] text-xs font-bold rounded transition-colors uppercase tracking-wider"
                >
                    Open Folder
                </button>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-[#000000] relative">
            <div className="p-4 flex items-center justify-between border-b border-[#1a1a1a] bg-gradient-to-br from-[#050505] to-black">
                <span className="text-[10px] text-white font-black uppercase tracking-[0.2em] opacity-40 truncate" title={projectRoot || ''}>
                    {projectRoot?.split(/[\\/]/).pop() || projectRoot}
                </span>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => startCreation('file', selectedNode)}
                        className="p-1.5 hover:bg-[#1a1a1a] rounded-lg transition-all text-gray-500 hover:text-[var(--vylos-green)]"
                        title="New File"
                    >
                        <FilePlus size={14} />
                    </button>
                    <button
                        onClick={() => startCreation('folder', selectedNode)}
                        className="p-1.5 hover:bg-[#1a1a1a] rounded-lg transition-all text-gray-500 hover:text-[var(--vylos-green)]"
                        title="New Folder"
                    >
                        <FolderPlus size={14} />
                    </button>
                    <button
                        onClick={() => refreshFileTree()}
                        className={cn(
                            "p-1.5 hover:bg-[#1a1a1a] rounded-lg transition-all text-gray-500 hover:text-[var(--vylos-green)]",
                            loading && "animate-spin"
                        )}
                        title="Refresh Explorer"
                    >
                        <RefreshCw size={14} />
                    </button>
                    <button
                        onClick={() => collapseAll()}
                        className="p-1.5 hover:bg-[#1a1a1a] rounded-lg transition-all text-gray-500 hover:text-[var(--vylos-green)]"
                        title="Collapse Folders"
                    >
                        <ChevronsDownUp size={14} />
                    </button>
                </div>
            </div>

            <div
                className={cn(
                    "flex-1 overflow-y-auto px-1 pt-2 custom-scrollbar outline-none",
                    dropDir === projectRoot && "bg-[var(--vylos-green-dark)]/10"
                )}
                tabIndex={0}
                onKeyDown={handleTreeKeyDown}
                onContextMenu={(e) => openMenu(e, null)}
                onDragOver={(e) => dragProps.onDragOver(e, null)}
                onDrop={(e) => dragProps.onDrop(e, null)}
                onDragLeave={(e) => {
                    // Only when the pointer leaves the explorer, not when moving between rows
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropDir(null);
                }}
                onDragEnd={() => setDropDir(null)}
            >
                {/* Creation Input at top level if no selection or selection is root */}
                {creationType && (!selectedNode || selectedNode.path === projectRoot) && (
                    <div className="px-3 py-2 flex items-center gap-2 animate-in slide-in-from-left duration-200">
                        {creationType === 'file' ? <File size={14} className="text-[var(--vylos-green)]" /> : <Folder size={14} className="text-[var(--vylos-green)]" />}
                        <input
                            ref={rootInputRef}
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSubmitCreation();
                                if (e.key === 'Escape') setCreationType(null);
                            }}
                            onBlur={() => {
                                if (!inputValue) setCreationType(null);
                            }}
                            className="bg-[#09090b] border border-[var(--vylos-green)]/30 rounded px-2 py-0.5 text-xs text-white outline-none w-full"
                            placeholder={creationType === 'file' ? 'filename.ext' : 'folder-name'}
                        />
                    </div>
                )}

                {fileTree.map(item => (
                    <FileItem
                        key={item.path}
                        item={item}
                        onToggle={handleToggle}
                        activePath={activePath}
                        onDelete={(path) => setPathToDelete(path)}
                        selectedNode={selectedNode}
                        onSelect={setSelectedNode}
                        creationType={creationType}
                        inputValue={inputValue}
                        onInputChange={setInputValue}
                        onSubmitCreation={handleSubmitCreation}
                        onCancelCreation={() => setCreationType(null)}
                        expandedPaths={expandedPaths}
                        onContextMenu={openMenu}
                        rename={renameProps}
                        cutPath={explorerClipboard?.cut ? explorerClipboard.path : null}
                        drag={dragProps}
                    />
                ))}
            </div>

            {menu && (
                <ContextMenu x={menu.x} y={menu.y} onClose={closeMenu} actions={menuItems(menu.node)} />
            )}

            {/* Deletion Modal: Enter confirms (the button is focused), Esc cancels */}
            {toDelete && (
                <div
                    className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
                    onKeyDown={(e) => { if (e.key === 'Escape') setToDelete(null); }}
                >
                    <div className="bg-[#09090b] border border-[#1a1a1a] rounded-2xl p-6 w-full max-w-[280px] shadow-2xl animate-in zoom-in duration-200">
                        <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mb-4 mx-auto">
                            <Trash2 size={24} className="text-red-500" />
                        </div>
                        <h4 className="text-sm font-bold text-center text-white mb-2 uppercase tracking-widest">
                            {toDelete.permanent ? 'Delete Permanently?' : 'Move to Trash?'}
                        </h4>
                        <p className="text-[11px] text-center text-gray-500 leading-relaxed mb-6">
                            {toDelete.trashFailed
                                ? 'It couldn\'t be moved to the Trash. Delete it permanently instead?'
                                : toDelete.permanent
                                    ? 'This can\'t be undone:'
                                    : 'You can restore it from the Trash:'}
                            <br />
                            <span className="text-gray-300 font-mono break-all mt-1 block px-2 italic">
                                {toDelete.path.split(/[\\/]/).pop()}
                            </span>
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setToDelete(null)}
                                className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-gray-400 text-[10px] font-bold rounded-lg transition-all uppercase tracking-widest"
                            >
                                Cancel
                            </button>
                            <button
                                key={toDelete.permanent ? 'permanent' : 'trash'}
                                autoFocus
                                onClick={confirmDelete}
                                className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-black text-[10px] font-black rounded-lg transition-all uppercase tracking-widest outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                            >
                                {toDelete.permanent ? 'Delete' : 'Move to Trash'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
