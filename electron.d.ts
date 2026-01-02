export { };

declare global {
    interface Window {
        electron: {
            getVersion: () => Promise<string>;
            getPath: (name: string) => Promise<string>;
            window: {
                minimize: () => Promise<void>;
                toggleMaximize: () => Promise<void>;
                close: () => Promise<void>;
                isMaximized: () => Promise<boolean>;
                onMaximize: (callback: () => void) => () => void;
                onUnmaximize: (callback: () => void) => () => void;
            };
            fs: {
                listAll: (path: string) => Promise<string[]>;
                list: (path: string) => Promise<any[]>;
                read: (path: string) => Promise<string | null>;
                write: (path: string, content: string) => Promise<boolean>;
            };
            dialog: {
                openFile: () => Promise<string | null>;
                openDirectory: () => Promise<string | null>;
                saveFile: (content: string, defaultPath?: string) => Promise<string | null>;
            };
            terminal: {
                create: () => void;
                write: (data: string) => void;
                resize: (cols: number, rows: number) => void;
                onData: (callback: (data: string) => void) => () => void;
            };
            find: {
                search: (query: string, rootDir: string) => Promise<any[]>;
            };
            git: {
                status: (rootDir: string) => Promise<{ status: string; path: string }[]>;
                stage: (rootDir: string, filePath: string) => Promise<boolean>;
                unstage: (rootDir: string, filePath: string) => Promise<boolean>;
                commit: (rootDir: string, message: string) => Promise<boolean>;
                branch: (rootDir: string) => Promise<string | null>;
            };
        };
    }
}
