'use client';

import { ChevronRight, ChevronDown, File, Folder } from 'lucide-react';
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

const FileItem = ({ item, depth = 0, onToggle }: { item: FileNode; depth?: number; onToggle: (item: FileNode) => void }) => {
    const setActiveFile = useFileStore(state => state.setActiveFile);

    const handleClick = () => {
        if (item.isDirectory) {
            onToggle(item);
        } else {
            setActiveFile(item);
        }
    };

    return (
        <div>
            <div
                className={cn(
                    "flex items-center py-1 px-2 hover:bg-[var(--vylos-grey-medium)] cursor-pointer text-sm",
                    "text-[var(--vylos-text-primary)]"
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
                    {item.isDirectory ? <Folder size={14} className="text-[var(--vylos-text-secondary)]" /> : <File size={14} className="text-[var(--vylos-text-secondary)]" />}
                </span>
                <span className="truncate">{item.name}</span>
            </div>
            {item.isExpanded && item.children && (
                <div>
                    {item.children.map((child) => (
                        <FileItem key={child.path} item={child} depth={depth + 1} onToggle={onToggle} />
                    ))}
                </div>
            )}
        </div>
    );
};

export default function FileExplorer() {
    const [files, setFiles] = useState<FileNode[]>([]);
    const [rootPath, setRootPath] = useState<string>('');

    useEffect(() => {
        const init = async () => {
            if (typeof window !== 'undefined' && window.electron) {
                try {
                    const docsPath = await window.electron.getPath('documents');
                    setRootPath(docsPath);
                    const initialFiles = await window.electron.fs.list(docsPath);
                    setFiles(initialFiles.map(f => ({ ...f, children: [], isExpanded: false })));
                } catch (error) {
                    console.error("Failed to load files", error);
                }
            }
        };
        init();
    }, []);

    const handleToggle = async (node: FileNode) => {
        if (!node.isDirectory) return;

        // If closing, just toggle state
        if (node.isExpanded) {
            updateFileNode(node.path, { isExpanded: false });
            return;
        }

        // If opening, fetch children if needed (or just toggle if already loaded?) 
        // For now, let's always reload or check if children are empty. 
        // A robust app might cache, but re-fetching ensures freshness.
        try {
            const children = await window.electron.fs.list(node.path);
            const childNodes = children.map(f => ({ ...f, children: [], isExpanded: false }));
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

    return (
        <div className="h-full bg-[var(--vylos-grey-dark)] border-r border-[var(--vylos-grey-border)] flex flex-col">
            <div className="p-2 text-xs font-bold text-[var(--vylos-text-secondary)] uppercase tracking-wider flex justify-between items-center">
                <span>Explorer</span>
                <span className="text-[10px] opacity-50 truncate max-w-[100px]" title={rootPath}>
                    {rootPath.split('\\').pop() || rootPath}
                </span>
            </div>
            <div className="flex-1 overflow-y-auto">
                {files.map(item => (
                    <FileItem key={item.path} item={item} onToggle={handleToggle} />
                ))}
            </div>
        </div>
    );
}
