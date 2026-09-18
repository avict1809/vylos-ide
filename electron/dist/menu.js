"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAppMenu = buildAppMenu;
const electron_1 = require("electron");
// Menu items send an action id to the renderer, which owns the actual IDE
// behaviour (see the menu:action listener in app/components/TitleBar.tsx).
// Ported from vylos/electron/menu.js.
function buildAppMenu(getWindow) {
    const isMac = process.platform === 'darwin';
    const action = (label, id, accelerator) => ({
        label,
        accelerator,
        click: (_item, win) => {
            const target = win || getWindow();
            if (target && !target.isDestroyed())
                target.webContents.send('menu:action', id);
        }
    });
    const template = [
        ...(isMac
            ? [{
                    label: electron_1.app.name,
                    submenu: [
                        { role: 'about', label: `About ${electron_1.app.name}` },
                        { type: 'separator' },
                        action('Settings…', 'settings', 'CmdOrCtrl+,'),
                        { type: 'separator' },
                        { role: 'services' },
                        { type: 'separator' },
                        { role: 'hide', label: `Hide ${electron_1.app.name}` },
                        { role: 'hideOthers' },
                        { role: 'unhide' },
                        { type: 'separator' },
                        { role: 'quit', label: `Quit ${electron_1.app.name}` }
                    ]
                }]
            : []),
        {
            label: 'File',
            submenu: [
                action('New File', 'new-file', 'CmdOrCtrl+N'),
                action('Open File…', 'open-file', 'CmdOrCtrl+O'),
                action('Open Folder…', 'open-folder', 'CmdOrCtrl+Shift+O'),
                { type: 'separator' },
                action('Save', 'save', 'CmdOrCtrl+S'),
                action('Save As…', 'save-as', 'CmdOrCtrl+Shift+S'),
                { type: 'separator' },
                action('Close Tab', 'close-tab', 'CmdOrCtrl+W'),
                ...(isMac
                    ? []
                    : [
                        { type: 'separator' },
                        action('Settings', 'settings', 'CmdOrCtrl+,'),
                        { role: 'quit' }
                    ])
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' },
                { type: 'separator' },
                action('Find', 'find', 'CmdOrCtrl+F'),
                action('Replace', 'replace', 'CmdOrCtrl+H')
            ]
        },
        {
            label: 'View',
            submenu: [
                action('Command Palette…', 'command-palette', 'CmdOrCtrl+Shift+P'),
                action('Go to File…', 'quick-open', 'CmdOrCtrl+P'),
                { type: 'separator' },
                action('Explorer', 'view-explorer', 'CmdOrCtrl+Shift+E'),
                action('Search', 'view-search', 'CmdOrCtrl+Shift+F'),
                action('Learning Path', 'view-learning', 'CmdOrCtrl+Shift+L'),
                action('Challenges', 'view-challenges'),
                action('Vylos AI', 'view-ai', 'CmdOrCtrl+Shift+I'),
                action('Source Control', 'view-git'),
                { type: 'separator' },
                action('Toggle Terminal', 'toggle-terminal', 'CmdOrCtrl+`'),
                action('Toggle Web Browser', 'toggle-browser', 'CmdOrCtrl+Shift+B'),
                action('Toggle Voice Tutor', 'toggle-voice', 'CmdOrCtrl+L'),
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' },
                {
                    label: 'Developer',
                    submenu: [
                        { role: 'reload' },
                        { role: 'forceReload' },
                        { role: 'toggleDevTools' }
                    ]
                }
            ]
        },
        {
            label: 'Window',
            submenu: isMac
                ? [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
                : [{ role: 'minimize' }, { role: 'close' }]
        },
        {
            label: 'Help',
            submenu: [
                action('Keyboard Shortcuts', 'help', 'CmdOrCtrl+Shift+H'),
                action('About Vylos', 'about')
            ]
        }
    ];
    electron_1.Menu.setApplicationMenu(electron_1.Menu.buildFromTemplate(template));
}
