/**
 * BrowserWindow 생성/URL 로드/IPC 등록
 * --
 */

/** ===== Libraries ===== */
import { app, BrowserWindow, Menu } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import logger from './logs/logger';

/** ===== Factory ===== */
import { CidAdapterFactory } from './cid/cid.factory';

/** ===== Interfaces ===== */
import type { CidAdapter } from './interfaces/cid.interface';

/** ===== Store ===== */
import { settingsStore } from './state/settings-store';

/** ===== IPC ===== */
import {
  registerCaptureIpc,
  registerCidIpc,
  registerNavIpc,
  registerNetworkIpc,
  registerSettingsIpc,
} from './ipc';

/** ===== Constants ===== */
const DEV_FRONTEND_URL = 'http://localhost:5173/#/';
const PROD_FRONTEND_URL = 'http://localhost:5173/#/';
const TARGET_URL = process.env.LOAD_URL || PROD_FRONTEND_URL;

/** ===== Variables ===== */
let adapter: CidAdapter | null = null;
let mainWindow: BrowserWindow | null = null;

// function getAdapter() { return adapter; }
// function getMainWindow() { return mainWindow; }

/** ===== 서비스 초기화 ===== */
async function initializeServices() {
  const s = settingsStore.get();

  try {
    // 기본 `callstar`
    const deviceType = s.cid?.deviceType ?? 'callstar';

    if (deviceType === 'switch') {
      const capture = s.cid?.lanCardIndex !== undefined && s.cid?.lanCardIndex !== null
        ? String(s.cid.lanCardIndex)
        : s.sip?.captureIp ?? '';

      const filter = s.sip?.filter;

      adapter = CidAdapterFactory.create({
        type: 'switch',
        sipCaptureIp: capture,
        sipFilter: filter,
      });

      try {
        await adapter.open();
      } catch (e) {
        logger.warn('[app] switch adapter open failed (continuing): ', e);
      }
    } else {
      adapter = CidAdapterFactory.create({
        type: 'callstar',
        callstarPath: s.cid?.lastPortPath,
      });

      if (s.cid?.lastPortPath) {
        try {
          await adapter.open(s.cid.lastPortPath);
        } catch (e) {
          logger.warn('[app] callstar adapter open failed (continuing): ', e);
        }
      }
    }

    logger.info('[app] adapter initialized: ', adapter ? 'present' : 'none');
  } catch (e) {
    logger.error('[app] initializeService failed: ', e);
  }
}

/** ===== IPC 등록 ===== */
function registerIpcHandlers() {
  registerCaptureIpc();
  registerCidIpc(() => adapter, () => mainWindow);
  registerSettingsIpc();
  registerNetworkIpc();
  registerNavIpc(() => mainWindow);
}

/** ===== 프로그램 라이프 사이클 ===== */
function registerAppLifecycleEvents() {

  // 프로그램 종료
  app.on('window-all-closed', () => {
    logger.info('All windows closed, quitting application.');
    if (process.platform !== 'darwin') app.quit();
  });

  // 프로그램 실행
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}

/** ===== 프로그램 뒤로가기/앞으로가기 ===== */
function bindNavControls(win: BrowserWindow) {
  const wc = win.webContents;

  const emitNavState = () => {
    win.webContents.send('nav:state', {
      canGoBack: wc.canGoBack(),
      canGoForward: wc.canGoForward(),
      url: wc.getURL(),
    });
  };

  // in-page / full navigation 모두 감지
  wc.on('did-navigate', emitNavState);
  wc.on('did-navigate-in-page', emitNavState);

  // Windows 마우스 측면 버튼 / 멀티미디어 키에 대응
  win.on('app-command', (_e, cmd) => {
    if (cmd === 'browser-backward' && wc.canGoBack()) wc.goBack();
    if (cmd === 'browser-forward' && wc.canGoForward()) wc.goForward();
  });

  // 창 포커스 내 표준 단축키 처리
  wc.on('before-input-event', (_e, input) => {
    // 기존 F12 DevTools 토글은 그대로 두고, 아래에 내비 키 추가
    // macOS: Cmd+[ / Cmd+]
    if (input.type === 'keyDown' && input.meta) {
      if (input.key === '[' && wc.canGoBack()) wc.goBack();
      if (input.key === ']' && wc.canGoForward()) wc.goForward();
    }
    // Win/Linux: Alt+Left / Alt+Right
    if (input.type === 'keyDown' && input.alt) {
      if (input.key === 'ArrowLeft' && wc.canGoBack()) wc.goBack();
      if (input.key === 'ArrowRight' && wc.canGoForward()) wc.goForward();
    }
    // 전용 브라우저 백/포워드 키
    if (input.type === 'keyDown') {
      if (input.key === 'BrowserBack' && wc.canGoBack()) wc.goBack();
      if (input.key === 'BrowserForward' && wc.canGoForward()) wc.goForward();
    }
  });

  // 초기 상태 한번 쏘기 (초기 버튼 활성화 동기화용)
  emitNavState();
}

/** ===== Window(화면) 생성 ===== */
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
    autoHideMenuBar: true,  // 상단 'File, Edit, View, ...' 숨김 - Alt키
    // frame: false,           // 아이콘 및 타이틀과 같은 외곽 프레임 숨김
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
    }
  });

  // Debounce 타이머 변수
  let saveTimer: NodeJS.Timeout;

  // Window(화면) 위치/크기 저장
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

  // 프로그램 로드 끝날 시
  mainWindow.webContents.on('did-finish-load', () => {
    logger.debug(`[app] did-finish-load`);
    if (mainWindow && !mainWindow.isVisible()) mainWindow.show();
  });

  // 프로그램 로드 실패 시
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    logger.error(`[app] did-fail-load: `, { code, desc, url });
  });

  // 키(Alt)로 메뉴 나타나는 것 막기
  mainWindow.setMenuBarVisibility(false);

  // F12로 개발자 도구 켜기
  mainWindow.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      if (mainWindow?.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow?.webContents.openDevTools({ mode: 'detach' });
      }
    }
  });

  // 히스토리/단축키/마우스 버튼 바인딩
  bindNavControls(mainWindow);

  // 패키지시 PROD면 개발자 도구 X, DEV면 개발자 도구 O
  if (app.isPackaged) {
    // await mainWindow.loadURL(PROD_FRONTEND_URL);
    await mainWindow.loadURL(TARGET_URL);
  } else {
    await mainWindow.loadURL(DEV_FRONTEND_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/** ===== 앱 생성(메인) ===== */
export async function createApp() {
  if (!app.isReady()) {
    logger.info('[app] App not ready, waiting...');
    await app.whenReady();
  }
  logger.info('[app] App is ready, setting up listeners and creating window.');

  // 전역 메뉴 제거
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(null);
  }

  // 설정 스토어 초기화
  await settingsStore.init();

  // IPC 등록
  registerIpcHandlers();

  // Settings 초기화
  await initializeServices();

  // 프로그램 실행
  registerAppLifecycleEvents();


  // Window(화면) 생성
  await createWindow();
}
