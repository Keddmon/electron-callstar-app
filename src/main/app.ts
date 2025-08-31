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

/** 서비스 */
import { AutoReconnectService } from './reconnect/auto-reconnect.service';

/** IPC */
import { registerCidIpc } from './ipc/register-cid.ipc';
import { registerSettingsIpc } from './ipc/register-settings.ipc';
import { registerNetworkIpc } from './ipc/register-network.ipc';

/** 상태 */
import { settingsStore } from './state/settings-store';

/** Constant */
const DEV_URL = process.env.ELECTRON_DEV_SERVER_URL;
const START_URL = process.env.START_URL || '';

const adapter = new CidAdapter();
let mainWindow: BrowserWindow | null = null;

/** 서비스 초기화 */
function initializeServices() {
    const reconnectService = new AutoReconnectService(adapter);
    // 다른 서비스가 있다면 여기서 초기화
}

/** handler 등록 */
function registerIpcHandlers() {
    registerCidIpc(adapter, () => mainWindow);
    registerSettingsIpc();
    registerNetworkIpc();
}

/** 애플리케이션 라이프 사이클 설정 */
function registerAppLifecycleEvents() {
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

    const { window: windowSettings } = settingsStore.get();

    const preloadPath = path.resolve(__dirname, 'preload.js');
    logger.debug(`[app] preloadPath = ${preloadPath}, exists? = ${fs.existsSync(preloadPath)}`);

    mainWindow = new BrowserWindow({
        width: windowSettings?.width ?? 1200,
        height: windowSettings?.height ?? 800,
        x: windowSettings?.x,
        y: windowSettings?.y,
        show: false,
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
        }
    });

    // Debounce 타이머 변수
    let saveTimer: NodeJS.Timeout;

    const saveWindowGeometry = () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            if (!mainWindow) return;
            const [width, height] = mainWindow.getSize();
            const [x, y] = mainWindow.getPosition();
            logger.debug(`Saving window geometry: ${JSON.stringify({ width, height, x, y })}`);
            settingsStore.patch({ window: { width, height, x, y } });
        }, 500);
    };

    // 창 크기/위치 변경 시 설정 저장 (Debounce 적용)
    mainWindow.on('resize', saveWindowGeometry);
    mainWindow.on('move', saveWindowGeometry);

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

    // 설정 스토어 초기화
    await settingsStore.init();

    registerIpcHandlers();
    initializeServices();
    registerAppLifecycleEvents();

    await createWindow();
}
