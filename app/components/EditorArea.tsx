'use client';

import type { ReactNode } from 'react';
import React, { Fragment, useEffect, useState } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { X, Folder, Play, Square, Dumbbell, Loader2 } from 'lucide-react';
import MonacoEditor from './MonacoEditor';
import FileIcon from './ui/FileIcon';
import {
    useFileStore, editorColumns, editorRows, editorCells, visibleTab, sameCell,
    MAX_EDITOR_GROUPS, type EditorCell, type FileTab,
} from '@/app/lib/useFileStore';
import { FILE_DRAG, TAB_DRAG, isEditorDrag } from '@/app/lib/dnd';
import { useTerminalStore } from '@/app/lib/stores/terminal-store';
import { canRun, runActiveFile, stopActiveRun } from '@/app/lib/run/run-file';
import { exerciseKey, useExerciseStore } from '@/app/lib/stores/exercise-store';
import { checkExercise } from '@/app/lib/exercises/session';
import { cn } from '@/app/lib/utils';

const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path;

function RecentEntry({ path, icon, onOpen }: { path: string; icon: ReactNode; onOpen: () => void }) {
    const parts = path.split(/[\\/]/);
    const name = parts.pop();
    return (
        <button onClick={onOpen} title={path} className="w-full flex items-center gap-2 py-1 text-left group">
            <span className="text-gray-500 shrink-0">{icon}</span>
            <span className="text-[var(--vylos-green)] group-hover:underline shrink-0">{name}</span>
            <span className="text-gray-600 text-[12px] truncate">{parts.join('/')}</span>
        </button>
    );
}

/** Runs the active file in the terminal (F5); turns into Stop while that file runs. */
function RunButton({ filePath, fileName }: { filePath: string; fileName: string }) {
    const running = useTerminalStore((s) => s.tabs.some((t) => t.id === 'run' && t.running && t.target === filePath));
    if (!running && !canRun(fileName)) return null;
    return running ? (
        <button
            onClick={stopActiveRun}
            title="Stop the running program"
            className="shrink-0 flex items-center gap-1.5 px-3 h-full text-[11px] font-semibold text-red-400 hover:bg-red-500/10 border-l border-[#27272a] transition-colors"
        >
            <Square size={10} fill="currentColor" /> Stop
        </button>
    ) : (
        <button
            onClick={() => void runActiveFile()}
            title={fileName.toLowerCase().endsWith('.html') || fileName.toLowerCase().endsWith('.htm') ? 'Open in your browser (F5)' : 'Run this file (F5)'}
            className="shrink-0 flex items-center gap-1.5 px-3 h-full text-[11px] font-semibold text-[var(--vylos-green)] hover:bg-[#18181b] border-l border-[#27272a] transition-colors"
        >
            <Play size={11} fill="currentColor" /> Run
        </button>
    );
}

/** Checks the open exercise when the file being edited belongs to it. */
function CheckButton({ filePath }: { filePath: string }) {
    const active = useExerciseStore((s) => s.active);
    const dir = useExerciseStore((s) => (s.active ? s.progress[exerciseKey(s.active)]?.dir : undefined));
    const checking = useExerciseStore((s) => s.checking !== null);
    if (!active || !dir || !(filePath.startsWith(dir + '/') || filePath.startsWith(dir + '\\'))) return null;
    return (
        <button
            onClick={() => {
                useFileStore.getState().setActiveView('learning');
                void checkExercise(active);
            }}
            disabled={checking}
            title="Check this exercise"
            className="shrink-0 flex items-center gap-1.5 px-3 h-full text-[11px] font-semibold text-amber-300 hover:bg-[#18181b] disabled:opacity-60 border-l border-[#27272a] transition-colors"
        >
            {checking ? <Loader2 size={11} className="animate-spin" /> : <Dumbbell size={11} />} Check
        </button>
    );
}

/** Where a drop lands: into this group, or into a new group on one of its sides. */
type DropZone = 'left' | 'right' | 'top' | 'bottom' | 'center';

/** The group a drop in `zone` belongs to; a half-step asks for a new one there. */
const cellForZone = (cell: EditorCell, zone: DropZone): EditorCell => {
    switch (zone) {
        // A new column starts with a single row
        case 'left': return { column: cell.column - 0.5, row: 0 };
        case 'right': return { column: cell.column + 0.5, row: 0 };
        case 'top': return { column: cell.column, row: cell.row - 0.5 };
        case 'bottom': return { column: cell.column, row: cell.row + 0.5 };
        default: return cell;
    }
};

const ZONE_OVERLAY: Record<DropZone, string> = {
    left: "inset-y-0 left-0 w-1/2",
    right: "inset-y-0 right-0 w-1/2",
    top: "inset-x-0 top-0 h-1/2",
    bottom: "inset-x-0 bottom-0 h-1/2",
    center: "inset-0",
};

