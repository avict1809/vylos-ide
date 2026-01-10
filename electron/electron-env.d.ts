export { };

declare global {
    interface Window {
        electron: {
            getVersion: () => Promise<string>;
            getPath: (name: string) => Promise<string>;
            window: {
                minimize: () => Promise<void>;
                maximize: () => Promise<void>;
                close: () => Promise<void>;
                isMaximized: () => Promise<boolean>;
                toggleMaximize: () => Promise<void>;
                onMaximize: (callback: () => void) => () => void;
                onUnmaximize: (callback: () => void) => () => void;
            };
            fs: {
                list: (path: string) => Promise<{ name: string; isDirectory: boolean; path: string }[]>;
                read: (path: string) => Promise<string | null>;
                write: (path: string, content: string) => Promise<boolean>;
            };
        };
    }
}
