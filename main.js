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
const crypto_1 = __importDefault(require("crypto"));
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const chokidar_1 = __importDefault(require("chokidar"));
const promises_1 = __importDefault(require("fs/promises"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const electron_serve_1 = __importDefault(require("electron-serve"));
const updater_1 = require("./updater");
const ipc_1 = require("./ipc");
const extensions_1 = require("./extensions");
const device_1 = require("./device");
const terminal_1 = require("./terminal");
const site_1 = require("./site");
const cli_1 = require("./cli");
let mainWindow;
const isDev = process.env.NODE_ENV === 'development' || !electron_1.app.isPackaged;
// `vylos <path>` from a terminal (see cli.ts). `--help`, a terminal launch that
// relaunches itself detached, and a second `vylos` that hands its paths to the
// running app all quit here without making a window.
const cliArgs = (0, cli_1.launchArgs)(process.argv);
const isPrimaryInstance = !(0, cli_1.printCliInfo)(process.argv) && !(0, cli_1.detachFromTerminal)()
    // Development skips the lock so it can run alongside an installed copy
    && (isDev || electron_1.app.requestSingleInstanceLock({ args: cliArgs, cwd: process.cwd() }));
if (!isPrimaryInstance)
    electron_1.app.quit();
const focusMainWindow = () => {
    if (!mainWindow)
        return;
    if (mainWindow.isMinimized())
        mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
};
// Paths to open wait here until the renderer collects them: the window may
// still be loading when they arrive.
const pendingOpens = [];
let resolvingOpens = Promise.resolve();
const queueOpen = (args, cwd) => {
    if (args.length === 0)
        return;
    resolvingOpens = resolvingOpens.then(async () => {
        pendingOpens.push(...await (0, cli_1.resolveOpenRequests)(args, cwd));
        mainWindow?.webContents.send('cli:open-requested');
    });
};
if (isPrimaryInstance)
    queueOpen(cliArgs, process.cwd());
electron_1.app.on('second-instance', (_event, argv, workingDirectory, data) => {
    const { args, cwd } = (data ?? {});
    queueOpen(args ?? (0, cli_1.launchArgs)(argv), cwd ?? workingDirectory);
    focusMainWindow();
});
// CRITICAL: Initialize electron-serve at module level BEFORE app.whenReady()
// This registers the 'app://' protocol handler early enough for it to work
const loadURL = isDev ? null : (0, electron_serve_1.default)({
    directory: 'out',
    scheme: 'app'
});
const openInBrowser = (url) => {
    if (/^https?:\/\//i.test(url))
        void electron_1.shell.openExternal(url);
};
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
    }
    else {
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
        if ((0, ipc_1.isAppUrl)(url))
            return;
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
if (isPrimaryInstance)
    electron_1.app.whenReady().then(async () => {
        // Before the window: the page asks for these as soon as it mounts
        (0, extensions_1.initExtensions)(() => mainWindow);
        (0, terminal_1.initTerminal)(() => mainWindow);
        (0, device_1.initDevice)();
        await createWindow();
        // Checks for a mandatory update; the renderer blocks the app until it is applied
        (0, updater_1.initUpdater)();
        void (0, cli_1.refreshShellCommand)();
        void offerShellCommand();
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
// Auth: full web sign-in. The system browser opens the sign-in page on the
// Vylos website, which talks to Supabase (email + OAuth). When it has a
// session it sends the browser to /callback on this localhost server, with the
// tokens in the URL fragment; the callback page POSTs them to /auth/complete.
// A fragment never leaves the browser, and the random state proves the
// hand-off answers this sign-in rather than a page that guessed the port.
//
// The listener stays up for the life of the app. Signing in can easily take
// longer than the app is willing to show a spinner for — a password reset, a
// confirmation email, an OAuth detour — and tearing the listener down on a
// timer meant the browser arrived at a refused port with the tokens sitting in
// the URL bar and nothing to explain it. What keeps the hand-off safe is the
// random state, not a short window, so the state outlives the wait instead.
const AUTH_PORT = 51735;
// How long the sign-in screen waits before it stops blocking on the browser.
// A hand-off after this is still accepted; it just arrives as an event rather
// than as the answer to the pending request.
const AUTH_WAIT_MS = 10 * 60 * 1000;
// When a state stops being accepted at all, so a link left open overnight
// can't sign this app in tomorrow.
const AUTH_STATE_TTL_MS = 60 * 60 * 1000;
let authServer = null;
// Shared by callers that arrive while the socket is still binding, so two
// quick clicks on Sign in don't race each other into EADDRINUSE.
let authServerStarting = null;
const pendingAuth = new Map();
const closeAuthServer = () => {
    authServerStarting = null;
    if (authServer) {
        authServer.close();
        authServer = null;
    }
};
/** Drops every in-flight sign-in, answering any request still waiting. */
const clearPendingAuth = (result) => {
    for (const pending of pendingAuth.values())
        pending.settle?.(result);
    pendingAuth.clear();
};
const dropExpiredAuth = () => {
    const now = Date.now();
    for (const [state, pending] of pendingAuth) {
        if (pending.expiresAt < now) {
            pending.settle?.({ error: 'timeout' });
            pendingAuth.delete(state);
        }
    }
};
const readBody = (req) => new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 64 * 1024)
            reject(new Error('Body too large'));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
});
const AUTH_CALLBACK_PAGE = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Vylos</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#000;color:#e5e5e5;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;text-align:center;padding:24px;box-sizing:border-box}
h1{font-size:18px;color:#fff;margin:0 0 8px}p{font-size:13px;color:#888;margin:0;line-height:1.5}b{color:#10b981}
</style></head><body><div><h1 id="t">Finishing sign-in…</h1><p id="m">One moment.</p></div>
<script>
var params = new URLSearchParams(location.hash.slice(1));
history.replaceState(null, '', '/callback');
function done(title, msg) { document.getElementById('t').textContent = title; document.getElementById('m').innerHTML = msg; }
fetch('/auth/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: params.get('access_token'), refresh_token: params.get('refresh_token'), state: params.get('state') })
}).then(function (res) {
    if (res.ok) done("You're signed in", 'You can close this tab and return to <b>Vylos</b>.');
    else done('Sign-in expired', 'Start again from the <b>Vylos</b> app.');
}).catch(function () {
    done('Could not reach Vylos', 'Is the app still running? Start sign-in again from <b>Vylos</b>.');
});
</script></body></html>`;
const handleAuthRequest = async (req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${AUTH_PORT}`);
    try {
        if (req.method === 'GET' && url.pathname === '/callback') {
            res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' })
                .end(AUTH_CALLBACK_PAGE);
        }
        else if (req.method === 'POST' && url.pathname === '/auth/complete') {
            dropExpiredAuth();
            const { access_token, refresh_token, state } = JSON.parse(await readBody(req));
            const pending = typeof state === 'string' ? pendingAuth.get(state) : undefined;
            // An unknown state is a stale tab or a page that guessed the port;
            // the callback page turns this into "Sign-in expired".
            if (!pending || typeof access_token !== 'string' || typeof refresh_token !== 'string') {
                res.writeHead(400, { 'Content-Type': 'application/json' }).end('{"ok":false}');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
            pendingAuth.delete(state);
            // Bring the app back to the front
            focusMainWindow();
            if (pending.settle)
                pending.settle({ access_token, refresh_token });
            // The sign-in screen stopped waiting for this one, so hand it over
            // out of band rather than making them sign in a second time.
            else
                mainWindow?.webContents.send('auth:completed', { access_token, refresh_token });
        }
        else {
            res.writeHead(404).end();
        }
    }
    catch (e) {
        res.writeHead(500).end();
    }
};
/** Brings the callback listener up, or resolves straight away if it's already up. */
const startAuthServer = () => {
    if (authServer?.listening)
        return Promise.resolve();
    if (authServerStarting)
        return authServerStarting;
    authServerStarting = new Promise((resolve, reject) => {
        const server = http_1.default.createServer(handleAuthRequest);
        let listening = false;
        server.on('error', (e) => {
            if (!listening) {
                authServerStarting = null;
                authServer = null;
                reject(e);
                return;
            }
            // The socket died under us. Drop it so the next sign-in opens a
            // fresh one instead of sending the browser to a dead port.
            authServerStarting = null;
            authServer = null;
            server.close();
        });
        server.listen(AUTH_PORT, '127.0.0.1', () => {
            listening = true;
            authServer = server;
            resolve();
        });
    });
    return authServerStarting;
};
electron_1.app.on('will-quit', closeAuthServer);
(0, ipc_1.handle)('auth:signInViaBrowser', async (event, options) => {
    // Supersede any in-flight attempt: whatever tab it opened must not sign
    // this app in behind the one we're about to start.
    clearPendingAuth({ error: 'cancelled' });
    try {
        await startAuthServer();
    }
    catch (e) {
        const err = e;
        return {
            error: err.code === 'EADDRINUSE'
                ? `Port ${AUTH_PORT} is already in use by another program.`
                : err.message,
        };
    }
    const state = crypto_1.default.randomBytes(24).toString('hex');
    const signInUrl = new URL((0, site_1.webUrl)('/auth/desktop'));
    signInUrl.searchParams.set('port', String(AUTH_PORT));
    signInUrl.searchParams.set('state', state);
    signInUrl.searchParams.set('mode', options?.mode === 'signup' ? 'signup' : 'signin');
    return new Promise((resolve) => {
        const entry = { expiresAt: Date.now() + AUTH_STATE_TTL_MS, settle: null };
        let settled = false;
        entry.settle = (result) => {
            if (settled)
                return;
            settled = true;
            entry.settle = null;
            clearTimeout(timer);
            resolve(result);
        };
        // Stops the sign-in screen waiting. The entry stays behind, valid
        // until its TTL, so finishing in the browser later still works.
        const timer = setTimeout(() => entry.settle?.({ error: 'timeout' }), AUTH_WAIT_MS);
        pendingAuth.set(state, entry);
        electron_1.shell.openExternal(signInUrl.toString());
    });
});
(0, ipc_1.handle)('auth:cancel', () => {
    // The listener stays up; with no pending state it can't sign anyone in.
    clearPendingAuth({ error: 'cancelled' });
    return true;
});
// IPC Handlers will be added here
(0, ipc_1.handle)('app:get-version', () => electron_1.app.getVersion());
(0, ipc_1.handle)('app:get-path', (event, name) => electron_1.app.getPath(name));
// Window Controls
(0, ipc_1.handle)('window:minimize', () => {
    mainWindow?.minimize();
});
(0, ipc_1.handle)('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
        mainWindow?.unmaximize();
    }
    else {
        mainWindow?.maximize();
    }
});
(0, ipc_1.handle)('window:close', () => {
    mainWindow?.close();
});
(0, ipc_1.handle)('window:is-maximized', () => {
    return mainWindow?.isMaximized();
});
(0, ipc_1.handle)('window:toggle-maximize', () => {
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
(0, ipc_1.handle)('fs:watch', (event, rootDir) => {
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
(0, ipc_1.handle)('fs:createFile', async (event, filePath) => {
    try {
        await promises_1.default.writeFile(filePath, '');
        return true;
    }
    catch (e) {
        return false;
    }
});
(0, ipc_1.handle)('fs:createDirectory', async (event, dirPath) => {
    try {
        await promises_1.default.mkdir(dirPath, { recursive: true });
        return true;
    }
    catch (e) {
        return false;
    }
});
(0, ipc_1.handle)('fs:delete', async (event, targetPath) => {
    try {
        await fs_extra_1.default.remove(targetPath);
        return true;
    }
    catch (e) {
        return false;
    }
});
// Moves to the OS Trash / Recycle Bin, so a delete can be undone
(0, ipc_1.handle)('fs:trash', async (event, targetPath) => {
    try {
        await electron_1.shell.trashItem(targetPath);
        return true;
    }
    catch (e) {
        return false;
    }
});
(0, ipc_1.handle)('fs:rename', async (event, oldPath, newPath) => {
    try {
        // fs.rename silently replaces an existing file; refuse instead
        // (a case-only rename on a case-insensitive disk is the same file)
        if (oldPath.toLowerCase() !== newPath.toLowerCase() && await fs_extra_1.default.pathExists(newPath))
            return false;
        await promises_1.default.rename(oldPath, newPath);
        return true;
    }
    catch (e) {
        return false;
    }
});
// Explorer paste: copy (or move) a file/folder into destDir. Never overwrites —
// a name clash gets a " copy" suffix like VS Code. Returns the new path or null.
(0, ipc_1.handle)('fs:pasteInto', async (event, srcPath, destDir, move) => {
    try {
        const name = path_1.default.basename(srcPath);
        if (move && path_1.default.join(destDir, name) === srcPath)
            return srcPath;
        // A folder can't be pasted inside itself
        if (destDir === srcPath || destDir.startsWith(srcPath + path_1.default.sep))
            return null;
        const isDir = (await promises_1.default.stat(srcPath)).isDirectory();
        const ext = isDir ? '' : path_1.default.extname(name);
        const stem = name.slice(0, name.length - ext.length);
        let target = path_1.default.join(destDir, name);
        for (let n = 1; await fs_extra_1.default.pathExists(target); n++) {
            target = path_1.default.join(destDir, `${stem} copy${n > 1 ? ` ${n}` : ''}${ext}`);
        }
        if (move)
            await fs_extra_1.default.move(srcPath, target);
        else
            await fs_extra_1.default.copy(srcPath, target, { overwrite: false, errorOnExist: true });
        return target;
    }
    catch (e) {
        return null;
    }
});
// The Run button on an HTML file: show it in the default browser. Limited to
// .html/.htm so this can never launch programs.
(0, ipc_1.handle)('shell:openHtml', async (event, targetPath) => {
    if (typeof targetPath !== 'string' || !/\.html?$/i.test(targetPath))
        return 'Only .html files can be opened';
    return electron_1.shell.openPath(targetPath);
});
(0, ipc_1.handle)('shell:showItemInFolder', (event, targetPath) => {
    electron_1.shell.showItemInFolder(targetPath);
    return true;
});
(0, ipc_1.handle)('dialog:openFile', async () => {
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
(0, ipc_1.handle)('dialog:openDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    if (canceled)
        return null;
    return filePaths[0];
});
(0, ipc_1.handle)('dialog:saveFile', async (event, content, defaultPath) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        defaultPath: defaultPath,
        filters: [{ name: 'All Files', extensions: ['*'] }]
    });
    if (canceled || !filePath)
        return null;
    await promises_1.default.writeFile(filePath, content, 'utf-8');
    return filePath;
});
// The `vylos` shell command
(0, ipc_1.handle)('cli:take-pending', async () => {
    await resolvingOpens;
    return pendingOpens.splice(0);
});
const showCommandResult = async (result) => {
    if (!mainWindow)
        return;
    await dialog.showMessageBox(mainWindow, {
        type: result.ok ? 'info' : 'warning',
        message: result.message,
        detail: result.detail,
    });
};
const offerShellCommand = async () => {
    if (!mainWindow || !await (0, cli_1.shouldOfferShellCommand)())
        return;
    const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        message: "Install the 'vylos' shell command?",
        detail: "Then run 'vylos .' in a terminal to open that folder in Vylos AI.\n\n"
            + "You can do this later from Terminal > Install 'vylos' Command in PATH.",
        buttons: ['Install', 'Not Now'],
        defaultId: 0,
        cancelId: 1,
    });
    if (response === 0)
        await showCommandResult(await (0, cli_1.installShellCommand)());
};
(0, ipc_1.handle)('cli:install-command', async () => showCommandResult(await (0, cli_1.installShellCommand)()));
(0, ipc_1.handle)('cli:uninstall-command', async () => showCommandResult(await (0, cli_1.uninstallShellCommand)()));
(0, ipc_1.handle)('find:search', async (event, query, rootDir) => {
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
(0, ipc_1.handle)('fs:listAll', async (event, dirPath) => {
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
const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
(0, ipc_1.handle)('fs:list', async (event, dirPath) => {
    try {
        const dirents = await promises_1.default.readdir(dirPath, { withFileTypes: true });
        return dirents.map((dirent) => ({
            name: dirent.name,
            isDirectory: dirent.isDirectory(),
            path: require('path').join(dirPath, dirent.name)
        }))
            // Folders first, then natural name order (file2 before file10), like VS Code
            .sort((a, b) => a.isDirectory === b.isDirectory ? nameCollator.compare(a.name, b.name) : a.isDirectory ? -1 : 1);
    }
    catch (e) {
        console.error("FS List Error", e);
        return [];
    }
});
(0, ipc_1.handle)('fs:read', async (event, filePath) => {
    try {
        return await promises_1.default.readFile(filePath, 'utf-8');
    }
    catch (e) {
        return null;
    }
});
(0, ipc_1.handle)('fs:write', async (event, filePath, content) => {
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
(0, ipc_1.handle)('git:status', async (event, dir) => {
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
(0, ipc_1.handle)('git:stage', async (event, dir, filepath) => {
    try {
        await git.add({ fs: fs_extra_1.default, dir, filepath });
        return true;
    }
    catch (e) {
        return false;
    }
});
(0, ipc_1.handle)('git:unstage', async (event, dir, filepath) => {
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
(0, ipc_1.handle)('git:stageAll', async (event, dir) => {
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
(0, ipc_1.handle)('git:unstageAll', async (event, dir) => {
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
(0, ipc_1.handle)('git:commit', async (event, dir, message) => {
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
(0, ipc_1.handle)('git:branch', async (event, dir) => {
    try {
        return await git.currentBranch({ fs: fs_extra_1.default, dir });
    }
    catch (e) {
        return null;
    }
});
(0, ipc_1.handle)('git:push', async (event, dir) => {
    // Mock push for now as it requires auth/remote
    return new Promise(resolve => setTimeout(() => resolve(true), 1500));
});
