/* eslint-disable @typescript-eslint/no-unused-vars */
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';

let mainWindow: BrowserWindow | null;

const createWindow = () => {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        backgroundColor: '#000000', // Vylos Black
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
const { PtyService } = require('./pty-service'); // Use require or import depending on tsconfig

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
    const sender = event.sender;
    if (!ptyService) {
        ptyService = new PtyService((data: string) => {
            sender.send('terminal:data', data);
        });
    }
    ptyService.create();
});

ipcMain.on('terminal:write', (event, data) => {
    ptyService?.write(data);
});

ipcMain.on('terminal:resize', (event, { cols, rows }) => {
    ptyService?.resize(cols, rows);
});

// File System Handlers
const fs = require('fs/promises');

ipcMain.handle('fs:list', async (event, dirPath) => {
    try {
        const dirents = await fs.readdir(dirPath, { withFileTypes: true });
        return dirents.map((dirent: any) => ({
            name: dirent.name,
            isDirectory: dirent.isDirectory(),
            path: path.join(dirPath, dirent.name)
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
