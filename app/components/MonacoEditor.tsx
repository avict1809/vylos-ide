'use client';

import React, { useEffect, useRef, useState } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import { vylosTheme } from '@/app/lib/theme';
import { useConfigStore } from '@/app/lib/stores/config-store';
import { useFileStore } from '@/app/lib/useFileStore';
import { registerEditor, unregisterEditor } from '@/app/lib/editor-bridge';
import { setupAiCodeHints } from '@/app/lib/ai/code-hover';
import { setupStepGuide } from '@/app/lib/ai/step-guide';
import { setupCoaching } from '@/app/lib/ai/code-coach';
import ContextMenu from './ContextMenu';
import { Sparkles, Save, Search, Code, GraduationCap } from 'lucide-react';

interface MonacoEditorProps {
    /** Picks the language from its extension; overridden by `language` */
    fileName?: string;
    language?: string;
    defaultValue?: string;
    value?: string;
    onChange?: (value: string | undefined) => void;
}

/** Monaco knows each language's file extensions; anything unknown opens as plain text. */
function languageForFile(monaco: any, fileName: string | undefined): string {
    const ext = fileName?.includes('.') ? '.' + fileName.split('.').pop()!.toLowerCase() : '';
    const match = ext && monaco?.languages.getLanguages().find((l: { extensions?: string[] }) => l.extensions?.includes(ext));
    return match?.id ?? 'plaintext';
}

export default function MonacoEditor({
    fileName,
    language: languageOverride,
    defaultValue = '// Start coding...',
    value = '',
    onChange
}: MonacoEditorProps) {
    const monaco = useMonaco();
    const language = languageOverride ?? languageForFile(monaco, fileName);
    const {
        fontSize,
        minimapEnabled,
        lineNumbers,
        wordWrap,
        autoSave
    } = useConfigStore();
    const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
    const [showMenu, setShowMenu] = useState(false);

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

    // Autosave logic
    useEffect(() => {
        if (!autoSave || !value) return;

        const timeout = setTimeout(() => {
            saveActiveFile();
        }, 1500); // 1.5s debounce for auto-save

        return () => clearTimeout(timeout);
    }, [value, autoSave, saveActiveFile]);

    const handleContextMenu = (e: any) => {
        e.event.preventDefault();
        setMenuPos({ x: e.event.posx, y: e.event.posy });
        setShowMenu(true);
    };

    const contextActions = [
        { label: 'Ask Vylos AI', icon: Sparkles, onClick: () => setActiveView('ai'), shortcut: 'Ctrl+L' },
        { label: 'Learning Context', icon: GraduationCap, onClick: () => setActiveView('learning'), shortcut: 'Ctrl+Shift+L' },
        { label: 'Format Document', icon: Code, onClick: () => editorRef.current?.trigger('any', 'editor.action.formatDocument') },
        { label: 'Save', icon: Save, onClick: () => saveActiveFile(), shortcut: 'Ctrl+S' },
        { label: 'Search Workspace', icon: Search, onClick: () => setActiveView('search'), shortcut: 'Ctrl+Shift+F' },
    ];

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

            // Add a slight delay to ensure the model has updated with the new 'value'
            const timeout = setTimeout(() => {
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
            }, 100);

            return () => clearTimeout(timeout);
        }
    }, [searchMetadata, monaco, clearSearchMetadata, value]);

    const handleEditorDidMount = (editor: any, monaco: any) => {
        editorRef.current = editor;

        // Give the voice tutor access for highlighting/scrolling
        registerEditor(editor, monaco);
        editor.onDidDispose?.(() => unregisterEditor(editor));

        // AI hover hints: underline functions/classes, explain them on hover
        setupAiCodeHints(editor, monaco);

        // Step-by-step problem solving: comment a problem, get graded hints via CodeLens
        setupStepGuide(editor, monaco);

        // Coaches from extensions: teaching notes on the learner's code
        setupCoaching(editor, monaco);

        // Register custom context menu
        editor.onContextMenu(handleContextMenu);

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
        <div className="relative h-full w-full">
            <Editor
                height="100%"
                language={language}
                value={value}
                onChange={onChange}
                theme="vylos"
                onMount={handleEditorDidMount}
                options={{
                    minimap: { enabled: minimapEnabled },
                    fontFamily: "'Geist Mono', monospace",
                    fontSize: fontSize,
                    lineNumbers: lineNumbers,
                    wordWrap: wordWrap,
                    padding: { top: 16 },
                    scrollBeyondLastLine: false,
                    smoothScrolling: true,
                    cursorBlinking: 'smooth',
                    cursorSmoothCaretAnimation: 'on',
                    renderLineHighlight: 'all',
                    automaticLayout: true,
                    contextmenu: false,
                }}
            />
            {showMenu && (
                <ContextMenu
                    x={menuPos.x}
                    y={menuPos.y}
                    actions={contextActions}
                    onClose={() => setShowMenu(false)}
                />
            )}
        </div>
    );
}
