'use client';

import { ChevronRight, ChevronDown, File, Folder, RefreshCw, FilePlus, FolderPlus, Trash2, X, Check } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { cn } from '@/app/lib/utils';
import { useFileStore } from '@/app/lib/useFileStore';

interface FileNode {
    name: string;
    path: string;
    isDirectory: boolean;
    children?: FileNode[];
    isExpanded?: boolean;
}

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
    expandedPaths
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
}) => {
    const { openFile } = useFileStore();
    const isActive = item.path === activePath;
    const isSelected = selectedNode?.path === item.path;
    const isExpanded = expandedPaths.has(item.path);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isSelected && creationType && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isSelected, creationType]);

    const handleClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        onSelect(item);
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

    return (
        <div className="group/file">
            <div
                className={cn(
                    "flex items-center py-1.5 px-3 hover:bg-[#050505] cursor-pointer text-sm group/item transition-all",
                    isActive ? "bg-[var(--vylos-green-dark)]/10 border-l-2 border-[var(--vylos-green)] text-[var(--vylos-green)]" :
                        isSelected ? "bg-white/5 text-white" : "text-gray-400 hover:text-gray-200"
                )}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
                onClick={handleClick}
            >
                <span className="mr-1">
                    {item.isDirectory && (
                        isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                    )}
                    {!item.isDirectory && <File size={14} className="opacity-0" />}
                </span>
                <span className="mr-2">
                    {item.isDirectory ? <Folder size={14} className={cn("text-[var(--vylos-text-secondary)]", isActive && "text-[var(--vylos-green)]")} /> : <File size={14} className={cn("text-[var(--vylos-text-secondary)]", isActive && "text-[var(--vylos-green)]")} />}
                </span>
                <span className="truncate font-medium flex-1">{item.name}</span>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete(item.path);
                    }}
                    className="opacity-0 group-hover/file:opacity-100 p-1 hover:text-red-500 transition-all"
                >
                    <Trash2 size={12} />
                </button>
            </div>
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
                        <FileItem
                            key={child.path}
                            item={child}
                            depth={depth + 1}
                            onToggle={onToggle}
                            activePath={activePath}
                            onDelete={onDelete}
                            selectedNode={selectedNode}
                            onSelect={onSelect}
                            creationType={creationType}
                            inputValue={inputValue}
                            onInputChange={onInputChange}
                            onSubmitCreation={onSubmitCreation}
                            onCancelCreation={onCancelCreation}
                            expandedPaths={expandedPaths}
                        />
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
        createFile, createFolder, deletePath, selectedNode, setSelectedNode,
        expandedPaths, togglePathExpansion
    } = useFileStore();

    const [loading, setLoading] = useState(false);
    const [creationType, setCreationType] = useState<'file' | 'folder' | null>(null);
    const [inputValue, setInputValue] = useState('');
    const [pathToDelete, setPathToDelete] = useState<string | null>(null);
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

    const confirmDelete = async () => {
        if (pathToDelete) {
            await deletePath(pathToDelete);
            setPathToDelete(null);
        }
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
                        onClick={() => setCreationType('file')}
                        className="p-1.5 hover:bg-[#1a1a1a] rounded-lg transition-all text-gray-500 hover:text-[var(--vylos-green)]"
                        title="New File"
                    >
                        <FilePlus size={14} />
                    </button>
                    <button
                        onClick={() => setCreationType('folder')}
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
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-1 pt-2 custom-scrollbar">
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
                    />
                ))}
            </div>

            {/* Deletion Modal */}
            {pathToDelete && (
                <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-[#09090b] border border-[#1a1a1a] rounded-2xl p-6 w-full max-w-[280px] shadow-2xl animate-in zoom-in duration-200">
                        <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mb-4 mx-auto">
                            <Trash2 size={24} className="text-red-500" />
                        </div>
                        <h4 className="text-sm font-bold text-center text-white mb-2 uppercase tracking-widest">Delete Path?</h4>
                        <p className="text-[11px] text-center text-gray-500 leading-relaxed mb-6">
                            Are you sure you want to permanently delete: <br />
                            <span className="text-gray-300 font-mono break-all mt-1 block px-2 italic">
                                {pathToDelete.split(/[\\/]/).pop()}
                            </span>
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPathToDelete(null)}
                                className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-gray-400 text-[10px] font-bold rounded-lg transition-all uppercase tracking-widest"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-black text-[10px] font-black rounded-lg transition-all uppercase tracking-widest"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
