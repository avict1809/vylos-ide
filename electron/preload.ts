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
    fs: {
        listAll: (path: string) => ipcRenderer.invoke('fs:listAll', path),
        list: (path: string) => ipcRenderer.invoke('fs:list', path),
        read: (path: string) => ipcRenderer.invoke('fs:read', path),
        write: (path: string, content: string) => ipcRenderer.invoke('fs:write', path, content),
        watch: (path: string) => ipcRenderer.invoke('fs:watch', path),
        createFile: (path: string) => ipcRenderer.invoke('fs:createFile', path),
        createDirectory: (path: string) => ipcRenderer.invoke('fs:createDirectory', path),
        delete: (path: string) => ipcRenderer.invoke('fs:delete', path),
        rename: (oldPath: string, newPath: string) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
        onChanged: (callback: (data: { event: string; path: string }) => void) => {
            const subscription = (_event: any, data: { event: string; path: string }) => callback(data);
            ipcRenderer.on('fs:changed', subscription);
            return () => ipcRenderer.removeListener('fs:changed', subscription);
        }
    },
    dialog: {
        openFile: () => ipcRenderer.invoke('dialog:openFile'),
        openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
        saveFile: (content: string, defaultPath?: string) => ipcRenderer.invoke('dialog:saveFile', content, defaultPath)
    },
    find: {
        search: (query: string, rootDir: string) => ipcRenderer.invoke('find:search', query, rootDir)
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
