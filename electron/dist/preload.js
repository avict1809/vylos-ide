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
    auth: {
        signInViaBrowser: (config) => electron_1.ipcRenderer.invoke('auth:signInViaBrowser', config),
        cancel: () => electron_1.ipcRenderer.invoke('auth:cancel'),
    },
    fs: {
        listAll: (path) => electron_1.ipcRenderer.invoke('fs:listAll', path),
        list: (path) => electron_1.ipcRenderer.invoke('fs:list', path),
        read: (path) => electron_1.ipcRenderer.invoke('fs:read', path),
        write: (path, content) => electron_1.ipcRenderer.invoke('fs:write', path, content),
        watch: (path) => electron_1.ipcRenderer.invoke('fs:watch', path),
        createFile: (path) => electron_1.ipcRenderer.invoke('fs:createFile', path),
        createDirectory: (path) => electron_1.ipcRenderer.invoke('fs:createDirectory', path),
        delete: (path) => electron_1.ipcRenderer.invoke('fs:delete', path),
        rename: (oldPath, newPath) => electron_1.ipcRenderer.invoke('fs:rename', oldPath, newPath),
        onChanged: (callback) => {
            const subscription = (_event, data) => callback(data);
            electron_1.ipcRenderer.on('fs:changed', subscription);
            return () => electron_1.ipcRenderer.removeListener('fs:changed', subscription);
        }
    },
    dialog: {
        openFile: () => electron_1.ipcRenderer.invoke('dialog:openFile'),
        openDirectory: () => electron_1.ipcRenderer.invoke('dialog:openDirectory'),
        saveFile: (content, defaultPath) => electron_1.ipcRenderer.invoke('dialog:saveFile', content, defaultPath)
    },
    find: {
        search: (query, rootDir) => electron_1.ipcRenderer.invoke('find:search', query, rootDir)
    },
    term: {
        run: (opts) => electron_1.ipcRenderer.invoke('term:run', opts),
        kill: (runId) => electron_1.ipcRenderer.invoke('term:kill', runId),
        onStarted: (callback) => {
            const subscription = (_event, data) => callback(data);
            electron_1.ipcRenderer.on('term:started', subscription);
            return () => electron_1.ipcRenderer.removeListener('term:started', subscription);
        },
        onOutput: (callback) => {
            const subscription = (_event, data) => callback(data);
            electron_1.ipcRenderer.on('term:output', subscription);
            return () => electron_1.ipcRenderer.removeListener('term:output', subscription);
        },
        onExit: (callback) => {
            const subscription = (_event, data) => callback(data);
            electron_1.ipcRenderer.on('term:exit', subscription);
            return () => electron_1.ipcRenderer.removeListener('term:exit', subscription);
        },
    },
    git: {
        status: (rootDir) => electron_1.ipcRenderer.invoke('git:status', rootDir),
        stage: (rootDir, filePath) => electron_1.ipcRenderer.invoke('git:stage', rootDir, filePath),
        unstage: (rootDir, filePath) => electron_1.ipcRenderer.invoke('git:unstage', rootDir, filePath),
        stageAll: (rootDir) => electron_1.ipcRenderer.invoke('git:stageAll', rootDir),
        unstageAll: (rootDir) => electron_1.ipcRenderer.invoke('git:unstageAll', rootDir),
        commit: (rootDir, message) => electron_1.ipcRenderer.invoke('git:commit', rootDir, message),
        branch: (rootDir) => electron_1.ipcRenderer.invoke('git:branch', rootDir),
        push: (rootDir) => electron_1.ipcRenderer.invoke('git:push', rootDir)
    }
});
