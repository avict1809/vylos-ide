import { app, BrowserWindow, shell } from 'electron';
import crypto from 'crypto';
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
import { initLocalAi } from './local-ai';
import { webUrl } from './site';
import {
    CommandResult, OpenRequest, detachFromTerminal, installShellCommand, launchArgs,
    printCliInfo, refreshShellCommand, resolveOpenRequests, shouldOfferShellCommand, uninstallShellCommand,
} from './cli';

let mainWindow: BrowserWindow | null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// The scheme the browser hands a finished sign-in back through:
// vylos://auth/callback. Registered below, the way Slack and VS Code do it, so
// the browser stays on the website instead of a raw 127.0.0.1 address.
const AUTH_SCHEME = 'vylos';
const isDeepLink = (arg: string) => arg.toLowerCase().startsWith(`${AUTH_SCHEME}://`);

// `vylos <path>` from a terminal (see cli.ts). `--help`, a terminal launch that
// relaunches itself detached, and a second `vylos` that hands its paths to the
// running app all quit here without making a window.
//
// A deep link arrives the same way — as a second launch, with the link in
// place of a path — so everything travels through the lock and is sorted out
// on the other side.
const launchArguments = launchArgs(process.argv);
const cliArgs = launchArguments.filter((arg) => !isDeepLink(arg));
const isPrimaryInstance = !printCliInfo(process.argv) && !detachFromTerminal()
    // Development skips the lock so it can run alongside an installed copy
    && (isDev || app.requestSingleInstanceLock({ args: launchArguments, cwd: process.cwd() }));

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
    const launched = args ?? launchArgs(argv);
    queueOpen(launched.filter((arg) => !isDeepLink(arg)), cwd ?? workingDirectory);
    // Windows and Linux deliver vylos://auth/callback as a launch like this one
    launched.filter(isDeepLink).forEach(handleAuthDeepLink);
    focusMainWindow();
});

// macOS hands the link to the running app instead of launching it again
app.on('open-url', (event, url) => {
    event.preventDefault();
    handleAuthDeepLink(url);
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
    initLocalAi();
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

// Auth: full web sign-in. The system browser opens the sign-in page on the
// Vylos website, which talks to Supabase (email + OAuth). When it has a
// session it hands it back to this app one of two ways:
//
//  1. vylos://auth/callback#<tokens> — the deep link, used whenever the OS
//     knows this app owns the scheme. The browser stays on vylos.co and shows
//     its own "you're signed in" page; the OS brings Vylos to the front. This
//     is the path Slack, VS Code and Zoom use, and the one learners see.
//  2. http://127.0.0.1:<port>/callback#<tokens> — the loopback fallback, for
//     installs where the scheme isn't registered (Linux without a desktop
//     entry, unpackaged development). Its page posts the tokens back here and
//     then sends the browser to the website, so even this path doesn't leave
//     anyone looking at an IP address.
//
// Either way the tokens ride in the fragment, which never reaches a server,
// and the random state proves the hand-off answers this sign-in rather than a
// page (or another app on this machine) that guessed the port.
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

/**
 * Claims vylos:// for this app. Unpackaged, the scheme has to name the Electron
 * binary and this project explicitly, or the OS would launch bare Electron.
 */
function registerAuthScheme(): boolean {
    try {
        if (!process.defaultApp) return app.setAsDefaultProtocolClient(AUTH_SCHEME);
        const entry = process.argv[1];
        return !!entry && app.setAsDefaultProtocolClient(AUTH_SCHEME, process.execPath, [path.resolve(entry)]);
    } catch {
        return false;
    }
}

const authSchemeRegistered = isPrimaryInstance && registerAuthScheme();

/**
 * Whether to ask the website for the deep-link hand-off. Windows and Linux
 * deliver the link as a fresh launch, which only reaches this window through
 * the single-instance lock — development skips that lock, so there the link
 * would start a second app instead. macOS delivers it to the running app
 * itself, lock or not.
 */
const deepLinkReady = () => authSchemeRegistered && (process.platform === 'darwin' || !isDev);

interface AuthResult {
    access_token?: string;
    refresh_token?: string;
    error?: string;
}

interface PendingAuth {
    expiresAt: number;
    // Cleared once the request it belongs to has been answered; the entry
    // itself lives on, so a later hand-off is still recognised.
    settle: ((result: AuthResult) => void) | null;
}

let authServer: http.Server | null = null;
// Shared by callers that arrive while the socket is still binding, so two
// quick clicks on Sign in don't race each other into EADDRINUSE.
let authServerStarting: Promise<void> | null = null;
const pendingAuth = new Map<string, PendingAuth>();

const closeAuthServer = () => {
    authServerStarting = null;
    if (authServer) {
        authServer.close();
        authServer = null;
    }
};

/** Drops every in-flight sign-in, answering any request still waiting. */
const clearPendingAuth = (result: AuthResult) => {
    for (const pending of pendingAuth.values()) pending.settle?.(result);
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

/** Where the browser is sent once the hand-off is done: back onto the website. */
const authReturnUrl = () => webUrl('/auth/desktop?signedin=1');

/**
 * The loopback fallback page. It posts the tokens to this app and then leaves
 * for the website, so nobody is left looking at a 127.0.0.1 address.
 */
const authCallbackPage = (returnUrl: string) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Vylos</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#000;color:#e5e5e5;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;text-align:center;padding:24px;box-sizing:border-box}
.card{max-width:360px}
.mark{width:44px;height:44px;margin:0 auto 20px;border-radius:14px;border:1px solid rgba(16,185,129,.35);background:rgba(16,185,129,.08);display:flex;align-items:center;justify-content:center;font-weight:800;font-style:italic;color:#10b981}
h1{font-size:18px;color:#fff;margin:0 0 8px}p{font-size:13px;color:#888;margin:0;line-height:1.6}b{color:#10b981}
</style></head><body><div class="card"><div class="mark">V</div><h1 id="t">Finishing sign-in…</h1><p id="m">One moment.</p></div>
<script>
var params = new URLSearchParams(location.hash.slice(1));
history.replaceState(null, '', '/callback');
function done(title, msg) { document.getElementById('t').textContent = title; document.getElementById('m').innerHTML = msg; }
fetch('/auth/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: params.get('access_token'), refresh_token: params.get('refresh_token'), state: params.get('state') })
}).then(function (res) {
    // Signed in: hand the tab back to the website rather than leave it here
    if (res.ok) location.replace(${JSON.stringify(returnUrl)});
    else done('Sign-in expired', 'Start again from the <b>Vylos</b> app.');
}).catch(function () {
    done('Could not reach Vylos', 'Is the app still running? Start sign-in again from <b>Vylos</b>.');
});
</script></body></html>`;

/**
 * Hands a finished sign-in to the app, however its tokens arrived. False means
 * the state is not one this app is waiting for — a stale tab, a link opened
 * tomorrow, or a page that guessed the port.
 */
function completeAuth(accessToken: unknown, refreshToken: unknown, state: unknown): boolean {
    dropExpiredAuth();
    const pending = typeof state === 'string' ? pendingAuth.get(state) : undefined;
    if (!pending || typeof accessToken !== 'string' || typeof refreshToken !== 'string') return false;
    pendingAuth.delete(state as string);

    // Bring the app back to the front
    focusMainWindow();
    const tokens = { access_token: accessToken, refresh_token: refreshToken };
    if (pending.settle) pending.settle(tokens);
    // The sign-in screen stopped waiting for this one, so hand it over out of
    // band rather than making them sign in a second time.
    else mainWindow?.webContents.send('auth:completed', tokens);
    return true;
}

/**
 * A vylos://auth/callback link from the browser. It carries the same tokens
 * and state the loopback page posts, in the same fragment, so both ways in
 * meet at completeAuth.
 */
function handleAuthDeepLink(rawUrl: string): boolean {
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        return false;
    }
    if (url.protocol !== `${AUTH_SCHEME}:` || url.host !== 'auth') return false;
    if (url.pathname.replace(/\/+$/, '') !== '/callback') return false;

    const params = new URLSearchParams(url.hash.slice(1) || url.search.slice(1));
    return completeAuth(params.get('access_token'), params.get('refresh_token'), params.get('state'));
}

const handleAuthRequest = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${AUTH_PORT}`);

    try {
        if (req.method === 'GET' && url.pathname === '/callback') {
            res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' })
                .end(authCallbackPage(authReturnUrl()));
        } else if (req.method === 'POST' && url.pathname === '/auth/complete') {
            const { access_token, refresh_token, state } = JSON.parse(await readBody(req));
            // An unknown state turns into "Sign-in expired" on the page
            const ok = completeAuth(access_token, refresh_token, state);
            res.writeHead(ok ? 200 : 400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok }));
        } else {
            res.writeHead(404).end();
        }
    } catch (e) {
        res.writeHead(500).end();
    }
};

