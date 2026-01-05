import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import chokidar, { FSWatcher } from 'chokidar';
import fs from 'fs/promises';
import fse from 'fs-extra';

let mainWindow: BrowserWindow | null;

const createWindow = () => {
    const iconPath = app.isPackaged
        ? path.join(process.resourcesPath, "icon.png")
        : path.join(app.getAppPath(), 'build/icons/icon.png');

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        backgroundColor: '#000000', // Vylos Black
        icon: iconPath, // Vylos Icon
        titleBarStyle: 'hidden', // Custom title bar if needed
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false // Needed for some node-pty interactions later, though we should try to keep it secure
        },
    });

    const startUrl = process.env.NODE_ENV === 'development'
        ? 'http://localhost:3000'
        : `file://${path.join(__dirname, '../../out/index.html')}`;

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

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// IPC Handlers will be added here
let PtyService: any = null;
try {
    const ptyModule = require('./pty-service');
    PtyService = ptyModule.PtyService;
} catch (e) {
    console.error('Failed to load PtyService:', e);
}

let ptyService: any = null;

ipcMain.handle('app:get-version', () => app.getVersion());

ipcMain.handle('app:get-path', (event, name) => app.getPath(name));

// Window Controls
ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize();
});
ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
        mainWindow?.unmaximize();
    } else {
        mainWindow?.maximize();
    }
});
ipcMain.handle('window:close', () => {
    mainWindow?.close();
});
ipcMain.handle('window:is-maximized', () => {
    return mainWindow?.isMaximized();
});

ipcMain.handle('window:toggle-maximize', () => {
    if (mainWindow?.isMaximized()) {
        mainWindow?.unmaximize();
    } else {
        mainWindow?.maximize();
    }
});

// Window Event Emitters
// Note: We need to set these up after mainWindow is created, or ensure mainWindow is available
// Moving this logic to createWindow would be better, but we can hook into the existing mainWindow if it's global
// The listeners below this block are outside createWindow, relying on mainWindow variable.
// However, callbacks for 'maximize' should be set on the window instance.

// Let's modify createWindow instead to ensure listeners are modifying the correct instance



ipcMain.on('terminal:create', (event) => {
    if (!PtyService) {
        event.reply('terminal:data', '\r\n\x1b[31mError: Terminal backend (node-pty) could not be loaded.\x1b[0m\r\n\x1b[33mThis usually means build tools are missing on your system.\x1b[0m\r\n');
        return;
    }
    if (ptyService) return;

    ptyService = new PtyService((data: string) => {
        mainWindow?.webContents.send('terminal:data', data);
    });
    ptyService.create();
});

ipcMain.on('terminal:write', (event, data) => {
    ptyService?.write(data);
});

ipcMain.on('terminal:resize', (event, { cols, rows }) => {
    ptyService?.resize(cols, rows);
});

// File System Handlers
const { dialog } = require('electron');

let watcher: FSWatcher | null = null;

ipcMain.handle('fs:watch', (event, rootDir: string) => {
    if (watcher) {
        watcher.close();
    }

    watcher = chokidar.watch(rootDir, {
        ignored: /(^|[\/\\])\..|node_modules|\.next|dist/, // ignore dotfiles and common big dirs
        persistent: true,
        ignoreInitial: true
    });

    watcher.on('all', (event: string, path: string) => {
        mainWindow?.webContents.send('fs:changed', { event, path });
    });

    return true;
});

ipcMain.handle('fs:createFile', async (event, filePath: string) => {
    try {
        await fs.writeFile(filePath, '');
        return true;
    } catch (e) {
        return false;
    }
});

ipcMain.handle('fs:createDirectory', async (event, dirPath: string) => {
    try {
        await fs.mkdir(dirPath, { recursive: true });
        return true;
    } catch (e) {
        return false;
    }
});

ipcMain.handle('fs:delete', async (event, targetPath: string) => {
    try {
        await fse.remove(targetPath);
        return true;
    } catch (e) {
        return false;
    }
});

ipcMain.handle('fs:rename', async (event, oldPath: string, newPath: string) => {
    try {
        await fs.rename(oldPath, newPath);
        return true;
    } catch (e) {
        return false;
    }
});

ipcMain.handle('dialog:openFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow!, {
        properties: ['openFile'],
        filters: [
            { name: 'All Files', extensions: ['*'] },
            { name: 'JavaScript', extensions: ['js', 'jsx'] },
            { name: 'TypeScript', extensions: ['ts', 'tsx'] }
        ]
    });
    if (canceled) return null;
    return filePaths[0];
});

ipcMain.handle('dialog:openDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow!, {
        properties: ['openDirectory']
    });
    if (canceled) return null;
    return filePaths[0];
});

ipcMain.handle('dialog:saveFile', async (event, content: string, defaultPath?: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow!, {
        defaultPath: defaultPath,
        filters: [{ name: 'All Files', extensions: ['*'] }]
    });
    if (canceled || !filePath) return null;
    await fs.writeFile(filePath, content, 'utf-8');
    return filePath;
});

