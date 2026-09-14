import { app, BrowserWindow } from 'electron';
// Named import on purpose: `autoUpdater` is a lazy getter that builds the
// platform updater on first access, which needs Electron's `app` to exist.
// Destructuring it at module scope would run that before the app is ready.
import { autoUpdater } from 'electron-updater';
import { handle } from './ipc';

/**
 * Mandatory updates.
 *
 * Vylos talks to versioned backend services (the Gemini Live protocol, the
 * curriculum feed, Supabase auth), so an out-of-date client is not a client
 * that merely lacks features — it is one that can break in ways the user
 * cannot diagnose. Any published update is therefore required: the renderer
 * shows a blocking gate and the app is unusable until it has been installed.
 */

// How often a long-running install re-checks. The startup check is the one that
// matters; this only catches installs that stay open for days.
const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export type UpdateStatus =
    | 'idle'          // no update known — the app is usable
    | 'checking'
    | 'available'     // update found; download starting
    | 'downloading'
    | 'downloaded'    // ready to install; the gate offers Restart & Update
    | 'error';

export interface UpdateState {
    status: UpdateStatus;
    /** The version being installed, once known */
    version: string | null;
    /** 0-100 while downloading */
    percent: number;
    message: string | null;
    /** True once an update exists: the renderer blocks the app on this alone */
    required: boolean;
    currentVersion: string;
}

let state: UpdateState = {
    status: 'idle',
    version: null,
    percent: 0,
    message: null,
    required: false,
    currentVersion: app.getVersion(),
};

let recheckTimer: NodeJS.Timeout | null = null;

function broadcast() {
    for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
            win.webContents.send('update:state', state);
        }
    }
}

function setState(patch: Partial<UpdateState>) {
    state = { ...state, ...patch };
    broadcast();
}

/**
 * An update that cannot be downloaded must not lock the user out — a broken
 * release feed or an offline machine would otherwise brick the app.
 */
function failOpen(message: string) {
    setState({ status: 'error', message, required: false, percent: 0 });
}

export function initUpdater() {
    // There is no release feed to check against in development, and
    // electron-updater refuses to run from an unpackaged app.
    if (!app.isPackaged) {
        registerHandlers();
        // The gate is production-only, so this is the only way to look at it
        // while developing: VYLOS_UPDATE_GATE=demo shows it mid-download,
        // VYLOS_UPDATE_GATE=ready shows it ready to install.
        const demo = process.env.VYLOS_UPDATE_GATE;
        if (demo === 'demo' || demo === 'ready') {
            setState({
                status: demo === 'ready' ? 'downloaded' : 'downloading',
                version: '0.2.0',
                percent: demo === 'ready' ? 100 : 42,
                required: true,
            });
        } else {
            setState({ status: 'idle', required: false });
        }
        return;
    }

    autoUpdater.autoDownload = true;
    // The gate is the only way out, so nothing should install behind its back
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.logger = null;

    autoUpdater.on('checking-for-update', () => {
        // Don't drop an already-required update back to a passable state
        if (!state.required) setState({ status: 'checking', message: null });
    });

    autoUpdater.on('update-not-available', () => {
        if (!state.required) setState({ status: 'idle', message: null });
    });

    autoUpdater.on('update-available', (info) => {
        setState({
            status: 'available',
            version: info.version ?? null,
            percent: 0,
            message: null,
            required: true,
        });
    });

    autoUpdater.on('download-progress', (progress) => {
        setState({
            status: 'downloading',
            percent: Math.max(0, Math.min(100, Math.round(progress.percent ?? 0))),
        });
    });

    autoUpdater.on('update-downloaded', (info) => {
        setState({
            status: 'downloaded',
            version: info.version ?? state.version,
            percent: 100,
            message: null,
            required: true,
        });
    });

    autoUpdater.on('error', (err) => {
        failOpen(err?.message || 'Could not reach the update service.');
    });

    registerHandlers();
    void checkForUpdates();

    recheckTimer = setInterval(() => {
        if (!state.required) void checkForUpdates();
    }, RECHECK_INTERVAL_MS);

    app.on('before-quit', () => {
        if (recheckTimer) clearInterval(recheckTimer);
        recheckTimer = null;
    });
}

async function checkForUpdates() {
    if (!app.isPackaged) return;
    try {
        await autoUpdater.checkForUpdates();
    } catch (e) {
        failOpen(e instanceof Error ? e.message : 'Update check failed.');
    }
}

function registerHandlers() {
    // The renderer asks for the current state on mount: the first check can
    // finish before the window is ready to receive broadcasts.
    handle('update:get-state', () => state);

    handle('update:check', async () => {
        await checkForUpdates();
        return state;
    });

    handle('update:install', () => {
        if (state.status !== 'downloaded') return false;
        // isSilent = false so the installer UI shows, isForceRunAfter = true so
        // the user lands back in Vylos instead of a closed app. The relaunch can
        // start before this process exits, so let go of the single-instance lock
        // first or it would hand off to this dying instance and quit.
        setImmediate(() => {
            app.releaseSingleInstanceLock();
            autoUpdater.quitAndInstall(false, true);
        });
        return true;
    });
}
