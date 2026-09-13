export { };

declare global {
    type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error';

    interface UpdateState {
        status: UpdateStatus;
        version: string | null;
        percent: number;
        message: string | null;
        /** True once an update exists — the app is blocked until it is installed */
        required: boolean;
        currentVersion: string;
    }

    /** A path from `vylos <path>`; 'new' = a file that doesn't exist yet */
    interface CliOpenRequest {
        path: string;
        kind: 'directory' | 'file' | 'new';
    }

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
            auth: {
                signInViaBrowser: (config: { supabaseUrl: string; supabaseAnonKey: string; mode?: string }) =>
                    Promise<{ access_token?: string; refresh_token?: string; error?: string }>;
                cancel: () => Promise<boolean>;
            };
            updates: {
                getState: () => Promise<UpdateState>;
                check: () => Promise<UpdateState>;
                install: () => Promise<boolean>;
                onState: (callback: (state: UpdateState) => void) => () => void;
            };
            fs: {
                listAll: (path: string) => Promise<string[]>;
                list: (path: string) => Promise<any[]>;
                read: (path: string) => Promise<string | null>;
                write: (path: string, content: string) => Promise<boolean>;
                watch: (path: string) => Promise<boolean>;
                createFile: (path: string) => Promise<boolean>;
                createDirectory: (path: string) => Promise<boolean>;
                delete: (path: string) => Promise<boolean>;
                trash: (path: string) => Promise<boolean>;
                rename: (oldPath: string, newPath: string) => Promise<boolean>;
                pasteInto: (srcPath: string, destDir: string, move: boolean) => Promise<string | null>;
                onChanged: (callback: (data: { event: string; path: string }) => void) => () => void;
            };
            shell: {
                showItemInFolder: (path: string) => Promise<boolean>;
            };
            shortcuts: {
                onToggleTerminal: (callback: () => void) => () => void;
            };
            cli: {
                takePendingOpens: () => Promise<CliOpenRequest[]>;
                onOpenRequested: (callback: () => void) => () => void;
                installCommand: () => Promise<void>;
                uninstallCommand: () => Promise<void>;
            };
            dialog: {
                openFile: () => Promise<string | null>;
                openDirectory: () => Promise<string | null>;
                saveFile: (content: string, defaultPath?: string) => Promise<string | null>;
            };
            term: {
                run: (opts: { command: string; cwd?: string; timeoutMs?: number }) =>
                    Promise<{ runId: number; exitCode: number; output: string; truncated?: boolean; timedOut?: boolean; error?: string }>;
                kill: (runId: number) => Promise<boolean>;
                onStarted: (callback: (data: { runId: number; command: string; cwd: string | null }) => void) => () => void;
                onOutput: (callback: (data: { runId: number; chunk: string; stream: 'stdout' | 'stderr' }) => void) => () => void;
                onExit: (callback: (data: { runId: number; exitCode: number; timedOut: boolean; error?: string }) => void) => () => void;
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
