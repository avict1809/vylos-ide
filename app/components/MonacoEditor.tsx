'use client';

import Editor, { useMonaco } from '@monaco-editor/react';
import { useEffect } from 'react';
import { vylosTheme } from '@/app/lib/theme';

interface MonacoEditorProps {
    language?: string;
    defaultValue?: string;
    value?: string;
    onChange?: (value: string | undefined) => void;
}

export default function MonacoEditor({
    language = 'javascript',
    defaultValue = '// Start coding...',
    value,
    onChange
}: MonacoEditorProps) {

    const monaco = useMonaco();

    useEffect(() => {
        if (monaco) {
            monaco.editor.defineTheme('vylos', vylosTheme as any);
            monaco.editor.setTheme('vylos');
        }
    }, [monaco]);

    return (
        <Editor
            height="100%"
            defaultLanguage={language}
            defaultValue={defaultValue}
            value={value}
            onChange={onChange}
            theme="vylos"
            options={{
                minimap: { enabled: true },
                fontFamily: "'Geist Mono', monospace",
                fontSize: 14,
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
