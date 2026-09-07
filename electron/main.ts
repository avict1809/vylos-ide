import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import http from 'http';
import path from 'path';
import chokidar, { FSWatcher } from 'chokidar';
import fs from 'fs/promises';
import fse from 'fs-extra';
import serve from 'electron-serve';
import { initUpdater } from './updater';

let mainWindow: BrowserWindow | null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// CRITICAL: Initialize electron-serve at module level BEFORE app.whenReady()
// This registers the 'app://' protocol handler early enough for it to work
const loadURL = isDev ? null : serve({
    directory: 'out',
    scheme: 'app'
});

const createWindow = async () => {
    const iconPath = app.isPackaged
        ? path.join(process.resourcesPath, "icon.png")
        : path.join(app.getAppPath(), 'build/icons/icon.png');

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        backgroundColor: '#000000', // Vylos Black
        icon: iconPath, // Vylos Icon
        titleBarStyle: 'hidden', //Replace with Custom title bar
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
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
    } else {
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

app.whenReady().then(async () => {
    await createWindow();
    // Checks for a mandatory update; the renderer blocks the app until it is applied
    initUpdater();

    app.on('activate', async () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            await createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Auth: full web sign-in. The system browser opens a Vylos auth page served
// from this localhost server; the page talks to Supabase (email + OAuth) and
// POSTs the resulting session tokens back to /auth/complete.
const AUTH_PORT = 51735;
const AUTH_PAGE_URL = `http://localhost:${AUTH_PORT}/`;
const AUTH_TIMEOUT_MS = 10 * 60 * 1000;

interface AuthResult {
    access_token?: string;
    refresh_token?: string;
    error?: string;
}

let authServer: http.Server | null = null;
let settleAuth: ((result: AuthResult) => void) | null = null;

const closeAuthServer = () => {
    if (authServer) {
        authServer.close();
        authServer = null;
    }
};

const readBody = (req: http.IncomingMessage): Promise<string> =>
    new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => {
            body += chunk;
            if (body.length > 64 * 1024) reject(new Error('Body too large'));
        });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });

ipcMain.handle('auth:signInViaBrowser', (event, config: { supabaseUrl: string; supabaseAnonKey: string; mode?: string }) => {
    // Supersede any in-flight attempt
    settleAuth?.({ error: 'cancelled' });
    closeAuthServer();

    return new Promise<AuthResult>((resolve) => {
        let settled = false;
        const settle = (result: AuthResult) => {
            if (settled) return;
            settled = true;
            settleAuth = null;
            clearTimeout(timer);
            // Let the success page's fetch response flush before closing
            setTimeout(closeAuthServer, 2000);
            resolve(result);
        };
        settleAuth = settle;

        const timer = setTimeout(() => settle({ error: 'Sign-in timed out. Please try again.' }), AUTH_TIMEOUT_MS);

        authServer = http.createServer(async (req, res) => {
            const url = new URL(req.url ?? '/', AUTH_PAGE_URL);

            try {
                if (req.method === 'GET' && url.pathname === '/') {
                    const template = await fs.readFile(path.join(__dirname, '../auth-page.html'), 'utf-8');
                    const page = template.replace('__VYLOS_AUTH_CONFIG__', JSON.stringify({
                        url: config.supabaseUrl,
                        anonKey: config.supabaseAnonKey,
                        mode: config.mode === 'signup' ? 'signup' : 'signin',
                        pageUrl: AUTH_PAGE_URL,
                    }));
                    res.writeHead(200, { 'Content-Type': 'text/html' }).end(page);
                } else if (req.method === 'GET' && url.pathname === '/supabase.js') {
                    const lib = await fs.readFile(require.resolve('@supabase/supabase-js/dist/umd/supabase.js'));
                    res.writeHead(200, { 'Content-Type': 'application/javascript' }).end(lib);
                } else if (req.method === 'POST' && url.pathname === '/auth/complete') {
                    const { access_token, refresh_token } = JSON.parse(await readBody(req));
                    if (typeof access_token !== 'string' || typeof refresh_token !== 'string') {
                        res.writeHead(400, { 'Content-Type': 'application/json' }).end('{"ok":false}');
                        return;
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');

                    // Bring the app back to the front
                    if (mainWindow) {
                        if (mainWindow.isMinimized()) mainWindow.restore();
                        mainWindow.show();
                        mainWindow.focus();
                    }
                    settle({ access_token, refresh_token });
                } else {
                    res.writeHead(404).end();
                }
            } catch (e) {
                res.writeHead(500).end();
            }
        });

        authServer.on('error', (e: NodeJS.ErrnoException) => {
            settle({ error: e.code === 'EADDRINUSE' ? `Port ${AUTH_PORT} is already in use by another program.` : e.message });
        });

        authServer.listen(AUTH_PORT, '127.0.0.1', () => {
            shell.openExternal(AUTH_PAGE_URL);
        });
    });
});

ipcMain.handle('auth:cancel', () => {
    settleAuth?.({ error: 'cancelled' });
    closeAuthServer();
    return true;
});

// IPC Handlers will be added here
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

// Terminal runner: executes shell commands (e.g. python3/node interpreters),
// streaming output live to the renderer. Used by both the terminal panel and
// the AI voice tutor's run_command tool.
const TERM_MAX_OUTPUT = 200 * 1024;
const TERM_DEFAULT_TIMEOUT_MS = 30_000;
const TERM_MAX_TIMEOUT_MS = 120_000;

const termProcs = new Map<number, ChildProcess>();
let nextRunId = 1;

ipcMain.handle('term:run', (event, opts: { command: string; cwd?: string; timeoutMs?: number }) => {
    const runId = nextRunId++;
    const command = String(opts.command ?? '').trim();
    if (!command) return { runId, exitCode: -1, output: '', error: 'Empty command' };

    return new Promise((resolve) => {
        let output = '';
        let truncated = false;
        let timedOut = false;

        mainWindow?.webContents.send('term:started', { runId, command, cwd: opts.cwd ?? null });

        const child = spawn(command, {
            shell: true,
            cwd: opts.cwd || undefined,
            env: process.env,
        });
        termProcs.set(runId, child);

        const timeoutMs = Math.min(Math.max(opts.timeoutMs ?? TERM_DEFAULT_TIMEOUT_MS, 1000), TERM_MAX_TIMEOUT_MS);
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill('SIGKILL');
        }, timeoutMs);

        const onChunk = (stream: 'stdout' | 'stderr') => (data: Buffer) => {
            const text = data.toString();
            if (output.length < TERM_MAX_OUTPUT) {
                output += text;
            } else {
                truncated = true;
            }
            mainWindow?.webContents.send('term:output', { runId, chunk: text, stream });
        };
        child.stdout?.on('data', onChunk('stdout'));
        child.stderr?.on('data', onChunk('stderr'));

        child.on('error', (err) => {
            clearTimeout(timer);
            termProcs.delete(runId);
            mainWindow?.webContents.send('term:exit', { runId, exitCode: -1, timedOut: false, error: err.message });
            resolve({ runId, exitCode: -1, output, truncated, timedOut: false, error: err.message });
        });

        child.on('close', (code) => {
            clearTimeout(timer);
            termProcs.delete(runId);
            const exitCode = code ?? -1;
            mainWindow?.webContents.send('term:exit', { runId, exitCode, timedOut });
            resolve({ runId, exitCode, output, truncated, timedOut });
        });
    });
});

ipcMain.handle('term:kill', (event, runId: number) => {
    const child = termProcs.get(runId);
    if (child) {
        child.kill('SIGKILL');
        return true;
    }
    return false;
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
