'use client';

import { ChevronRight, ChevronDown, File, Folder, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/app/lib/utils';
import { useFileStore } from '@/app/lib/useFileStore';

interface FileNode {
    name: string;
    path: string;
    isDirectory: boolean;
    children?: FileNode[];
    isExpanded?: boolean;
}

const FileItem = ({ item, depth = 0, onToggle, activePath }: { item: FileNode; depth?: number; onToggle: (item: FileNode) => void; activePath: string | null }) => {
    const { openFile } = useFileStore();
    const isActive = item.path === activePath;

    const handleClick = async () => {
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
        <div>
            <div
                className={cn(
                    "flex items-center py-1.5 px-3 hover:bg-[#050505] cursor-pointer text-sm group/item transition-all",
                    isActive ? "bg-[var(--vylos-green-dark)]/10 border-l-2 border-[var(--vylos-green)] text-[var(--vylos-green)]" : "text-gray-400 hover:text-gray-200"
                )}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
                onClick={handleClick}
            >
                <span className="mr-1">
                    {item.isDirectory && (
                        item.isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                    )}
                    {!item.isDirectory && <File size={14} className="opacity-0" />}
                </span>
                <span className="mr-2">
                    {item.isDirectory ? <Folder size={14} className={cn("text-[var(--vylos-text-secondary)]", isActive && "text-[var(--vylos-green)]")} /> : <File size={14} className={cn("text-[var(--vylos-text-secondary)]", isActive && "text-[var(--vylos-green)]")} />}
                </span>
                <span className="truncate font-medium">{item.name}</span>
            </div>
            {item.isExpanded && item.children && (
                <div>
                    {item.children.map((child) => (
                        <FileItem key={child.path} item={child} depth={depth + 1} onToggle={onToggle} activePath={activePath} />
                    ))}
                </div>
            )}
        </div>
    );
};

export function FileExplorer() {
    const { projectRoot, openFiles, activeFileIndex, openFolder } = useFileStore();
    const [files, setFiles] = useState<FileNode[]>([]);
    const [path, setPath] = useState<string | null>(projectRoot);
    const [loading, setLoading] = useState(false);

    const activeFile = activeFileIndex !== null ? openFiles[activeFileIndex] : null;
    const activePath = activeFile ? activeFile.path : null;

    useEffect(() => {
        setPath(projectRoot);
    }, [projectRoot]);

    useEffect(() => {
        if (!path || !window.electron) {
            setFiles([]);
            return;
        }
        const loadFiles = async () => {
            setLoading(true);
            try {
                const items = await (window as any).electron.fs.list(path);
                setFiles(items.map((f: any) => ({ ...f, children: [], isExpanded: false })));
            } catch (error) {
                console.error("Failed to load files", error);
                setFiles([]);
            } finally {
                setLoading(false);
            }
        };
        loadFiles();
    }, [path]);

    const handleToggle = async (node: FileNode) => {
        if (!node.isDirectory) return;

        if (node.isExpanded) {
            updateFileNode(node.path, { isExpanded: false });
            return;
        }

        try {
            const children = await (window as any).electron.fs.list(node.path);
            const childNodes = children.map((f: any) => ({ ...f, children: [], isExpanded: false }));
            updateFileNode(node.path, { isExpanded: true, children: childNodes });
        } catch (error) {
            console.error("Failed to read directory", error);
        }
    };

    const updateFileNode = (path: string, updates: Partial<FileNode>) => {
        setFiles(prev => {
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
            return updateRecursive(prev);
        });
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
        <div className="h-full flex flex-col bg-[#000000]">
            <div className="p-4 flex items-center justify-between border-b border-[#1a1a1a] bg-gradient-to-br from-[#050505] to-black">
                <span className="text-[10px] text-white font-black uppercase tracking-[0.2em] opacity-40 truncate" title={path || ''}>
                    {path?.split(/[\\/]/).pop() || path}
                </span>
                <button
                    onClick={() => {
                        if (path) {
                            const currentPath = path;
                            setPath(null);
                            setTimeout(() => setPath(currentPath), 10);
                        }
                    }}
                    className={cn(
                        "p-1.5 hover:bg-[#1a1a1a] rounded-lg transition-all text-gray-500 hover:text-[var(--vylos-green)]",
                        loading && "animate-spin"
                    )}
                    title="Refresh Explorer"
                >
                    <RefreshCw size={14} />
                </button>
            </div>
            <div className="flex-1 overflow-y-auto px-1 pt-2 custom-scrollbar">
                {files.map(item => (
                    <FileItem key={item.path} item={item} onToggle={handleToggle} activePath={activePath} />
                ))}
            </div>
        </div>
    );
}
