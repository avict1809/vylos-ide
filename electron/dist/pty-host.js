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
exports.registerPtyHandlers = registerPtyHandlers;
exports.disposeAllPtys = disposeAllPtys;
const electron_1 = require("electron");
const os_1 = __importDefault(require("os"));
const pty = __importStar(require("node-pty"));
const sessions = new Map();
let nextId = 1;
function defaultShell() {
    if (process.platform === 'win32') {
        return process.env.COMSPEC || 'powershell.exe';
    }
    // A login shell picks up the user's real PATH, aliases and prompt.
    return process.env.SHELL || '/bin/zsh';
}
function shellArgs() {
    if (process.platform === 'win32')
        return [];
    return ['-l'];
}
function registerPtyHandlers(getWindow) {
    electron_1.ipcMain.handle('pty:create', (_e, opts) => {
        const id = nextId++;
        const proc = pty.spawn(defaultShell(), shellArgs(), {
            name: 'xterm-256color',
            cols: opts.cols ?? 80,
            rows: opts.rows ?? 24,
            cwd: opts.cwd || os_1.default.homedir(),
            env: {
                ...process.env,
                // Tell programs they're on a capable terminal so they emit colour.
                TERM: 'xterm-256color',
                COLORTERM: 'truecolor',
                // Stop tools from paging into a viewer the user can't escape.
                PAGER: 'cat',
                GIT_PAGER: 'cat',
            },
        });
        const session = { proc, disposed: false };
        sessions.set(id, session);
        proc.onData((data) => {
            getWindow()?.webContents.send('pty:data', { id, data });
        });
        proc.onExit(({ exitCode, signal }) => {
            session.disposed = true;
            sessions.delete(id);
            getWindow()?.webContents.send('pty:exit', { id, exitCode, signal });
        });
        return id;
    });
    // Keystrokes go straight to the shell; the shell owns echo and line editing.
    electron_1.ipcMain.handle('pty:write', (_e, id, data) => {
        sessions.get(id)?.proc.write(data);
    });
    electron_1.ipcMain.handle('pty:resize', (_e, id, cols, rows) => {
        const session = sessions.get(id);
        if (!session || session.disposed)
            return;
        try {
            session.proc.resize(Math.max(1, cols), Math.max(1, rows));
        }
        catch {
            // The process can exit between the check and the resize.
        }
    });
    electron_1.ipcMain.handle('pty:kill', (_e, id) => {
        const session = sessions.get(id);
        if (!session)
            return;
        try {
            session.proc.kill();
        }
        catch {
            // Already gone.
        }
        sessions.delete(id);
    });
    electron_1.ipcMain.handle('pty:dispose-all', () => {
        for (const [id, session] of sessions) {
            try {
                session.proc.kill();
            }
            catch {
                // Already gone.
            }
            sessions.delete(id);
        }
    });
}
// Never leave orphaned shells behind when the app quits.
function disposeAllPtys() {
    for (const [, session] of sessions) {
        try {
            session.proc.kill();
        }
        catch {
            // Already gone.
        }
    }
    sessions.clear();
}
