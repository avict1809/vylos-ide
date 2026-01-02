"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
console.log('--- PRELOAD LOADED ---');
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electron', {
    getVersion: () => electron_1.ipcRenderer.invoke('app:get-version'),
    getPath: (name) => electron_1.ipcRenderer.invoke('app:get-path', name),
    window: {
        minimize: () => electron_1.ipcRenderer.invoke('window:minimize'),
        maximize: () => electron_1.ipcRenderer.invoke('window:maximize'),
        close: () => electron_1.ipcRenderer.invoke('window:close'),
        isMaximized: () => electron_1.ipcRenderer.invoke('window:is-maximized'),
        toggleMaximize: () => electron_1.ipcRenderer.invoke('window:toggle-maximize'),
        onMaximize: (callback) => {
            const subscription = (_event) => callback();
            electron_1.ipcRenderer.on('window:maximized', subscription);
            return () => electron_1.ipcRenderer.removeListener('window:maximized', subscription);
        },
        onUnmaximize: (callback) => {
            const subscription = (_event) => callback();
            electron_1.ipcRenderer.on('window:unmaximized', subscription);
            return () => electron_1.ipcRenderer.removeListener('window:unmaximized', subscription);
        }
    },
    terminal: {
        create: () => electron_1.ipcRenderer.send('terminal:create'),
        write: (data) => electron_1.ipcRenderer.send('terminal:write', data),
        resize: (cols, rows) => electron_1.ipcRenderer.send('terminal:resize', { cols, rows }),
        onData: (callback) => {
            electron_1.ipcRenderer.on('terminal:data', (_event, data) => callback(data));
        }
    },
    fs: {
        list: (path) => electron_1.ipcRenderer.invoke('fs:list', path),
        read: (path) => electron_1.ipcRenderer.invoke('fs:read', path),
        write: (path, content) => electron_1.ipcRenderer.invoke('fs:write', path, content)
    }
});
