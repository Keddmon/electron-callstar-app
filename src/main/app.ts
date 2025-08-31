/**
 * BrowserWindow 생성/URL 로드/IPC 등록
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

/** Constant */
const DEV_URL = process.env.ELECTRON_DEV_SERVER_URL;
const START_URL = process.env.START_URL || '';

const adapter = new CidAdapter();
let mainWindow: BrowserWindow | null = null;

function setupAppListeners() {
    registerCidIpc(adapter, () => mainWindow);

    app.on('window-all-closed', () => {
        logger.info('All windows closed, quitting application.');
        if (process.platform !== 'darwin') app.quit();
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
}

async function createWindow() {
    logger.info('[app] Create Window: Creating a new window...');

    const preloadPath = path.resolve(__dirname, 'preload.js');
    logger.debug(`[app] preloadPath = ${preloadPath}, exists? = ${fs.existsSync(preloadPath)}`);

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        show: false,
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
        }
    });

    mainWindow.webContents.on('did-finish-load', () => {
        logger.debug(`[app] did-finish-load`);
        if (mainWindow && !mainWindow.isVisible()) mainWindow.show();
    });

    mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
        logger.error(`[app] did-fail-load: `, { code, desc, url });
    });
    // 페이지 이동 추적
    mainWindow.webContents.on('did-navigate', (_e, url) => console.log('[app] did-navigate:', url));
    mainWindow.webContents.on('did-navigate-in-page', (_e, url) => console.log('[app] in-page:', url));

    // 개발 : Vite dev 서버 + 시작경로
    if (DEV_URL) {
        await mainWindow.loadURL(`${DEV_URL}${START_URL}`);
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
        // 배포: 정적 파일 로드
        const indexHtml = path.resolve(__dirname, '../renderer/index.html');
        if (START_URL.startsWith('#')) {
            await mainWindow.loadFile(indexHtml, { hash: START_URL.replace(/^#/, '') });
        } else {
            await mainWindow.loadFile(indexHtml);
        }
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

export async function createApp() {
    if (!app.isReady()) {
        logger.info('[app] App not ready, waiting...');
        await app.whenReady();
    }
    logger.info('[app] App is ready, setting up listeners and creating window.');
    setupAppListeners();
    await createWindow();
}