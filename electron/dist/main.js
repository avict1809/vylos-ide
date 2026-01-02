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
    const iconPath = electron_1.app.isPackaged
        ? path_1.default.join(process.resourcesPath, "icon.png")
        : path_1.default.join(electron_1.app.getAppPath(), 'build/icons/icon.png');
    mainWindow = new electron_1.BrowserWindow({
        width: 1200,
        height: 800,
        backgroundColor: '#000000', // Vylos Black
        icon: iconPath, // Vylos Icon
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
// IPC Handlers will be added here
let PtyService = null;
try {
    const ptyModule = require('./pty-service');
    PtyService = ptyModule.PtyService;
}
catch (e) {
    console.error('Failed to load PtyService:', e);
}
let ptyService = null;
electron_1.ipcMain.handle('app:get-version', () => electron_1.app.getVersion());
electron_1.ipcMain.handle('app:get-path', (event, name) => electron_1.app.getPath(name));
// Window Controls
electron_1.ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize();
});
electron_1.ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
        mainWindow?.unmaximize();
    }
    else {
        mainWindow?.maximize();
    }
});
electron_1.ipcMain.handle('window:close', () => {
    mainWindow?.close();
});
electron_1.ipcMain.handle('window:is-maximized', () => {
    return mainWindow?.isMaximized();
});
electron_1.ipcMain.handle('window:toggle-maximize', () => {
    if (mainWindow?.isMaximized()) {
        mainWindow?.unmaximize();
    }
    else {
        mainWindow?.maximize();
    }
});
// Window Event Emitters
// Note: We need to set these up after mainWindow is created, or ensure mainWindow is available
// Moving this logic to createWindow would be better, but we can hook into the existing mainWindow if it's global
// The listeners below this block are outside createWindow, relying on mainWindow variable.
// However, callbacks for 'maximize' should be set on the window instance.
// Let's modify createWindow instead to ensure listeners are modifying the correct instance
electron_1.ipcMain.on('terminal:create', (event) => {
    if (!PtyService) {
        event.reply('terminal:data', '\r\n\x1b[31mError: Terminal backend (node-pty) could not be loaded.\x1b[0m\r\n\x1b[33mThis usually means build tools are missing on your system.\x1b[0m\r\n');
        return;
    }
    if (ptyService)
        return;
    ptyService = new PtyService((data) => {
        mainWindow?.webContents.send('terminal:data', data);
    });
    ptyService.create();
});
electron_1.ipcMain.on('terminal:write', (event, data) => {
    ptyService?.write(data);
});
electron_1.ipcMain.on('terminal:resize', (event, { cols, rows }) => {
    ptyService?.resize(cols, rows);
});
// File System Handlers
const { dialog } = require('electron');
const fs = require('fs/promises');
electron_1.ipcMain.handle('dialog:openFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
            { name: 'All Files', extensions: ['*'] },
            { name: 'JavaScript', extensions: ['js', 'jsx'] },
            { name: 'TypeScript', extensions: ['ts', 'tsx'] }
        ]
    });
    if (canceled)
        return null;
    return filePaths[0];
});
electron_1.ipcMain.handle('dialog:openDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    if (canceled)
        return null;
    return filePaths[0];
});
electron_1.ipcMain.handle('dialog:saveFile', async (event, content, defaultPath) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        defaultPath: defaultPath,
        filters: [{ name: 'All Files', extensions: ['*'] }]
    });
    if (canceled || !filePath)
        return null;
    await fs.writeFile(filePath, content, 'utf-8');
    return filePath;
});
electron_1.ipcMain.handle('find:search', async (event, query, rootDir) => {
    const results = [];
    const MAX_RESULTS = 100;
    const MAX_FILE_SIZE = 1024 * 1024; // 1MB
    async function searchDir(currentDir) {
        if (results.length >= MAX_RESULTS)
            return;
        try {
            const files = await fs.readdir(currentDir, { withFileTypes: true });
            for (const file of files) {
                if (results.length >= MAX_RESULTS)
                    break;
                const fullPath = path_1.default.join(currentDir, file.name);
                if (file.isDirectory()) {
                    if (['node_modules', '.git', '.next', 'dist', '.venv', 'target', 'bin'].includes(file.name))
                        continue;
                    await searchDir(fullPath);
                }
                else {
                    // Skip files that are likely binary or too large
                    const ext = path_1.default.extname(file.name).toLowerCase();
                    const binaryExts = ['.exe', '.dll', '.bin', '.png', '.jpg', '.jpeg', '.gif', '.pdf', '.zip', '.tar', '.gz', '.mp4', '.mp3'];
                    if (binaryExts.includes(ext))
                        continue;
                    try {
                        const stats = await fs.stat(fullPath);
                        if (stats.size > MAX_FILE_SIZE)
                            continue;
                        const content = await fs.readFile(fullPath, 'utf-8');
                        const lines = content.split('\n');
                        for (let i = 0; i < lines.length; i++) {
                            const line = lines[i];
                            if (line.toLowerCase().includes(query.toLowerCase())) {
                                results.push({
                                    path: fullPath,
                                    name: file.name,
                                    line: i + 1,
                                    text: line.trim()
                                });
                                if (results.length >= MAX_RESULTS)
                                    break;
                            }
                        }
                    }
                    catch (err) {
                        // Skip files that fail to read (e.g. permission issues or binary data errors)
                        continue;
                    }
                }
            }
        }
        catch (e) {
            console.error(`Error reading directory ${currentDir}:`, e);
        }
    }
    try {
        const absoluteRoot = path_1.default.isAbsolute(rootDir) ? rootDir : path_1.default.resolve(rootDir);
        await searchDir(absoluteRoot);
        return results;
    }
    catch (e) {
        console.error("Search failed:", e);
        return [];
    }
});
electron_1.ipcMain.handle('fs:listAll', async (event, dirPath) => {
    const results = [];
    async function recurse(current) {
        const entries = await fs.readdir(current, { withFileTypes: true });
        for (const entry of entries) {
            const full = path_1.default.join(current, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.next' || entry.name === 'dist')
                    continue;
                await recurse(full);
            }
            else {
                results.push(full);
            }
        }
    }
    try {
        await recurse(dirPath);
        return results;
    }
    catch (e) {
        return [];
    }
});
electron_1.ipcMain.handle('fs:list', async (event, dirPath) => {
    try {
        const dirents = await fs.readdir(dirPath, { withFileTypes: true });
        return dirents.map((dirent) => ({
            name: dirent.name,
            isDirectory: dirent.isDirectory(),
            path: require('path').join(dirPath, dirent.name)
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
// Git Handlers
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
electron_1.ipcMain.handle('git:status', async (event, rootDir) => {
    try {
        const { stdout } = await execAsync('git status --porcelain', { cwd: rootDir });
        const lines = stdout.split('\n').filter(Boolean);
        return lines.map((line) => {
            const status = line.slice(0, 2);
            const path = line.slice(3).trim();
            return { status, path };
        });
    }
    catch (e) {
        return [];
    }
});
electron_1.ipcMain.handle('git:stage', async (event, rootDir, filePath) => {
    try {
        await execAsync(`git add "${filePath}"`, { cwd: rootDir });
        return true;
    }
    catch (e) {
        return false;
    }
});
electron_1.ipcMain.handle('git:unstage', async (event, rootDir, filePath) => {
    try {
        await execAsync(`git reset HEAD "${filePath}"`, { cwd: rootDir });
        return true;
    }
    catch (e) {
        return false;
    }
});
electron_1.ipcMain.handle('git:commit', async (event, rootDir, message) => {
    try {
        await execAsync(`git commit -m "${message}"`, { cwd: rootDir });
        return true;
    }
    catch (e) {
        return false;
    }
});
electron_1.ipcMain.handle('git:branch', async (event, rootDir) => {
    try {
        const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: rootDir });
        return stdout.trim();
    }
    catch (e) {
        return null;
    }
});
