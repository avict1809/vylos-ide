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
    terminal: {
        create: () => ipcRenderer.send('terminal:create'),
        write: (data: string) => ipcRenderer.send('terminal:write', data),
        resize: (cols: number, rows: number) => ipcRenderer.send('terminal:resize', { cols, rows }),
        onData: (callback: (data: string) => void) => {
            ipcRenderer.on('terminal:data', (_event, data) => callback(data));
        }
    },
    fs: {
        list: (path: string) => ipcRenderer.invoke('fs:list', path),
        read: (path: string) => ipcRenderer.invoke('fs:read', path),
        write: (path: string, content: string) => ipcRenderer.invoke('fs:write', path, content)
    }
});
