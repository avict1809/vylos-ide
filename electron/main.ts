import { app, BrowserWindow, shell } from 'electron';
import http from 'http';
import path from 'path';
import chokidar, { FSWatcher } from 'chokidar';
import fs from 'fs/promises';
import fse from 'fs-extra';
import serve from 'electron-serve';
import { initUpdater } from './updater';
import { handle, isAppUrl } from './ipc';
import { initExtensions } from './extensions';
import { initDevice } from './device';
import { initTerminal } from './terminal';
import {
    CommandResult, OpenRequest, detachFromTerminal, installShellCommand, launchArgs,
    printCliInfo, refreshShellCommand, resolveOpenRequests, shouldOfferShellCommand, uninstallShellCommand,
} from './cli';

let mainWindow: BrowserWindow | null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// `vylos <path>` from a terminal (see cli.ts). `--help`, a terminal launch that
// relaunches itself detached, and a second `vylos` that hands its paths to the
// running app all quit here without making a window.
const cliArgs = launchArgs(process.argv);
const isPrimaryInstance = !printCliInfo(process.argv) && !detachFromTerminal()
    // Development skips the lock so it can run alongside an installed copy
    && (isDev || app.requestSingleInstanceLock({ args: cliArgs, cwd: process.cwd() }));

if (!isPrimaryInstance) app.quit();

const focusMainWindow = () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
};

// Paths to open wait here until the renderer collects them: the window may
// still be loading when they arrive.
const pendingOpens: OpenRequest[] = [];
let resolvingOpens = Promise.resolve();

const queueOpen = (args: string[], cwd: string) => {
    if (args.length === 0) return;
    resolvingOpens = resolvingOpens.then(async () => {
        pendingOpens.push(...await resolveOpenRequests(args, cwd));
        mainWindow?.webContents.send('cli:open-requested');
    });
};

if (isPrimaryInstance) queueOpen(cliArgs, process.cwd());

app.on('second-instance', (_event, argv, workingDirectory, data) => {
    const { args, cwd } = (data ?? {}) as { args?: string[]; cwd?: string };
    queueOpen(args ?? launchArgs(argv), cwd ?? workingDirectory);
    focusMainWindow();
});

// CRITICAL: Initialize electron-serve at module level BEFORE app.whenReady()
// This registers the 'app://' protocol handler early enough for it to work
const loadURL = isDev ? null : serve({
    directory: 'out',
    scheme: 'app'
});

const openInBrowser = (url: string) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
};

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
            sandbox: true,
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

    // The window only ever shows the app. Links elsewhere open in the system
    // browser instead of inside a window that has the preload's privileges.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        openInBrowser(url);
        return { action: 'deny' };
    });
    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (isAppUrl(url)) return;
        event.preventDefault();
        openInBrowser(url);
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    mainWindow.on('maximize', () => {
        mainWindow?.webContents.send('window:maximized');
    });

    mainWindow.on('unmaximize', () => {
        mainWindow?.webContents.send('window:unmaximized');
    });

    // Ctrl+` toggles the terminal (Ctrl+Shift+` opens a new one). Caught here, before the page, so no focused
    // widget (editor, inputs) can swallow it; matched by physical key so it works
    // on any keyboard layout.
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown' && (input.control || input.meta) && !input.alt && input.code === 'Backquote') {
            event.preventDefault();
            mainWindow?.webContents.send(input.shift ? 'shortcut:new-terminal' : 'shortcut:toggle-terminal');
        }
    });
};

