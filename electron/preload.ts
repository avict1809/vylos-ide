console.log('--- PRELOAD LOADED ---');
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    getPath: (name: string) => ipcRenderer.invoke('app:get-path', name),
    window: {
        minimize: () => ipcRenderer.invoke('window:minimize'),
        maximize: () => ipcRenderer.invoke('window:maximize'),
        close: () => ipcRenderer.invoke('window:close'),
        isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
        toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
        onMaximize: (callback: () => void) => {
            const subscription = (_event: any) => callback();
            ipcRenderer.on('window:maximized', subscription);
            return () => ipcRenderer.removeListener('window:maximized', subscription);
        },
        onUnmaximize: (callback: () => void) => {
            const subscription = (_event: any) => callback();
            ipcRenderer.on('window:unmaximized', subscription);
            return () => ipcRenderer.removeListener('window:unmaximized', subscription);
        }
    },
    auth: {
        signInViaBrowser: (config: { supabaseUrl: string; supabaseAnonKey: string; mode?: string }) =>
            ipcRenderer.invoke('auth:signInViaBrowser', config),
        cancel: () => ipcRenderer.invoke('auth:cancel'),
    },
    updates: {
        getState: () => ipcRenderer.invoke('update:get-state'),
        check: () => ipcRenderer.invoke('update:check'),
        install: () => ipcRenderer.invoke('update:install'),
        onState: (callback: (state: any) => void) => {
            const subscription = (_event: any, state: any) => callback(state);
            ipcRenderer.on('update:state', subscription);
            return () => ipcRenderer.removeListener('update:state', subscription);
        },
    },
    fs: {
        listAll: (path: string) => ipcRenderer.invoke('fs:listAll', path),
        list: (path: string) => ipcRenderer.invoke('fs:list', path),
        read: (path: string) => ipcRenderer.invoke('fs:read', path),
        write: (path: string, content: string) => ipcRenderer.invoke('fs:write', path, content),
        watch: (path: string) => ipcRenderer.invoke('fs:watch', path),
        createFile: (path: string) => ipcRenderer.invoke('fs:createFile', path),
        createDirectory: (path: string) => ipcRenderer.invoke('fs:createDirectory', path),
        delete: (path: string) => ipcRenderer.invoke('fs:delete', path),
        trash: (path: string) => ipcRenderer.invoke('fs:trash', path),
        rename: (oldPath: string, newPath: string) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
        pasteInto: (srcPath: string, destDir: string, move: boolean) => ipcRenderer.invoke('fs:pasteInto', srcPath, destDir, move),
        onChanged: (callback: (data: { event: string; path: string }) => void) => {
            const subscription = (_event: any, data: { event: string; path: string }) => callback(data);
            ipcRenderer.on('fs:changed', subscription);
            return () => ipcRenderer.removeListener('fs:changed', subscription);
        }
    },
    shell: {
        showItemInFolder: (path: string) => ipcRenderer.invoke('shell:showItemInFolder', path),
    },
    shortcuts: {
        onToggleTerminal: (callback: () => void) => {
            const subscription = () => callback();
            ipcRenderer.on('shortcut:toggle-terminal', subscription);
            return () => ipcRenderer.removeListener('shortcut:toggle-terminal', subscription);
        },
    },
    cli: {
        takePendingOpens: () => ipcRenderer.invoke('cli:take-pending'),
        onOpenRequested: (callback: () => void) => {
            const subscription = () => callback();
            ipcRenderer.on('cli:open-requested', subscription);
            return () => ipcRenderer.removeListener('cli:open-requested', subscription);
        },
        installCommand: () => ipcRenderer.invoke('cli:install-command'),
        uninstallCommand: () => ipcRenderer.invoke('cli:uninstall-command'),
    },
    dialog: {
        openFile: () => ipcRenderer.invoke('dialog:openFile'),
        openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
        saveFile: (content: string, defaultPath?: string) => ipcRenderer.invoke('dialog:saveFile', content, defaultPath)
    },
    find: {
        search: (query: string, rootDir: string) => ipcRenderer.invoke('find:search', query, rootDir)
    },
    term: {
        run: (opts: { command: string; cwd?: string; timeoutMs?: number }) => ipcRenderer.invoke('term:run', opts),
        kill: (runId: number) => ipcRenderer.invoke('term:kill', runId),
        onStarted: (callback: (data: { runId: number; command: string; cwd: string | null }) => void) => {
            const subscription = (_event: any, data: any) => callback(data);
            ipcRenderer.on('term:started', subscription);
            return () => ipcRenderer.removeListener('term:started', subscription);
        },
        onOutput: (callback: (data: { runId: number; chunk: string; stream: 'stdout' | 'stderr' }) => void) => {
            const subscription = (_event: any, data: any) => callback(data);
            ipcRenderer.on('term:output', subscription);
            return () => ipcRenderer.removeListener('term:output', subscription);
        },
        onExit: (callback: (data: { runId: number; exitCode: number; timedOut: boolean; error?: string }) => void) => {
            const subscription = (_event: any, data: any) => callback(data);
            ipcRenderer.on('term:exit', subscription);
            return () => ipcRenderer.removeListener('term:exit', subscription);
        },
    },
    git: {
        status: (rootDir: string) => ipcRenderer.invoke('git:status', rootDir),
        stage: (rootDir: string, filePath: string) => ipcRenderer.invoke('git:stage', rootDir, filePath),
        unstage: (rootDir: string, filePath: string) => ipcRenderer.invoke('git:unstage', rootDir, filePath),
        stageAll: (rootDir: string) => ipcRenderer.invoke('git:stageAll', rootDir),
        unstageAll: (rootDir: string) => ipcRenderer.invoke('git:unstageAll', rootDir),
        commit: (rootDir: string, message: string) => ipcRenderer.invoke('git:commit', rootDir, message),
        branch: (rootDir: string) => ipcRenderer.invoke('git:branch', rootDir),
        push: (rootDir: string) => ipcRenderer.invoke('git:push', rootDir)
    }
});
