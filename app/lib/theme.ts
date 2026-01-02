export const vylosTheme = {
    base: 'vs-dark',
    inherit: true,
    rules: [
        { token: 'comment', foreground: '6a9955' }, // Greenish comments
        { token: 'keyword', foreground: '569cd6' },
        { token: 'string', foreground: 'ce9178' },
        { token: 'function', foreground: 'dcdcaa' },
        { token: 'variable', foreground: '9cdcfe' },
        { token: 'type', foreground: '4ec9b0' }, // Green accent
        // Add more custom token colors as needed for Vylos aesthetics
    ],
    colors: {
        'editor.background': '#000000', // Vylos Black
        'editor.foreground': '#cccccc',
        'editorCursor.foreground': '#00ff00', // Vylos Green Cursor
        'editor.lineHighlightBackground': '#1e1e1e',
        'editorLineNumber.foreground': '#858585',
        'editorIndentGuide.background': '#3e3e42',
        'editor.selectionBackground': '#264f78',
    }
};