/**
 * True while a drag the editor accepts is in flight. The drop zones only cover
 * the editor while one is, so they never sit between the learner and Monaco.
 */
function useEditorDragging() {
    const [dragging, setDragging] = useState(false);
    useEffect(() => {
        const start = (e: DragEvent) => {
            if (e.dataTransfer && isEditorDrag(e.dataTransfer.types)) setDragging(true);
        };
        const stop = () => setDragging(false);
        document.addEventListener('dragstart', start);
        document.addEventListener('dragend', stop);
        document.addEventListener('drop', stop);
        return () => {
            document.removeEventListener('dragstart', start);
            document.removeEventListener('dragend', stop);
            document.removeEventListener('drop', stop);
        };
    }, []);
    return dragging;
}

/** Highlights the part of the editor a split would open in, and takes the drop. */
function EditorDropZones({ cell, canSplit, onDrop }: {
    cell: EditorCell;
    canSplit: boolean;
    onDrop: (e: React.DragEvent, cell: EditorCell) => void;
}) {
    const [zone, setZone] = useState<DropZone | null>(null);

    // The quarter nearest an edge splits towards it; the middle opens here
    const zoneAt = (e: React.DragEvent<HTMLDivElement>): DropZone => {
        if (!canSplit) return 'center';
        const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - left) / width;
        const y = (e.clientY - top) / height;
        const toSide = Math.min(x, 1 - x);
        const toTopOrBottom = Math.min(y, 1 - y);
        if (toSide > 0.25 && toTopOrBottom > 0.25) return 'center';
        return toSide <= toTopOrBottom ? (x < 0.5 ? 'left' : 'right') : (y < 0.5 ? 'top' : 'bottom');
    };

    return (
        <div
            data-drop-zones={`${cell.column}-${cell.row}`}
            className="absolute inset-0 z-20"
            onDragOver={(e) => {
                if (!isEditorDrag(e.dataTransfer.types)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setZone(zoneAt(e));
            }}
            onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setZone(null);
            }}
            onDrop={(e) => {
                e.preventDefault();
                setZone(null);
                onDrop(e, cellForZone(cell, zone ?? 'center'));
            }}
        >
            {zone && (
                <div
                    className={cn(
                        "absolute bg-[var(--vylos-green)]/10 border border-[var(--vylos-green)]/60 pointer-events-none transition-all duration-100",
                        ZONE_OVERLAY[zone]
                    )}
                />
            )}
        </div>
    );
}

function EditorTab({ file, index, isActive, isFocusedGroup, nextPath, onDropTab }: {
    file: FileTab;
    /** Index in the store's openFiles, which is what setActiveIndex expects */
    index: number;
    isActive: boolean;
    isFocusedGroup: boolean;
    /** The tab after this one in the group, so a drop on its right half lands there */
    nextPath?: string;
    onDropTab: (e: React.DragEvent, beforePath?: string) => void;
}) {
    const setActiveIndex = useFileStore((s) => s.setActiveIndex);
    const closeFile = useFileStore((s) => s.closeFile);
    const [dropEdge, setDropEdge] = useState<'left' | 'right' | null>(null);

    return (
        <div
            draggable
            onDragStart={(e) => {
                e.dataTransfer.setData(TAB_DRAG, file.path);
                e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
                if (!isEditorDrag(e.dataTransfer.types)) return;
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
                const { left, width } = e.currentTarget.getBoundingClientRect();
                setDropEdge(e.clientX - left < width / 2 ? 'left' : 'right');
            }}
            onDragLeave={() => setDropEdge(null)}
            onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const edge = dropEdge;
                setDropEdge(null);
                // Dropped on itself: nothing to reorder
                if (e.dataTransfer.getData(TAB_DRAG) === file.path) return;
                onDropTab(e, edge === 'left' ? file.path : nextPath);
            }}
            onClick={() => setActiveIndex(index)}
            title={file.path}
            className={cn(
                "group flex items-center min-w-[120px] max-w-[200px] px-3 h-full border-r border-[#27272a] cursor-pointer transition-colors relative",
                isActive
                    ? isFocusedGroup
                        ? "bg-[var(--vylos-black)] text-[var(--vylos-green)]"
                        : "bg-[var(--vylos-black)] text-gray-300"
                    : "bg-[#18181b] text-gray-500 hover:bg-[#1a1a1e] hover:text-gray-300"
            )}
        >
            <FileIcon name={file.name} className="mr-2" />
            <span className="truncate text-[12px] flex-1">{file.name}</span>

            {/* Dirty indicator / Close button */}
            <div className="flex items-center ml-2 w-4">
                {file.isDirty ? (
                    <div className="w-2 h-2 rounded-full bg-[var(--vylos-green)] group-hover:hidden" />
                ) : null}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        closeFile(file.path);
                    }}
                    className={cn(
                        "p-0.5 rounded-sm hover:bg-[#27272a] hover:text-white transition-opacity",
                        "hidden group-hover:flex",
                        isActive && !file.isDirty ? "flex" : ""
                    )}
                >
                    <X size={12} />
                </button>
            </div>

            {dropEdge && (
                <span className={cn("absolute inset-y-0 w-0.5 bg-[var(--vylos-green)]", dropEdge === 'left' ? "left-0" : "right-0")} />
            )}
        </div>
    );
}

