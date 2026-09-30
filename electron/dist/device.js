"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDeviceId = getDeviceId;
exports.initDevice = initDevice;
const electron_1 = require("electron");
const child_process_1 = require("child_process");
const crypto_1 = require("crypto");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const ipc_1 = require("./ipc");
/**
 * A stable id for this computer, used to limit how many accounts one device
 * can use (supabase/migrations/*_device_accounts.sql). It is a SHA-256 of the
 * operating system's own install id, so it survives reinstalling Vylos and the
 * raw id never leaves the machine. Someone with admin rights can change the
 * OS id, so this deters casual account farming; it is not proof of identity.
 */
const run = (cmd, args) => new Promise((resolve, reject) => (0, child_process_1.execFile)(cmd, args, { timeout: 5000, windowsHide: true }, (err, stdout) => (err ? reject(err) : resolve(stdout))));
async function osMachineId() {
    try {
        if (process.platform === 'linux') {
            for (const file of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
                const id = (await promises_1.default.readFile(file, 'utf-8').catch(() => '')).trim();
                if (id)
                    return id;
            }
        }
        else if (process.platform === 'win32') {
            const out = await run('reg', ['query', 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid']);
            return out.match(/MachineGuid\s+REG_SZ\s+([\w-]+)/i)?.[1] ?? null;
        }
        else if (process.platform === 'darwin') {
            const out = await run('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice']);
            return out.match(/"IOPlatformUUID"\s*=\s*"([\w-]+)"/)?.[1] ?? null;
        }
    }
    catch {
        // fall through to the stored id
    }
    return null;
}
/** Last resort when the OS has no readable id: a random id kept with the app's data. */
async function storedId() {
    const file = path_1.default.join(electron_1.app.getPath('userData'), 'device-id');
    const existing = (await promises_1.default.readFile(file, 'utf-8').catch(() => '')).trim();
    if (existing)
        return existing;
    const id = (0, crypto_1.randomUUID)();
    await promises_1.default.writeFile(file, id).catch(() => { });
    return id;
}
let deviceId = null;
function getDeviceId() {
    deviceId ?? (deviceId = (async () => {
        const raw = (await osMachineId()) ?? `stored:${await storedId()}`;
        return (0, crypto_1.createHash)('sha256').update(`vylos-device-v1:${raw}`).digest('hex');
    })());
    return deviceId;
}
function initDevice() {
    (0, ipc_1.handle)('device:id', () => getDeviceId());
}
