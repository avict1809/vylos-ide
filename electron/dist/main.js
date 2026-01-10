"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const chokidar_1 = __importDefault(require("chokidar"));
const promises_1 = __importDefault(require("fs/promises"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const electron_serve_1 = __importDefault(require("electron-serve"));
let mainWindow;
const isDev = process.env.NODE_ENV === 'development' || !electron_1.app.isPackaged;
// CRITICAL: Initialize electron-serve at module level BEFORE app.whenReady()
// This registers the 'app://' protocol handler early enough for it to work
const loadURL = isDev ? null : (0, electron_serve_1.default)({
    directory: 'out',
    scheme: 'app'
});
const createWindow = async () => {
    const iconPath = electron_1.app.isPackaged
        ? path_1.default.join(process.resourcesPath, "icon.png")
        : path_1.default.join(electron_1.app.getAppPath(), 'build/icons/icon.png');
    mainWindow = new electron_1.BrowserWindow({
        width: 1200,
        height: 800,
        backgroundColor: '#000000', // Vylos Black
        icon: iconPath, // Vylos Icon
        titleBarStyle: 'hidden', //Replace with Custom title bar
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            devTools: true,
        },
    });
    // Only open DevTools in development mode
    if (isDev) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    if (isDev) {
        // Development: Load from Next.js dev server
        await mainWindow.loadURL('http://localhost:3000');
    }
    else {
        // Production: Use the pre-initialized electron-serve
        if (loadURL) {
            await loadURL(mainWindow);
        }
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
electron_1.app.whenReady().then(async () => {
    await createWindow();
    electron_1.app.on('activate', async () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            await createWindow();
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
// IPC Handlers will be added here
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
// File System Handlers
const { dialog } = require('electron');
let watcher = null;
electron_1.ipcMain.handle('fs:watch', (event, rootDir) => {
    if (watcher) {
        watcher.close();
    }
    watcher = chokidar_1.default.watch(rootDir, {
        ignored: /(^|[\/\\])\..|node_modules|\.next|dist/, // ignore dotfiles and common big dirs
        persistent: true,
        ignoreInitial: true
    });
    watcher.on('all', (event, path) => {
        mainWindow?.webContents.send('fs:changed', { event, path });
    });
    return true;
});
electron_1.ipcMain.handle('fs:createFile', async (event, filePath) => {
    try {
        await promises_1.default.writeFile(filePath, '');
        return true;
    }
    catch (e) {
        return false;
    }
});
electron_1.ipcMain.handle('fs:createDirectory', async (event, dirPath) => {
    try {
        await promises_1.default.mkdir(dirPath, { recursive: true });
        return true;
    }
    catch (e) {
        return false;
    }
});
electron_1.ipcMain.handle('fs:delete', async (event, targetPath) => {
    try {
        await fs_extra_1.default.remove(targetPath);
        return true;
    }
    catch (e) {
        return false;
    }
});
electron_1.ipcMain.handle('fs:rename', async (event, oldPath, newPath) => {
    try {
        await promises_1.default.rename(oldPath, newPath);
        return true;
    }
    catch (e) {
        return false;
    }
});
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
    await promises_1.default.writeFile(filePath, content, 'utf-8');
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
            const files = await promises_1.default.readdir(currentDir, { withFileTypes: true });
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
                        const stats = await promises_1.default.stat(fullPath);
                        if (stats.size > MAX_FILE_SIZE)
                            continue;
                        const content = await promises_1.default.readFile(fullPath, 'utf-8');
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
        const entries = await promises_1.default.readdir(current, { withFileTypes: true });
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
        const dirents = await promises_1.default.readdir(dirPath, { withFileTypes: true });
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
        return await promises_1.default.readFile(filePath, 'utf-8');
    }
    catch (e) {
        return null;
    }
});
electron_1.ipcMain.handle('fs:write', async (event, filePath, content) => {
    try {
        await promises_1.default.writeFile(filePath, content, 'utf-8');
        return true;
    }
    catch (e) {
        return false;
    }
});
// Git Handlers with isomorphic-git
const git = __importStar(require("isomorphic-git"));
electron_1.ipcMain.handle('git:status', async (event, dir) => {
    try {
        const matrix = await git.statusMatrix({ fs: fs_extra_1.default, dir });
        // statusMatrix returns [filepath, head, workdir, stage]
        // 0: absent, 1: unmodified, 2: modified
        const unstaged = [];
        const staged = [];
        for (const [filepath, head, workdir, stage] of matrix) {
            if (filepath === '.git' || filepath === 'node_modules')
                continue;
            // Unstaged changes (workdir vs stage)
            if (workdir === 2 && stage === 1) {
                unstaged.push({ path: filepath, status: 'M' });
            }
            else if (workdir === 2 && stage === 0) {
                unstaged.push({ path: filepath, status: 'A' }); // New file
            }
            else if (workdir === 0 && stage === 1) {
                unstaged.push({ path: filepath, status: 'D' }); // Deleted
            }
            // Staged changes (stage vs head)
            if (stage === 2 && head === 1) {
                staged.push({ path: filepath, status: 'M' });
            }
            else if (stage === 2 && head === 0) {
                staged.push({ path: filepath, status: 'A' });
            }
            else if (stage === 0 && head === 1) {
                staged.push({ path: filepath, status: 'D' });
            }
        }
        return { unstaged, staged };
    }
    catch (e) {
        console.error('Git Status Error:', e);
        return { unstaged: [], staged: [] };
    }
});
electron_1.ipcMain.handle('git:stage', async (event, dir, filepath) => {
    try {
        await git.add({ fs: fs_extra_1.default, dir, filepath });
        return true;
    }
    catch (e) {
        return false;
    }
});
electron_1.ipcMain.handle('git:unstage', async (event, dir, filepath) => {
    try {
        await git.remove({ fs: fs_extra_1.default, dir, filepath });
        return true;
    }
    catch (e) {
        // Fallback for reset if remove isn't what we want for unstage
        // isomorphic-git reset is complex, we might need a different approach
        return false;
    }
});
electron_1.ipcMain.handle('git:stageAll', async (event, dir) => {
    try {
        const matrix = await git.statusMatrix({ fs: fs_extra_1.default, dir });
        for (const [filepath, head, workdir, stage] of matrix) {
            if (workdir !== stage) {
                await git.add({ fs: fs_extra_1.default, dir, filepath });
            }
        }
        return true;
    }
    catch (e) {
        return false;
    }
});
electron_1.ipcMain.handle('git:unstageAll', async (event, dir) => {
    try {
        const matrix = await git.statusMatrix({ fs: fs_extra_1.default, dir });
        for (const [filepath, head, workdir, stage] of matrix) {
            if (stage !== head) {
                // Simplified unstage
                await fs_extra_1.default.remove(path_1.default.join(dir, '.git/index.lock')).catch(() => { });
            }
        }
        return true;
    }
    catch (e) {
        return false;
    }
});
electron_1.ipcMain.handle('git:commit', async (event, dir, message) => {
    try {
        await git.commit({
            fs: fs_extra_1.default,
            dir,
            message,
            author: { name: 'Vylos User', email: 'user@vylos.ai' }
        });
        return true;
    }
    catch (e) {
        return false;
    }
});
electron_1.ipcMain.handle('git:branch', async (event, dir) => {
    try {
        return await git.currentBranch({ fs: fs_extra_1.default, dir });
    }
    catch (e) {
        return null;
    }
});
electron_1.ipcMain.handle('git:push', async (event, dir) => {
    // Mock push for now as it requires auth/remote
    return new Promise(resolve => setTimeout(() => resolve(true), 1500));
});
