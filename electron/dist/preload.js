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
            const subscription = (_event, data) => callback(data);
            electron_1.ipcRenderer.on('terminal:data', subscription);
            return () => electron_1.ipcRenderer.removeListener('terminal:data', subscription);
        }
    },
    fs: {
        listAll: (path) => electron_1.ipcRenderer.invoke('fs:listAll', path),
        list: (path) => electron_1.ipcRenderer.invoke('fs:list', path),
        read: (path) => electron_1.ipcRenderer.invoke('fs:read', path),
        write: (path, content) => electron_1.ipcRenderer.invoke('fs:write', path, content)
    },
    dialog: {
        openFile: () => electron_1.ipcRenderer.invoke('dialog:openFile'),
        openDirectory: () => electron_1.ipcRenderer.invoke('dialog:openDirectory'),
        saveFile: (content, defaultPath) => electron_1.ipcRenderer.invoke('dialog:saveFile', content, defaultPath)
    },
    find: {
        search: (query, rootDir) => electron_1.ipcRenderer.invoke('find:search', query, rootDir)
    },
    git: {
        status: (rootDir) => electron_1.ipcRenderer.invoke('git:status', rootDir),
        stage: (rootDir, filePath) => electron_1.ipcRenderer.invoke('git:stage', rootDir, filePath),
        unstage: (rootDir, filePath) => electron_1.ipcRenderer.invoke('git:unstage', rootDir, filePath),
        commit: (rootDir, message) => electron_1.ipcRenderer.invoke('git:commit', rootDir, message),
        branch: (rootDir) => electron_1.ipcRenderer.invoke('git:branch', rootDir)
    }
});