/** Brings the callback listener up, or resolves straight away if it's already up. */
const startAuthServer = () => {
    if (authServer?.listening) return Promise.resolve();
    if (authServerStarting) return authServerStarting;

    authServerStarting = new Promise<void>((resolve, reject) => {
        const server = http.createServer(handleAuthRequest);
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

app.on('will-quit', closeAuthServer);

handle('auth:signInViaBrowser', async (event, options?: { mode?: string }) => {
    // Supersede any in-flight attempt: whatever tab it opened must not sign
    // this app in behind the one we're about to start.
    clearPendingAuth({ error: 'cancelled' });

    try {
        await startAuthServer();
    } catch (e) {
        const err = e as NodeJS.ErrnoException;
        return {
            error: err.code === 'EADDRINUSE'
                ? `Port ${AUTH_PORT} is already in use by another program.`
                : err.message,
        };
    }

    const state = crypto.randomBytes(24).toString('hex');
    const signInUrl = new URL(webUrl('/auth/desktop'));
    signInUrl.searchParams.set('port', String(AUTH_PORT));
    signInUrl.searchParams.set('state', state);
    signInUrl.searchParams.set('mode', options?.mode === 'signup' ? 'signup' : 'signin');
    // Tells the page it can hand the session straight to this app, so the
    // browser never has to visit the loopback address at all
    if (deepLinkReady()) signInUrl.searchParams.set('deeplink', AUTH_SCHEME);

    return new Promise<AuthResult>((resolve) => {
        const entry: PendingAuth = { expiresAt: Date.now() + AUTH_STATE_TTL_MS, settle: null };
        let settled = false;
        entry.settle = (result) => {
            if (settled) return;
            settled = true;
            entry.settle = null;
            clearTimeout(timer);
            resolve(result);
        };
        // Stops the sign-in screen waiting. The entry stays behind, valid
        // until its TTL, so finishing in the browser later still works.
        const timer = setTimeout(() => entry.settle?.({ error: 'timeout' }), AUTH_WAIT_MS);

        pendingAuth.set(state, entry);
        shell.openExternal(signInUrl.toString());
    });
});

handle('auth:cancel', () => {
    // The listener stays up; with no pending state it can't sign anyone in.
    clearPendingAuth({ error: 'cancelled' });
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
