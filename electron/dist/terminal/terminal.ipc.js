"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupTerminalIPC = setupTerminalIPC;
const electron_1 = require("electron");
const pty_service_1 = require("./pty.service");
let ptyServiceInstance = null;
function setupTerminalIPC() {
    electron_1.ipcMain.on('terminal:create', (event) => {
        const sender = event.sender;
        // Single instance for now, can be expanded to map (id -> service) for tabs
        if (!ptyServiceInstance) {
            ptyServiceInstance = new pty_service_1.PtyService();
        }
        // Kill existing if any (simplification for "one terminal" rule to avoid leaks)
        ptyServiceInstance.kill();
        ptyServiceInstance.spawn((data) => {
            try {
                if (!sender.isDestroyed()) {
                    sender.send('terminal:data', data);
                }
            }
            catch (e) {
                console.error('Failed to send terminal data:', e);
            }
        });
    });
    electron_1.ipcMain.on('terminal:write', (_event, data) => {
        ptyServiceInstance?.write(data);
    });
    electron_1.ipcMain.on('terminal:resize', (_event, { cols, rows }) => {
        ptyServiceInstance?.resize(cols, rows);
    });
}
