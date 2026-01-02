'use client';

import Editor, { useMonaco } from '@monaco-editor/react';
import { useState, useEffect, useRef } from "react";
import { vylosTheme } from '@/app/lib/theme';
import { useConfigStore } from '@/app/lib/stores/config-store';

interface MonacoEditorProps {
    language?: string;
    defaultValue?: string;
    value?: string;
    onChange?: (value: string | undefined) => void;
}

import { useFileStore } from '@/app/lib/useFileStore';

export default function MonacoEditor({
    language = 'javascript',
    defaultValue = '// Start coding...',
    value = '',
    onChange
}: MonacoEditorProps) {
    const monaco = useMonaco();
    const { fontSize } = useConfigStore();
    const {
        saveActiveFile,
        saveActiveFileAs,
        setActiveView,
        toggleTerminal,
        createNewFile,
        openExternalFile,
        openFolder,
        setShowQuickOpen,
        monacoAction,
        setMonacoAction,
        searchMetadata,
        clearSearchMetadata
    } = useFileStore();

    const editorRef = useRef<any>(null);

    useEffect(() => {
        if (monaco) {
            monaco.editor.defineTheme('vylos', vylosTheme as any);
            monaco.editor.setTheme('vylos');
        }
    }, [monaco]);

    useEffect(() => {
        if (monacoAction && editorRef.current) {
            // Trigger Monaco internal actions
            editorRef.current.trigger('menu', monacoAction);
            setMonacoAction(null);
        }
    }, [monacoAction, setMonacoAction]);

    useEffect(() => {
        if (searchMetadata && editorRef.current && monaco) {
            const { query, line } = searchMetadata;
            const model = editorRef.current.getModel();
            if (!model) return;

            // Find all matches
            const matches = model.findMatches(query, false, false, false, null, true);

            if (matches.length > 0) {
                // Try to find the match on the specific line if provided
                let match = matches[0];
                if (line) {
                    const lineMatch = matches.find((m: any) => m.range.startLineNumber === line);
                    if (lineMatch) match = lineMatch;
                }

                // Highlight and scroll
                editorRef.current.revealLineInCenter(match.range.startLineNumber);
                editorRef.current.setSelection(match.range);
                editorRef.current.focus();
            }

            clearSearchMetadata();
        }
    }, [searchMetadata, monaco, clearSearchMetadata]);

    const handleEditorDidMount = (editor: any, monaco: any) => {
        editorRef.current = editor;
        // Register keybindings within Monaco to prevent them from being swallowed

        // Ctrl+P: Quick Open
        editor.addAction({
            id: 'vylos-quick-open',
            label: 'Quick Open',
            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP],
            contextMenuGroupId: 'navigation',
            run: () => setShowQuickOpen(true)
        });

        // Ctrl+S: Save
        editor.addAction({
            id: 'vylos-save',
            label: 'Save File',
            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
            run: () => saveActiveFile()
        });

        // Ctrl+Shift+S: Save As
        editor.addAction({
            id: 'vylos-save-as',
            label: 'Save File As',
            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyS],
            run: () => saveActiveFileAs()
        });

        // Ctrl+B: Toggle Sidebar
        editor.addAction({
            id: 'vylos-toggle-sidebar',
            label: 'Toggle Sidebar',
            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB],
            run: () => {
                const currentView = useFileStore.getState().activeView;
                setActiveView(currentView === 'explorer' ? 'search' : 'explorer');
            }
        });

        // Ctrl+` : Toggle Terminal
        editor.addAction({
            id: 'vylos-toggle-terminal',
            label: 'Toggle Terminal',
            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Backquote],
            run: () => toggleTerminal()
        });

        // Ctrl+N: New File
        editor.addAction({
            id: 'vylos-new-file',
            label: 'New File',
            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyN],
            run: () => createNewFile()
        });

        // Ctrl+O: Open File
        editor.addAction({
            id: 'vylos-open-file',
            label: 'Open File',
            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyO],
            run: () => openExternalFile()
        });

        // Ctrl+L: AI Assistant (Voice)
        editor.addAction({
            id: 'vylos-ai-assistant',
            label: 'Toggle Voice Assistant',
            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyL],
            run: () => {
                window.dispatchEvent(new CustomEvent('vylos:toggle-voice'));
            }
        });

        // Ctrl+Shift+F: Search
        editor.addAction({
            id: 'vylos-sidebar-search',
            label: 'Open Search',
            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF],
            run: () => setActiveView('search')
        });

        // Ctrl+Shift+E: Explorer 
        editor.addAction({
            id: 'vylos-sidebar-explorer',
            label: 'Open Explorer',
            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyE],
            run: () => setActiveView('explorer')
        });

        // Ctrl+K Ctrl+O: Open Folder (Chord)
        editor.addAction({
            id: 'vylos-open-folder',
            label: 'Open Folder...',
            keybindings: [monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyO)],
            run: () => openFolder()
        });
    };

    return (
        <Editor
            height="100%"
            language={language}
            value={value}
            onChange={onChange}
            theme="vylos"
            onMount={handleEditorDidMount}
            options={{
                minimap: { enabled: true },
                fontFamily: "'Geist Mono', monospace",
                fontSize: fontSize,
                padding: { top: 16 },
                scrollBeyondLastLine: false,
                smoothScrolling: true,
                cursorBlinking: 'smooth',
                cursorSmoothCaretAnimation: 'on',
                renderLineHighlight: 'all',
                automaticLayout: true,
            }}
        />
    );
}