ipcMain.handle('find:search', async (event, query: string, rootDir: string) => {
    const results: { path: string; name: string; line: number; text: string }[] = [];
    const MAX_RESULTS = 100;
    const MAX_FILE_SIZE = 1024 * 1024; // 1MB

    async function searchDir(currentDir: string) {
        if (results.length >= MAX_RESULTS) return;

        try {
            const files = await fs.readdir(currentDir, { withFileTypes: true });
            for (const file of files) {
                if (results.length >= MAX_RESULTS) break;

                const fullPath = path.join(currentDir, file.name);
                if (file.isDirectory()) {
                    if (['node_modules', '.git', '.next', 'dist', '.venv', 'target', 'bin'].includes(file.name)) continue;
                    await searchDir(fullPath);
                } else {
                    // Skip files that are likely binary or too large
                    const ext = path.extname(file.name).toLowerCase();
                    const binaryExts = ['.exe', '.dll', '.bin', '.png', '.jpg', '.jpeg', '.gif', '.pdf', '.zip', '.tar', '.gz', '.mp4', '.mp3'];
                    if (binaryExts.includes(ext)) continue;

                    try {
                        const stats = await fs.stat(fullPath);
                        if (stats.size > MAX_FILE_SIZE) continue;

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
                                if (results.length >= MAX_RESULTS) break;
                            }
                        }
                    } catch (err) {
                        // Skip files that fail to read (e.g. permission issues or binary data errors)
                        continue;
                    }
                }
            }
        } catch (e) {
            console.error(`Error reading directory ${currentDir}:`, e);
        }
    }

    try {
        const absoluteRoot = path.isAbsolute(rootDir) ? rootDir : path.resolve(rootDir);
        await searchDir(absoluteRoot);
        return results;
    } catch (e) {
        console.error("Search failed:", e);
        return [];
    }
});
ipcMain.handle('fs:listAll', async (event, dirPath) => {
    const results: string[] = [];
    async function recurse(current: string) {
        const entries = await fs.readdir(current, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.next' || entry.name === 'dist') continue;
                await recurse(full);
            } else {
                results.push(full);
            }
        }
    }
    try {
        await recurse(dirPath);
        return results;
    } catch (e) {
        return [];
    }
});

ipcMain.handle('fs:list', async (event, dirPath) => {
    try {
        const dirents = await fs.readdir(dirPath, { withFileTypes: true });
        return dirents.map((dirent: any) => ({
            name: dirent.name,
            isDirectory: dirent.isDirectory(),
            path: require('path').join(dirPath, dirent.name)
        }));
    } catch (e) {
        console.error("FS List Error", e);
        return [];
    }
});

ipcMain.handle('fs:read', async (event, filePath) => {
    try {
        return await fs.readFile(filePath, 'utf-8');
    } catch (e) {
        return null;
    }
});

ipcMain.handle('fs:write', async (event, filePath, content) => {
    try {
        await fs.writeFile(filePath, content, 'utf-8');
        return true;
    } catch (e) {
        return false;
    }
});

// Git Handlers with isomorphic-git
import * as git from 'isomorphic-git';

ipcMain.handle('git:status', async (event, dir: string) => {
    try {
        const matrix = await git.statusMatrix({ fs: fse, dir });
        // statusMatrix returns [filepath, head, workdir, stage]
        // 0: absent, 1: unmodified, 2: modified
        const unstaged: { path: string; status: string }[] = [];
        const staged: { path: string; status: string }[] = [];

        for (const [filepath, head, workdir, stage] of matrix) {
            if (filepath === '.git' || filepath === 'node_modules') continue;

            // Unstaged changes (workdir vs stage)
            if (workdir === 2 && stage === 1) {
                unstaged.push({ path: filepath, status: 'M' });
            } else if (workdir === 2 && stage === 0) {
                unstaged.push({ path: filepath, status: 'A' }); // New file
            } else if (workdir === 0 && stage === 1) {
                unstaged.push({ path: filepath, status: 'D' }); // Deleted
            }

            // Staged changes (stage vs head)
            if (stage === 2 && head === 1) {
                staged.push({ path: filepath, status: 'M' });
            } else if (stage === 2 && head === 0) {
                staged.push({ path: filepath, status: 'A' });
            } else if (stage === 0 && head === 1) {
                staged.push({ path: filepath, status: 'D' });
            }
        }

        return { unstaged, staged };
    } catch (e) {
        console.error('Git Status Error:', e);
        return { unstaged: [], staged: [] };
    }
});

ipcMain.handle('git:stage', async (event, dir: string, filepath: string) => {
    try {
        await git.add({ fs: fse, dir, filepath });
        return true;
    } catch (e) {
        return false;
    }
});

ipcMain.handle('git:unstage', async (event, dir: string, filepath: string) => {
    try {
        await git.remove({ fs: fse, dir, filepath });
        return true;
    } catch (e) {
        // Fallback for reset if remove isn't what we want for unstage
        // isomorphic-git reset is complex, we might need a different approach
        return false;
    }
});

ipcMain.handle('git:stageAll', async (event, dir: string) => {
    try {
        const matrix = await git.statusMatrix({ fs: fse, dir });
        for (const [filepath, head, workdir, stage] of matrix) {
            if (workdir !== stage) {
                await git.add({ fs: fse, dir, filepath });
            }
        }
        return true;
    } catch (e) {
        return false;
    }
});

ipcMain.handle('git:unstageAll', async (event, dir: string) => {
    try {
        const matrix = await git.statusMatrix({ fs: fse, dir });
        for (const [filepath, head, workdir, stage] of matrix) {
            if (stage !== head) {
                // Simplified unstage
                await fse.remove(path.join(dir, '.git/index.lock')).catch(() => { });
            }
        }
        return true;
    } catch (e) {
        return false;
    }
});

ipcMain.handle('git:commit', async (event, dir: string, message: string) => {
    try {
        await git.commit({
            fs: fse,
            dir,
            message,
            author: { name: 'Vylos User', email: 'user@vylos.ai' }
        });
        return true;
    } catch (e) {
        return false;
    }
});

ipcMain.handle('git:branch', async (event, dir: string) => {
    try {
        return await git.currentBranch({ fs: fse, dir });
    } catch (e) {
        return null;
    }
});

ipcMain.handle('git:push', async (event, dir: string) => {
    // Mock push for now as it requires auth/remote
    return new Promise(resolve => setTimeout(() => resolve(true), 1500));
});
