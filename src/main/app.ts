/** ===== PACKAGE ===== */
import { app, BrowserWindow, Menu } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import logger from './logs/logger';

/** ===== FACTORY ===== */
import { CidAdapterFactory } from './cid/cid.factory';

/** ===== STORE ===== */
import { settingsStore } from './state/settings-store';

/** ===== IPC ===== */
import {
  registerCaptureIpc,
  registerCidIpc,
  registerNavIpc,
  registerPortIpc,
  registerSettingsIpc,
} from './ipc';

/** ===== CONSTANTS & INTERFACES & TYPES===== */
import { IPC } from './constants/ipc.constant';
import type { CidAdapter } from './interfaces/cid.interface';
import { CidEvent } from './types/cid';

const DEV_FRONTEND_URL = 'http://localhost:5173/#/';
const PROD_FRONTEND_URL = 'https://bunyangin.com/';

/** ===== VARIABLES ===== */
let adapter: CidAdapter | null = null;
let mainWindow: BrowserWindow | null = null;
let reinitLock: Promise<void> | null = null;

/** ===== FRONTEND BRIDGE ===== */
const emitToFrontend = (channel: string, payload: any) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    mainWindow.webContents.send(channel, payload);
  } catch (e) {
    logger.warn('[app] emitToFrontend 실패: ', e);
  }
};

const emitStatus = () => {
  const status = adapter?.getStatus?.();
  if (status) emitToFrontend(IPC.CID.STATUS, status);
};

/** ===== 패키지 LOCAL - PROD 구분 */
const getPackagedFrontendUrl = (): string | undefined => {
  try {
    const pkgPath = path.join(app.getAppPath(), 'package.json');
    const meta = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const v = meta?.frontendUrl;
    return typeof v === 'string' && v.length > 0 ? v : undefined;
  } catch {
    return undefined;
  }
};

/** ===== 서비스 초기화 ===== */
export async function initializeCidService() {
  // 동시 호출 레이스 방지
  if (reinitLock) await reinitLock;

  // 1) 기존 어댑터 종료
  reinitLock = (async () => {
    if (adapter) {
      logger.info('[App] 기존 CID 어댑터 종료 중 ...');
      try {
        await adapter.close();
      } catch (e: any) {
        logger.warn('[APp] 어댑터 종료 실패(무시): ', e ?? e.message);
      } finally {
        adapter = null;
      }
    }

    // 2) 설정 로드 및 타입/필수값 가드
    const settings = settingsStore.get();
    const cid = settings?.cid ?? {};
    const { cidType, callstarPort, captureDevice } = cid;

    logger.info(`[app] 설정 기반 어댑터 생성 시도: ${cidType}`);

    if (
      cidType === 'callstar' &&
      (!callstarPort || callstarPort.trim() === '')
    ) {
      logger.warn(
        '[app] callstar 선택됨: 포트(callstarPort) 미지정 → 사용자 선택 대기'
      );
      emitToFrontend(IPC.CID.STATUS, { isOpen: false, cidType: 'callstar' });
      return;
    }
    if (
      cidType === 'switch' &&
      (!captureDevice || captureDevice.trim() === '')
    ) {
      logger.warn(
        '[app] switch 선택됨: 캡처 장치(captureDevice) 미지정 → 사용자 선택 대기'
      );
      emitToFrontend(IPC.CID.STATUS, { isOpen: false, cidType: 'switch' });
      return;
    }

    // 3) 팩토리로 생성 (cid.factory.ts의 fromSettings 사용)
    adapter = CidAdapterFactory.fromSettings(cid);
    if (!adapter) {
      logger.warn('[app] 어댑터 생성 실패(설정 불충분/알 수 없는 타입).');
      emitToFrontend(IPC.CID.STATUS, { isOpen: false, cidType });
      return;
    }

    // 4) 이벤트 브릿지
    adapter.on('cid', (event: CidEvent) => {
      logger.info('[app] CID 이벤트 발생 → Frontend 전송:', event);
      emitToFrontend(IPC.CID.EVENT, event);
    });
    // 일부 어댑터가 status 이벤트를 내보낼 수 있음
    (adapter as any).on?.('status', () => emitStatus());

    // 5) 어댑터 시작 (타입별 인자)
    try {
      logger.info('[app] CID 어댑터 시작 중...');
      if (cidType === 'callstar') {
        await adapter.open(callstarPort!);
      } else {
        await adapter.open();
      }
      emitStatus();
      logger.info('[app] CID 어댑터 시작 완료.');
    } catch (e) {
      logger.error('[app] CID 어댑터 시작 실패:', e);
      adapter = null;
      emitToFrontend(IPC.CID.STATUS, { isOpen: false, cidType });
    }
  })();

  try {
    await reinitLock;
  } finally {
    reinitLock = null;
  }

  logger.info(
    '[app] CID 서비스 초기화 완료. 현재 어댑터: ',
    adapter ? adapter : '없음'
  );
}

/** ===== IPC 등록 ===== */
function registerIpcHandlers() {
  registerCaptureIpc();
  registerCidIpc(
    () => adapter,
    () => mainWindow
  );
  registerSettingsIpc();
  registerPortIpc();
  registerNavIpc(() => mainWindow);
}

/** ===== 프로그램 라이프 사이클 ===== */
const registerAppLifecycleEvents = () => {
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
};

/** ===== 프로그램 뒤로가기/앞으로가기 ===== */
const bindNavControls = (win: BrowserWindow) => {
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
};

/** ===== Window(화면) 생성 ===== */
const createWindow = async () => {
  logger.info('[app] Create Window: Creating a new window...');

  const { window: windowSettings } = settingsStore.get();

  const preloadPath = path.resolve(__dirname, 'preload.js');
  logger.debug(
    `[app] preloadPath = ${preloadPath}, exists? = ${fs.existsSync(
      preloadPath
    )}`
  );

  mainWindow = new BrowserWindow({
    width: windowSettings?.width ?? 1200,
    height: windowSettings?.height ?? 800,
    x: windowSettings?.x,
    y: windowSettings?.y,
    show: false,
    autoHideMenuBar: true, // 상단 'File, Edit, View, ...' 숨김 - Alt키
    // frame: false,           // 아이콘 및 타이틀과 같은 외곽 프레임 숨김
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
    },
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
      logger.debug(
        `Saving window geometry: ${JSON.stringify({ width, height, x, y })}`
      );
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
    const packageUrl = getPackagedFrontendUrl();
    await mainWindow.loadURL(packageUrl ?? PROD_FRONTEND_URL);
  } else {
    await mainWindow.loadURL(DEV_FRONTEND_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

/** ===== 앱 생성(메인) ===== */
export const createApp = async () => {
  if (!app.isReady()) {
    logger.info('[app] App not ready, waiting...');
    await app.whenReady();
  }
  logger.info('[app] App is ready, setting up listeners and creating window.');

  // 전역 메뉴 제거
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(null);
  }
  // 라이프사이클
  registerAppLifecycleEvents();

  // 설정 스토어 초기화
  await settingsStore.init();

  // IPC 등록
  registerIpcHandlers();

  // Window(화면) 생성
  await createWindow();

  // Settings 초기화
  await initializeCidService();
};
