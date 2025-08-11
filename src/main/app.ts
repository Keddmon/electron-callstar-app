// src/main/app.ts
import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { CidAdapter } from './cid/cid-adapter';
import { registerCidIpc } from './ipc/register-cid.ipc';

const isDev = !!process.env.ELECTRON_DEV_SERVER_URL;

let win: BrowserWindow | null = null;

export async function createApp() {
    await app.whenReady();

    const prelaodPath = app.isPackaged
        ? path.join(process.resourcesPath, 'app', 'dist', 'main', 'preload.js')
        : path.join(app.getAppPath(), 'dist', 'main', 'preload.js');

    win = new BrowserWindow({
        width: 1200,
        height: 800,
        // 디버깅 동안엔 show: true 권장. (문제 해결 후 false로 되돌려도 됨)
        show: true,
        webPreferences: {
            preload: prelaodPath,
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    const adapter = new CidAdapter();
    registerCidIpc(adapter, win);

    // 로딩 상태 로깅
    win.webContents.on('did-finish-load', () => {
        console.log('[electron] did-finish-load');
        if (!win!.isVisible()) win!.show();
    });
    win.webContents.on('did-fail-load', (_e, code, desc, url) => {
        console.error('[electron] did-fail-load:', { code, desc, url });
    });

    // try {
    //     if (isDev && process.env.ELECTRON_DEV_SERVER_URL) {
    //         console.log('[electron] loadURL ->', process.env.ELECTRON_DEV_SERVER_URL);
    //         await win.loadURL(process.env.ELECTRON_DEV_SERVER_URL);
    //         // 필요하면 열고, 불편하면 주석
    //         // win.webContents.openDevTools({ mode: 'detach' });
    //     } else {
    //         const indexHtml = join(__dirname, '../renderer/index.html');
    //         console.log('[electron] loadFile ->', indexHtml);
    //         await win.loadFile(indexHtml);
    //     }
    // } catch (err) {
    //     console.error('[electron] load error:', err);
    // }

    // 개발 모드: CRA dev server
    if (process.env.ELECTRON_DEV_SERVER_URL) {
        await win.loadURL(process.env.ELECTRON_DEV_SERVER_URL);
        win.webContents.openDevTools({ mode: 'detach' });
    } else {
        await win.loadFile(path.join(app.getAppPath(), 'dist', 'renderer', 'index.html'));
    }

    // ready-to-show는 보조로만
    win.once('ready-to-show', () => win?.show());

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createApp();
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit();
    });
}