/** One editor group: its own tab strip and editor, beside or above the others. */
function EditorGroup({ cell, files, isFocused, dragging, canSplit }: {
    cell: EditorCell;
    files: FileTab[];
    isFocused: boolean;
    dragging: boolean;
    canSplit: boolean;
}) {
    const moveTabToGroup = useFileStore((s) => s.moveTabToGroup);
    const openFileByPath = useFileStore((s) => s.openFileByPath);
    const updateFileContent = useFileStore((s) => s.updateFileContent);

    const tabs = files.filter((f) => f.column === cell.column && f.row === cell.row);
    const active = visibleTab(files, cell);

    // A dropped tab moves here; a dropped explorer file opens here
    const drop = (e: React.DragEvent, target: EditorCell, beforePath?: string) => {
        const tabPath = e.dataTransfer.getData(TAB_DRAG);
        if (tabPath) moveTabToGroup(tabPath, target, beforePath);
        else {
            const filePath = e.dataTransfer.getData(FILE_DRAG);
            if (filePath) void openFileByPath(filePath, target);
        }
    };

    if (!active) return null;

    return (
        <div
            data-editor-group={`${cell.column}-${cell.row}`}
            className="h-full w-full bg-[var(--vylos-grey-dark)] flex flex-col"
            // Clicking into this group's editor makes its tab the active one
            onFocusCapture={() => {
                const { openFiles, activeFileIndex, setActiveIndex } = useFileStore.getState();
                const index = openFiles.findIndex((f) => f.path === active.path);
                if (index !== -1 && index !== activeFileIndex) setActiveIndex(index);
            }}
        >
            {/* Tab Bar */}
            <div className="flex bg-[#0d0d0d] border-b border-[#27272a] h-9">
                <div
                    className="flex flex-1 min-w-0 overflow-x-auto scrollbar-hide"
                    onDragOver={(e) => {
                        if (!isEditorDrag(e.dataTransfer.types)) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(e) => {
                        e.preventDefault();
                        drop(e, cell);
                    }}
                >
                    {tabs.map((file, i) => (
                        <EditorTab
                            key={file.path}
                            file={file}
                            index={files.indexOf(file)}
                            isActive={file.path === active.path}
                            isFocusedGroup={isFocused}
                            nextPath={tabs[i + 1]?.path}
                            onDropTab={(e, beforePath) => drop(e, cell, beforePath)}
                        />
                    ))}
                </div>
                {isFocused && (
                    <>
                        <CheckButton filePath={active.path} />
                        <RunButton filePath={active.path} fileName={active.name} />
                    </>
                )}
            </div>

            {/* Editor Content */}
            <div className="flex-1 overflow-hidden relative">
                <MonacoEditor
                    fileName={active.name}
                    filePath={active.path}
                    value={active.content}
                    onChange={(val) => updateFileContent(active.path, val || "")}
                    key={active.path}
                />
                {dragging && <EditorDropZones cell={cell} canSplit={canSplit} onDrop={drop} />}
            </div>
        </div>
    );
}

/** Shown when nothing is open: shortcuts and the folders and files opened recently. */
function WelcomeScreen() {
    const { recentFolders, recentFiles, openFolderPath, openFileByPath } = useFileStore();
    return (
        <div className="h-full w-full bg-[#1e1e1e] flex flex-col items-center overflow-y-auto select-none">
            <div className="my-auto py-8 w-full flex flex-col items-center">
                <div className="flex flex-col items-center opacity-20">
                    <img src="/logo.svg" alt="Vylos Logo" className="w-64 h-64 grayscale contrast-50" />
                </div>

                <div className="mt-12 space-y-4 max-w-sm w-full px-8">
                    <div className="flex justify-between items-center text-[13px]">
                        <span className="text-gray-500">Go to File</span>
                        <div className="flex gap-1">
                            <kbd className="px-1.5 py-0.5 bg-[#333] rounded text-gray-300 min-w-[20px] text-center border border-[#444] shadow-sm">Ctrl</kbd>
                            <span className="text-gray-600">+</span>
                            <kbd className="px-1.5 py-0.5 bg-[#333] rounded text-gray-300 min-w-[20px] text-center border border-[#444] shadow-sm">P</kbd>
                        </div>
                    </div>

                    <div className="flex justify-between items-center text-[13px]">
                        <span className="text-gray-500">Open Folder</span>
                        <div className="flex gap-1">
                            <kbd className="px-1.5 py-0.5 bg-[#333] rounded text-gray-300 min-w-[20px] text-center border border-[#444] shadow-sm">Ctrl</kbd>
                            <span className="text-gray-600">+</span>
                            <kbd className="px-1.5 py-0.5 bg-[#333] rounded text-gray-300 min-w-[20px] text-center border border-[#444] shadow-sm">K</kbd>
                            <span className="text-gray-600">,</span>
                            <kbd className="px-1.5 py-0.5 bg-[#333] rounded text-gray-300 min-w-[20px] text-center border border-[#444] shadow-sm">O</kbd>
                        </div>
                    </div>

                    <div className="flex justify-between items-center text-[13px]">
                        <span className="text-gray-500">Toggle Terminal</span>
                        <div className="flex gap-1">
                            <kbd className="px-1.5 py-0.5 bg-[#333] rounded text-gray-300 min-w-[20px] text-center border border-[#444] shadow-sm">Ctrl</kbd>
                            <span className="text-gray-600">+</span>
                            <kbd className="px-1.5 py-0.5 bg-[#333] rounded text-gray-300 min-w-[20px] text-center border border-[#444] shadow-sm">`</kbd>
                        </div>
                    </div>

                    <div className="flex justify-between items-center text-[13px]">
                        <span className="text-gray-500">Toggle Voice Tutor</span>
                        <div className="flex gap-1">
                            <kbd className="px-1.5 py-0.5 bg-[#333] rounded text-gray-300 min-w-[20px] text-center border border-[#444] shadow-sm">Ctrl</kbd>
                            <span className="text-gray-600">+</span>
                            <kbd className="px-1.5 py-0.5 bg-[#333] rounded text-gray-300 min-w-[20px] text-center border border-[#444] shadow-sm">L</kbd>
                        </div>
                    </div>
                </div>

                {(recentFolders.length > 0 || recentFiles.length > 0) && (
                    <div className="mt-10 max-w-sm w-full px-8 text-[13px]">
                        <div className="text-[11px] uppercase tracking-widest text-gray-500 mb-2">Recent</div>
                        {recentFolders.slice(0, 5).map(p => (
                            <RecentEntry key={p} path={p} icon={<Folder size={13} />} onOpen={() => openFolderPath(p)} />
                        ))}
                        {recentFiles.slice(0, 5).map(p => (
                            <RecentEntry key={p} path={p} icon={<FileIcon name={baseName(p)} size={13} />} onOpen={() => openFileByPath(p)} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function EditorArea() {
    const openFiles = useFileStore((s) => s.openFiles);
    const activeFileIndex = useFileStore((s) => s.activeFileIndex);
    const dragging = useEditorDragging();

    if (openFiles.length === 0) return <WelcomeScreen />;

    // Groups sit in columns across the editor area and stack in rows within one
    const columns = editorColumns(openFiles);
    const activeTab = activeFileIndex !== null ? openFiles[activeFileIndex] : null;
    const focused: EditorCell = activeTab
        ? { column: activeTab.column, row: activeTab.row }
        : { column: columns[0], row: 0 };
    const canSplit = editorCells(openFiles).length < MAX_EDITOR_GROUPS;

    return (
        <Group orientation="horizontal" className="h-full w-full bg-[var(--vylos-grey-dark)]">
            {columns.map((column, c) => (
                <Fragment key={column}>
                    {c > 0 && <Separator className="w-[1px] bg-[#27272a] hover:bg-[var(--vylos-green)] transition-colors" />}
                    <Panel id={`editor-column-${column}`} minSize={180}>
                        <Group orientation="vertical" className="h-full w-full">
                            {editorRows(openFiles, column).map((row, r) => (
                                <Fragment key={row}>
                                    {r > 0 && <Separator className="h-[1px] bg-[#27272a] hover:bg-[var(--vylos-green)] transition-colors" />}
                                    <Panel id={`editor-group-${column}-${row}`} minSize={80}>
                                        <EditorGroup
                                            cell={{ column, row }}
                                            files={openFiles}
                                            isFocused={sameCell({ column, row }, focused)}
                                            dragging={dragging}
                                            canSplit={canSplit}
                                        />
                                    </Panel>
                                </Fragment>
                            ))}
                        </Group>
                    </Panel>
                </Fragment>
            ))}
        </Group>
    );
}
