"use client";

import { X, Minus, Square, Copy, ChevronRight } from "lucide-react";
import React, { useState, useEffect } from "react";
import { useFileStore } from "../lib/useFileStore";
import { cn } from "@/app/lib/utils";
import Image from "next/image";

import SaveConfirmModal from "./SaveConfirmModal";
import QuickOpenModal from "./QuickOpenModal";
import AboutModal from "./AboutModal";

export function TitleBar() {
    const {
        openFiles,
        activeFileIndex,
        saveActiveFile,
        saveActiveFileAs,
        createNewFile,
        openExternalFile,
        openFolder,
        setActiveView,
        closeFile,
        setShowQuickOpen,
        setShowAbout,
        toggleTerminal,
        setMonacoAction
    } = useFileStore();

    const activeFile = activeFileIndex !== null ? openFiles[activeFileIndex] : null;
    const [isMaximized, setIsMaximized] = useState(false);
    const [activeMenu, setActiveMenu] = useState<string | null>(null);
    const [ctrlKTyped, setCtrlKTyped] = useState(false);

    useEffect(() => {
        if (!window?.electron?.window) return;
        const update = async () => setIsMaximized(await window.electron.window.isMaximized());
        update();
        const cleanupMax = window.electron.window.onMaximize(update);
        const cleanupUnmax = window.electron.window.onUnmaximize(update);
        return () => {
            cleanupMax();
            cleanupUnmax();
        };
    }, []);

    const handleAction = (label: string) => {
        switch (label) {
            case "New Text File": createNewFile(); break;
            case "Open File...": openExternalFile(); break;
            case "Open Folder...": openFolder(); break;
            case "Save": saveActiveFile(); break;
            case "Save As...": saveActiveFileAs(); break;
            case "Close Editor": if (activeFile) closeFile(activeFile.path); break;
            case "Exit": window.electron?.window.close(); break;
            case "Toggle Terminal": toggleTerminal(); break;
            case "New Terminal": toggleTerminal(); break;

            case "Toggle Sidebar": setActiveView(getOppositeView()); break;
            case "Search": setActiveView('search'); break;
            case "Explorer": setActiveView('explorer'); break;
            case "AI Assistant": setActiveView('ai'); break;
            case "Learning Path": setActiveView('learning'); break;
            case "Settings": setActiveView('settings'); break;
            case "Go to File...": setShowQuickOpen(true); break;
            case "About Vylos": setShowAbout(true); break;

            // Edit Actions
            case "Undo": setMonacoAction('undo'); break;
            case "Redo": setMonacoAction('redo'); break;
            case "Cut": setMonacoAction('editor.action.clipboardCutAction'); break;
            case "Copy": setMonacoAction('editor.action.clipboardCopyAction'); break;
            case "Paste": setMonacoAction('editor.action.clipboardPasteAction'); break;
            case "Find": setMonacoAction('actions.find'); break;
            case "Replace": setMonacoAction('editor.action.startFindReplaceAction'); break;

            // Selection Actions
            case "Select All": setMonacoAction('editor.action.selectAll'); break;
        }
        setActiveMenu(null);
    };

    const getOppositeView = (): 'explorer' | 'search' | 'ai' | 'settings' | 'learning' => {
        return useFileStore.getState().activeView === 'explorer' ? 'search' : 'explorer';
    };

    const MENUS = [
        {
            label: "File",
            items: [
                { label: "New Text File", shortcut: "Ctrl+N" },
                { type: "separator" },
                { label: "Open File...", shortcut: "Ctrl+O" },
                { label: "Open Folder...", shortcut: "Ctrl+K Ctrl+O" },
                { type: "separator" },
                { label: "Save", shortcut: "Ctrl+S" },
                { label: "Save As...", shortcut: "Ctrl+Shift+S" },
                { label: "Save All" },
                { type: "separator" },
                { label: "Close Editor", shortcut: "Ctrl+F4" },
                { label: "Exit", shortcut: "Alt+F4" },
            ]
        },
        {
            label: "Edit",
            items: [
                { label: "Undo", shortcut: "Ctrl+Z" },
                { label: "Redo", shortcut: "Ctrl+Y" },
                { type: "separator" },
                { label: "Cut", shortcut: "Ctrl+X" },
                { label: "Copy", shortcut: "Ctrl+C" },
                { label: "Paste", shortcut: "Ctrl+V" },
                { type: "separator" },
                { label: "Find", shortcut: "Ctrl+F" },
                { label: "Replace", shortcut: "Ctrl+H" },
            ]
        },
        {
            label: "Selection",
            items: [
                { label: "Select All", shortcut: "Ctrl+A" },
                { label: "Expand Selection", shortcut: "Shift+Alt+Right" },
                { label: "Shrink Selection", shortcut: "Shift+Alt+Left" },
            ]
        },
        {
            label: "View",
            items: [
                { label: "Explorer", shortcut: "Ctrl+Shift+E" },
                { label: "Search", shortcut: "Ctrl+Shift+F" },
                { label: "AI Assistant", shortcut: "Ctrl+Shift+I" },
                { label: "Learning Path", shortcut: "Ctrl+Shift+L" },
                { type: "separator" },
                { label: "Toggle Sidebar", shortcut: "Ctrl+B" },
                { label: "Appearance" },
            ]
        },
        { label: "Go", items: [{ label: "Go to File...", shortcut: "Ctrl+P" }] },
        { label: "Terminal", items: [{ label: "New Terminal", shortcut: "Ctrl+Shift+`" }] },
        { label: "Help", items: [{ label: "About Vylos" }] }
    ];

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key.toLowerCase() === 'k') {
                    setCtrlKTyped(true);
                    setTimeout(() => setCtrlKTyped(false), 2000);
                    return;
                }

                if (ctrlKTyped && e.key.toLowerCase() === 'o') {
                    e.preventDefault();
                    setCtrlKTyped(false);
                    handleAction("Open Folder...");
                    return;
                }

                switch (e.key.toLowerCase()) {
                    case 's': e.preventDefault(); e.shiftKey ? saveActiveFileAs() : saveActiveFile(); break;
                    case 'n': e.preventDefault(); createNewFile(); break;
                    case 'o': e.preventDefault(); openExternalFile(); break;
                    case 'p': e.preventDefault(); useFileStore.getState().setShowQuickOpen(true); break;
                    case 'b': e.preventDefault(); handleAction("Toggle Sidebar"); break;
                    case 'l':
                        e.preventDefault();
                        if (e.shiftKey) setActiveView('learning');
                        else window.dispatchEvent(new CustomEvent('vylos:toggle-voice'));
                        break;
                    case 'f': if (e.shiftKey) { e.preventDefault(); setActiveView('search'); } break;
                    case 'e': if (e.shiftKey) { e.preventDefault(); setActiveView('explorer'); } break;
                    case 'i': if (e.shiftKey) { e.preventDefault(); setActiveView('ai'); } break;
                    case '`': e.preventDefault(); toggleTerminal(); break;
                }
            } else {
                setCtrlKTyped(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [saveActiveFile, saveActiveFileAs, createNewFile, openExternalFile, openFolder, ctrlKTyped, handleAction]);

    useEffect(() => {
        if (!activeMenu) return;
        const handleClose = () => setActiveMenu(null);
        window.addEventListener("click", handleClose);
        return () => window.removeEventListener("click", handleClose);
    }, [activeMenu]);

    return (
        <>
            <SaveConfirmModal />
            <QuickOpenModal />
            <AboutModal />

            {/* TITLE BAR ROOT */}
            <div
                className="h-8 flex items-center bg-[#09090b] border-b border-[#27272a] text-[12.5px] text-gray-300 select-none app-region-drag"
                onDoubleClick={() => window.electron?.window.toggleMaximize()}
            >
                {/* LEFT: LOGO + MENUS */}
                <div className="flex items-center h-full app-region-no-drag">
                    <div className="flex items-center px-2">
                        <Image
                            src="/logo.svg"
                            alt="Vylos Logo"
                            width={14}
                            height={14}
                            className="mr-2"
                        />
                    </div>

                    {MENUS.map(menu => (
                        <div key={menu.label} className="relative">
                            <div
                                onMouseEnter={() => activeMenu && setActiveMenu(menu.label)}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenu(activeMenu === menu.label ? null : menu.label);
                                }}
                                className={cn(
                                    "px-2 py-[2px] rounded cursor-default transition-colors",
                                    activeMenu === menu.label
                                        ? "bg-[#27272a] text-white"
                                        : "hover:bg-[#27272a]"
                                )}
                            >
                                {menu.label}
                            </div>

                            {activeMenu === menu.label && (
                                <div
                                    className="absolute top-full left-0 mt-1 w-64 bg-[#18181b] border border-[#27272a] shadow-2xl rounded-md z-[100] py-1 app-region-no-drag"
                                >
                                    {menu.items.map((item: any, i) =>
                                        item.type === "separator" ? (
                                            <div key={i} className="h-px bg-[#27272a] my-1 mx-2" />
                                        ) : (
                                            <div
                                                key={i}
                                                className="px-3 py-1 hover:bg-[var(--vylos-green-dark)] hover:text-white flex justify-between items-center cursor-default"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleAction(item.label);
                                                }}
                                            >
                                                <span>{item.label}</span>
                                                {item.shortcut && (
                                                    <span className="text-gray-500 text-[11px] ml-4">
                                                        {item.shortcut}
                                                    </span>
                                                )}
                                            </div>
                                        )
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* CENTER: TITLE & BREADCRUMBS */}
                <div className="flex-1 flex items-center justify-center overflow-hidden px-4 gap-2">
                    <div className="flex items-center text-gray-400 text-[11px] overflow-hidden">
                        <span className="opacity-50">vylos</span>
                        {activeFile && (
                            <>
                                <span className="mx-1 opacity-30">—</span>
                                <div className="flex items-center gap-1 overflow-hidden">
                                    {activeFile.path.split(/[\\/]/).filter(p => p && !p.includes(':')).slice(-3).map((part, i, arr) => (
                                        <React.Fragment key={i}>
                                            <span className={cn(
                                                "truncate max-w-[100px]",
                                                i === arr.length - 1 ? "text-gray-200 font-medium" : "opacity-60"
                                            )}>
                                                {part}
                                            </span>
                                            {i < arr.length - 1 && <ChevronRight size={10} className="opacity-30 shrink-0" />}
                                        </React.Fragment>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* RIGHT: WINDOW CONTROLS */}
                <div
                    className="flex items-center h-full app-region-no-drag"
                >
                    <TitleButton onClick={() => window.electron?.window.minimize()}>
                        <Minus size={14} />
                    </TitleButton>

                    <TitleButton onClick={() => window.electron?.window.toggleMaximize()}>
                        {isMaximized ? (
                            <Copy size={12} className="rotate-180" />
                        ) : (
                            <Square size={12} />
                        )}
                    </TitleButton>

                    <TitleButton danger onClick={() => window.electron?.window.close()}>
                        <X size={14} />
                    </TitleButton>
                </div>
            </div>
        </>
    );
}

function TitleButton({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "h-8 w-11 flex items-center justify-center transition-colors",
                danger ? "hover:bg-red-500/30 hover:text-red-500" : "hover:bg-[#27272a] hover:text-white"
            )}
        >
            {children}
        </button>
    );
}
