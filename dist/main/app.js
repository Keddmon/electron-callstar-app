"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
// src/main/app.ts
const electron_1 = require("electron");
const path_1 = require("path");
const cid_adapter_1 = require("./cid/cid-adapter");
const register_cid_ipc_1 = require("./ipc/register-cid.ipc");
const isDev = !!process.env.ELECTRON_DEV_SERVER_URL;
let win = null;
async function createApp() {
    await electron_1.app.whenReady();
    win = new electron_1.BrowserWindow({
        width: 1200,
        height: 800,
        // 디버깅 동안엔 show: true 권장. (문제 해결 후 false로 되돌려도 됨)
        show: true,
        webPreferences: {
            preload: (0, path_1.join)(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    const adapter = new cid_adapter_1.CidAdapter();
    (0, register_cid_ipc_1.registerCidIpc)(adapter, win);
    // 로딩 상태 로깅
    win.webContents.on('did-finish-load', () => {
        console.log('[electron] did-finish-load');
        if (!win.isVisible())
            win.show();
    });
    win.webContents.on('did-fail-load', (_e, code, desc, url) => {
        console.error('[electron] did-fail-load:', { code, desc, url });
    });
    try {
        if (isDev && process.env.ELECTRON_DEV_SERVER_URL) {
            console.log('[electron] loadURL ->', process.env.ELECTRON_DEV_SERVER_URL);
            await win.loadURL(process.env.ELECTRON_DEV_SERVER_URL);
            // 필요하면 열고, 불편하면 주석
            // win.webContents.openDevTools({ mode: 'detach' });
        }
        else {
            const indexHtml = (0, path_1.join)(__dirname, '../renderer/index.html');
            console.log('[electron] loadFile ->', indexHtml);
            await win.loadFile(indexHtml);
        }
    }
    catch (err) {
        console.error('[electron] load error:', err);
    }
    // ready-to-show는 보조로만
    win.once('ready-to-show', () => win?.show());
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createApp();
    });
    electron_1.app.on('window-all-closed', () => {
        if (process.platform !== 'darwin')
            electron_1.app.quit();
    });
}
//# sourceMappingURL=app.js.map