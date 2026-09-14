import { app, ipcMain, IpcMainInvokeEvent } from 'electron';

// Development and unpackaged runs load the Next.js dev server; packaged builds
// load the static export through electron-serve's app:// scheme.
const DEV_ORIGIN = 'http://localhost:3000';

/** True for the Vylos app page itself, never for other sites. */
export function isAppUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'app:' || (!app.isPackaged && parsed.origin === DEV_ORIGIN);
    } catch {
        return false;
    }
}

/**
 * ipcMain.handle for privileged channels: only the app's own top-level page
 * may call them. Embedded frames (such as future extension webviews) and any
 * page the window was navigated to are refused, so they can never reach the
 * file system or the terminal.
 */
export function handle(
    channel: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listener: (event: IpcMainInvokeEvent, ...args: any[]) => unknown
) {
    ipcMain.handle(channel, (event, ...args) => {
        const frame = event.senderFrame;
        if (!frame || frame.parent || !isAppUrl(frame.url)) {
            throw new Error(`Blocked "${channel}" from ${frame?.url ?? 'an unknown sender'}`);
        }
        return listener(event, ...args);
    });
}