if (isPrimaryInstance) app.whenReady().then(async () => {
    // Before the window: the page asks for these as soon as it mounts
    initExtensions(() => mainWindow);
    initTerminal(() => mainWindow);
    initDevice();
    await createWindow();
    // Checks for a mandatory update; the renderer blocks the app until it is applied
    initUpdater();
    void refreshShellCommand();
    void offerShellCommand();

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

handle('auth:signInViaBrowser', (event, config: { supabaseUrl: string; supabaseAnonKey: string; mode?: string }) => {
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
                    focusMainWindow();
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

handle('auth:cancel', () => {
    settleAuth?.({ error: 'cancelled' });
    closeAuthServer();
    return true;
});

// IPC Handlers will be added here
handle('app:get-version', () => app.getVersion());

handle('app:get-path', (event, name) => app.getPath(name));

// Window Controls
handle('window:minimize', () => {
    mainWindow?.minimize();
});
handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
        mainWindow?.unmaximize();
    } else {
        mainWindow?.maximize();
    }
});
handle('window:close', () => {
    mainWindow?.close();
});
handle('window:is-maximized', () => {
    return mainWindow?.isMaximized();
});

handle('window:toggle-maximize', () => {
    if (mainWindow?.isMaximized()) {
        mainWindow?.unmaximize();
    } else {
        mainWindow?.maximize();
    }
});

// File System Handlers
const { dialog } = require('electron');

let watcher: FSWatcher | null = null;

handle('fs:watch', (event, rootDir: string) => {
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

handle('fs:createFile', async (event, filePath: string) => {
    try {
        await fs.writeFile(filePath, '');
        return true;
    } catch (e) {
        return false;
    }
});

handle('fs:createDirectory', async (event, dirPath: string) => {
    try {
        await fs.mkdir(dirPath, { recursive: true });
        return true;
    } catch (e) {
        return false;
    }
});

handle('fs:delete', async (event, targetPath: string) => {
    try {
        await fse.remove(targetPath);
        return true;
    } catch (e) {
        return false;
    }
});

// Moves to the OS Trash / Recycle Bin, so a delete can be undone
handle('fs:trash', async (event, targetPath: string) => {
    try {
        await shell.trashItem(targetPath);
        return true;
    } catch (e) {
        return false;
    }
});

handle('fs:rename', async (event, oldPath: string, newPath: string) => {
    try {
        // fs.rename silently replaces an existing file; refuse instead
        // (a case-only rename on a case-insensitive disk is the same file)
        if (oldPath.toLowerCase() !== newPath.toLowerCase() && await fse.pathExists(newPath)) return false;
        await fs.rename(oldPath, newPath);
        return true;
    } catch (e) {
        return false;
    }
});

// Explorer paste: copy (or move) a file/folder into destDir. Never overwrites —
// a name clash gets a " copy" suffix like VS Code. Returns the new path or null.
handle('fs:pasteInto', async (event, srcPath: string, destDir: string, move: boolean) => {
    try {
        const name = path.basename(srcPath);
        if (move && path.join(destDir, name) === srcPath) return srcPath;
        // A folder can't be pasted inside itself
        if (destDir === srcPath || destDir.startsWith(srcPath + path.sep)) return null;

        const isDir = (await fs.stat(srcPath)).isDirectory();
        const ext = isDir ? '' : path.extname(name);
        const stem = name.slice(0, name.length - ext.length);
        let target = path.join(destDir, name);
        for (let n = 1; await fse.pathExists(target); n++) {
            target = path.join(destDir, `${stem} copy${n > 1 ? ` ${n}` : ''}${ext}`);
        }

        if (move) await fse.move(srcPath, target);
        else await fse.copy(srcPath, target, { overwrite: false, errorOnExist: true });
        return target;
    } catch (e) {
        return null;
    }
});

// The Run button on an HTML file: show it in the default browser. Limited to
// .html/.htm so this can never launch programs.
handle('shell:openHtml', async (event, targetPath: string) => {
    if (typeof targetPath !== 'string' || !/\.html?$/i.test(targetPath)) return 'Only .html files can be opened';
    return shell.openPath(targetPath);
});

handle('shell:showItemInFolder', (event, targetPath: string) => {
    shell.showItemInFolder(targetPath);
    return true;
});

handle('dialog:openFile', async () => {
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

handle('dialog:openDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow!, {
        properties: ['openDirectory']
    });
    if (canceled) return null;
    return filePaths[0];
});

handle('dialog:saveFile', async (event, content: string, defaultPath?: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow!, {
        defaultPath: defaultPath,
        filters: [{ name: 'All Files', extensions: ['*'] }]
    });
    if (canceled || !filePath) return null;
    await fs.writeFile(filePath, content, 'utf-8');
    return filePath;
});

// The `vylos` shell command
handle('cli:take-pending', async () => {
    await resolvingOpens;
    return pendingOpens.splice(0);
});

const showCommandResult = async (result: CommandResult) => {
    if (!mainWindow) return;
    await dialog.showMessageBox(mainWindow, {
        type: result.ok ? 'info' : 'warning',
        message: result.message,
        detail: result.detail,
    });
};

const offerShellCommand = async () => {
    if (!mainWindow || !await shouldOfferShellCommand()) return;
    const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        message: "Install the 'vylos' shell command?",
        detail: "Then run 'vylos .' in a terminal to open that folder in Vylos AI.\n\n"
            + "You can do this later from Terminal > Install 'vylos' Command in PATH.",
        buttons: ['Install', 'Not Now'],
        defaultId: 0,
        cancelId: 1,
    });
    if (response === 0) await showCommandResult(await installShellCommand());
};

handle('cli:install-command', async () => showCommandResult(await installShellCommand()));
handle('cli:uninstall-command', async () => showCommandResult(await uninstallShellCommand()));

handle('find:search', async (event, query: string, rootDir: string) => {
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
handle('fs:listAll', async (event, dirPath) => {
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

const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

handle('fs:list', async (event, dirPath) => {
    try {
        const dirents = await fs.readdir(dirPath, { withFileTypes: true });
        return dirents.map((dirent: any) => ({
            name: dirent.name,
            isDirectory: dirent.isDirectory(),
            path: require('path').join(dirPath, dirent.name)
        }))
            // Folders first, then natural name order (file2 before file10), like VS Code
            .sort((a, b) => a.isDirectory === b.isDirectory ? nameCollator.compare(a.name, b.name) : a.isDirectory ? -1 : 1);
    } catch (e) {
        console.error("FS List Error", e);
        return [];
    }
});

handle('fs:read', async (event, filePath) => {
    try {
        return await fs.readFile(filePath, 'utf-8');
    } catch (e) {
        return null;
    }
});

handle('fs:write', async (event, filePath, content) => {
    try {
        await fs.writeFile(filePath, content, 'utf-8');
        return true;
    } catch (e) {
        return false;
    }
});

// Git Handlers with isomorphic-git
import * as git from 'isomorphic-git';

handle('git:status', async (event, dir: string) => {
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

handle('git:stage', async (event, dir: string, filepath: string) => {
    try {
        await git.add({ fs: fse, dir, filepath });
        return true;
    } catch (e) {
        return false;
    }
});

handle('git:unstage', async (event, dir: string, filepath: string) => {
    try {
        await git.remove({ fs: fse, dir, filepath });
        return true;
    } catch (e) {
        // Fallback for reset if remove isn't what we want for unstage
        // isomorphic-git reset is complex, we might need a different approach
        return false;
    }
});

handle('git:stageAll', async (event, dir: string) => {
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

handle('git:unstageAll', async (event, dir: string) => {
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

handle('git:commit', async (event, dir: string, message: string) => {
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

handle('git:branch', async (event, dir: string) => {
    try {
        return await git.currentBranch({ fs: fse, dir });
    } catch (e) {
        return null;
    }
});

handle('git:push', async (event, dir: string) => {
    // Mock push for now as it requires auth/remote
    return new Promise(resolve => setTimeout(() => resolve(true), 1500));
});
