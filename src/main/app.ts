/**
 * 애플리케이션 설정
 * --
 */
import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import logger from './logs/logger';

/** 어댑터 */
import { CidAdapter } from './cid/cid.adapter';

/** IPC */
import { registerCidIpc } from './ipc/register-cid.ipc';
import { registerSettingsIpc } from './ipc/register-settings.ipc';
import { registerNetworkIpc } from './ipc/register-network.ipc';

/** Constant */
const DEV_URL = process.env.ELECTRON_DEV_SERVER_URL;
const START_URL = process.env.START_URL || '';

export async function createApp() {
    logger.info('[app] Create App: Application starting...');
    await app.whenReady();

    const preloadPath = path.resolve(__dirname, 'preload.js');
    logger.debug(`[app] preloadPath = ${preloadPath}, exists? = ${fs.existsSync(preloadPath)}`);

    // 프로그램 해상도 및 설정
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        show: false,
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    const adapter = new CidAdapter();
    registerCidIpc(adapter, win);
    registerSettingsIpc();
    registerNetworkIpc();

    logger.info(`[app] DEV_URL = ${DEV_URL}`);
    logger.info(`[app] START_URL = ${START_URL}`);

    // 로딩 상태 확인
    win.webContents.on('did-finish-load', () => {
        logger.debug(`[app] did-finish-load`);
        if (!win.isVisible()) win.show();
    });
    win.webContents.on('did-fail-load', (_e, code, desc, url) => {
        logger.error(`[app] did-fail-load: `, { code, desc, url });
    });

    // 페이지 이동 추적
    win.webContents.on('did-navigate', (_e, url) => console.log('[app] did-navigate:', url));
    win.webContents.on('did-navigate-in-page', (_e, url) => console.log('[app] in-page:', url));

    // 개발 : Vite dev 서버 + 시작경로
    if (DEV_URL) {
        await win.loadURL(`${DEV_URL}${START_URL}`);
        win.webContents.openDevTools({ mode: 'detach' });
    } else {
        // 배포: 정적 파일 로드
        const indexHtml = path.resolve(__dirname, '../renderer/index.html');

        if (START_URL.startsWith('#')) {
            await win.loadFile(indexHtml, { hash: START_URL.replace(/^#/, '') });
        } else {
            await win.loadFile(indexHtml);
        }
    }

    // ready-to-show는 보조로만
    win.once('ready-to-show', () => win?.show());

    // 프로그램 실행
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createApp();
    });

    // 프로그램 종료
    app.on('window-all-closed', () => {
        logger.info('[app] All windows closed, quitting application.');
        if (process.platform !== 'darwin') app.quit();
    });
}