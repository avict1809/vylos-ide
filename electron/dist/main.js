"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable @typescript-eslint/no-unused-vars */
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
let mainWindow;
const createWindow = () => {
    mainWindow = new electron_1.BrowserWindow({
        width: 1200,
        height: 800,
        backgroundColor: '#000000', // Vylos Black
        titleBarStyle: 'hidden', // Custom title bar if needed
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false // Needed for some node-pty interactions later, though we should try to keep it secure
        },
    });
    const startUrl = process.env.NODE_ENV === 'development'
        ? 'http://localhost:3000'
        : `file://${path_1.default.join(__dirname, '../../out/index.html')}`;
    mainWindow.loadURL(startUrl);
    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
    mainWindow.on('maximize', () => {
        mainWindow?.webContents.send('window:maximized');
    });
    mainWindow.on('unmaximize', () => {
        mainWindow?.webContents.send('window:unmaximized');
    });
};
electron_1.app.whenReady().then(() => {
    createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
// IPC Handlers
const terminal_ipc_1 = require("./terminal/terminal.ipc");
(0, terminal_ipc_1.setupTerminalIPC)();
electron_1.ipcMain.handle('app:get-version', () => electron_1.app.getVersion());
electron_1.ipcMain.handle('app:get-path', (event, name) => electron_1.app.getPath(name));
// Window Control Handlers
electron_1.ipcMain.handle('window:minimize', (event) => {
    const win = electron_1.BrowserWindow.fromWebContents(event.sender);
    win?.minimize();
});
electron_1.ipcMain.handle('window:maximize', (event) => {
    const win = electron_1.BrowserWindow.fromWebContents(event.sender);
    if (win?.isMaximized()) {
        win.unmaximize();
    }
    else {
        win?.maximize();
    }
});
electron_1.ipcMain.handle('window:close', (event) => {
    const win = electron_1.BrowserWindow.fromWebContents(event.sender);
    win?.close();
});
electron_1.ipcMain.handle('window:is-maximized', (event) => {
    const win = electron_1.BrowserWindow.fromWebContents(event.sender);
    return win?.isMaximized();
});
electron_1.ipcMain.handle('window:toggle-maximize', (event) => {
    const win = electron_1.BrowserWindow.fromWebContents(event.sender);
    if (win?.isMaximized()) {
        win.unmaximize();
    }
    else {
        win?.maximize();
    }
});
// File System Handlers
const fs = require('fs/promises');
electron_1.ipcMain.handle('fs:list', async (event, dirPath) => {
    try {
        const dirents = await fs.readdir(dirPath, { withFileTypes: true });
        return dirents.map((dirent) => ({
            name: dirent.name,
            isDirectory: dirent.isDirectory(),
            path: path_1.default.join(dirPath, dirent.name)
        }));
    }
    catch (e) {
        console.error("FS List Error", e);
        return [];
    }
});
electron_1.ipcMain.handle('fs:read', async (event, filePath) => {
    try {
        return await fs.readFile(filePath, 'utf-8');
    }
    catch (e) {
        return null;
    }
});
electron_1.ipcMain.handle('fs:write', async (event, filePath, content) => {
    try {
        await fs.writeFile(filePath, content, 'utf-8');
        return true;
    }
    catch (e) {
        return false;
    }
});
