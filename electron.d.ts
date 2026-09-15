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

    /** One folder in ~/.vylos/extensions as read from disk, before validation */
    interface ExtensionScan {
        folder: string;
        path: string;
        manifest?: unknown;
        manifestError?: string;
        courses: { path: string; json?: unknown; error?: string }[];
        code?: string;
        codeError?: string;
    }

    interface TermInfo {
        interactive: boolean;
        error: string | null;
        platform: string;
        shell: string;
    }

    interface TermStarted {
        runId: number;
        /** The tag passed to run/shell, so the page knows which tab it belongs to */
        tag: string | null;
        kind: 'run' | 'shell';
        command: string;
        cwd: string;
        interactive: boolean;
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
                /** Opens an .html file in the default browser; resolves with an error message, or '' on success */
                openHtml: (path: string) => Promise<string>;
                showItemInFolder: (path: string) => Promise<boolean>;
            };
            device: {
                /** SHA-256 hex of this computer's OS install id */
                getId: () => Promise<string>;
            };
            extensions: {
                scan: () => Promise<{ dir: string; extensions: ExtensionScan[] }>;
                openFolder: () => Promise<boolean>;
                onChanged: (callback: () => void) => () => void;
            };
            shortcuts: {
                onToggleTerminal: (callback: () => void) => () => void;
                onNewTerminal: (callback: () => void) => () => void;
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
                /** Whether processes get a real pseudo-terminal (input works) and the default shell's name */
                info: () => Promise<TermInfo>;
                /** Runs one command; resolves when it exits. timeoutMs null = no time limit */
                run: (opts: { command: string; cwd?: string; timeoutMs?: number | null; cols?: number; rows?: number; tag?: string }) =>
                    Promise<{ runId: number; exitCode: number; output: string; truncated?: boolean; timedOut?: boolean; error?: string }>;
                /** Starts an interactive shell */
                shell: (opts: { cwd?: string; cols?: number; rows?: number; tag?: string }) =>
                    Promise<{ runId: number; name: string } | { error: string }>;
                input: (runId: number, data: string) => Promise<boolean>;
                resize: (runId: number, cols: number, rows: number) => Promise<boolean>;
                kill: (runId: number) => Promise<boolean>;
                onStarted: (callback: (data: TermStarted) => void) => () => void;
                onOutput: (callback: (data: { runId: number; chunk: string }) => void) => () => void;
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
