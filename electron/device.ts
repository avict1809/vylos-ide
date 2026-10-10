import { app } from 'electron';
import { execFile } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { handle } from './ipc';

/**
 * A stable id for this computer, used to limit how many accounts one device
 * can use (supabase/migrations/*_device_accounts.sql). It is a SHA-256 of the
 * operating system's own install id, so it survives reinstalling Vylos and the
 * raw id never leaves the machine. Someone with admin rights can change the
 * OS id, so this deters casual account farming; it is not proof of identity.
 */

const run = (cmd: string, args: string[]) =>
    new Promise<string>((resolve, reject) =>
        execFile(cmd, args, { timeout: 5000, windowsHide: true }, (err, stdout) => (err ? reject(err) : resolve(stdout))));

async function osMachineId(): Promise<string | null> {
    try {
        if (process.platform === 'linux') {
            for (const file of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
                const id = (await fs.readFile(file, 'utf-8').catch(() => '')).trim();
                if (id) return id;
            }
        } else if (process.platform === 'win32') {
            const out = await run('reg', ['query', 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid']);
            return out.match(/MachineGuid\s+REG_SZ\s+([\w-]+)/i)?.[1] ?? null;
        } else if (process.platform === 'darwin') {
            const out = await run('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice']);
            return out.match(/"IOPlatformUUID"\s*=\s*"([\w-]+)"/)?.[1] ?? null;
        }
    } catch {
        // fall through to the stored id
    }
    return null;
}

/** Last resort when the OS has no readable id: a random id kept with the app's data. */
async function storedId(): Promise<string> {
    const file = path.join(app.getPath('userData'), 'device-id');
    const existing = (await fs.readFile(file, 'utf-8').catch(() => '')).trim();
    if (existing) return existing;
    const id = randomUUID();
    await fs.writeFile(file, id).catch(() => { });
    return id;
}

let deviceId: Promise<string> | null = null;

export function getDeviceId(): Promise<string> {
    deviceId ??= (async () => {
        const raw = (await osMachineId()) ?? `stored:${await storedId()}`;
        return createHash('sha256').update(`vylos-device-v1:${raw}`).digest('hex');
    })();
    return deviceId;
}

export function initDevice() {
    handle('device:id', () => getDeviceId());
}
