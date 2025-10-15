/** ===== PACKAGE ===== */
import { app, BrowserWindow, Menu } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from './logs';

/** ===== FACTORY ===== */
import { CidAdapterFactory } from './cid/cid.factory';

/** ===== STORE ===== */
import { settingsStore } from './state/settings-store';

/** ===== IPC ===== */
import type {
  registerCaptureIpc as RegisterCaptureIpc,
  registerCidIpc as RegisterCidIpc,
  registerNavIpc as RegisterNavIpc,
  registerPortIpc as RegisterPortIpc,
  registerSettingsIpc as RegisterSettingsIpc,
} from './ipc';

/** ===== CONSTANTS & INTERFACES & TYPES===== */
import { IPC } from './constants/ipc.constant';
import type { CidAdapter } from './interfaces/cid.interface';
import type { CidEvent } from './types/cid';

/** ===== GLOBALS ===== */
let adapter: CidAdapter | null = null;
let mainWindow: BrowserWindow | null = null;
let reinitLock: Promise<void> | null = null;

/** ===== EARLY LOGGING/CRASH HOOKS (설치본 진단용) ===== */
// try {
//   app.setAppLogsPath();
//   app.commandLine.appendSwitch('enable-logging');
//   if (process.env.ELECTRON_DISABLE_GPU === '1') {
//     app.disableHardwareAcceleration();
//   }
// } catch { }

process.on('uncaughtException', (e) => logger.error('[uncaughtException]', e));
process.on('unhandledRejection', (e: any) => logger.error('[unhandledRejection]', e));

app.on('render-process-gone', (_e, wc, details) => {
  logger.error('[crash] render-process-gone', { id: wc?.id, details });
});
app.on('child-process-gone', (_e, details) => {
  logger.error('[crash] child-process-gone', details);
});

/** ===== URL RESOLUTION ===== */
// CLI 인자에서 --frontend-url=... 읽기
const parseArgvUrl = (): string | undefined => {
  const arg = process.argv.find(a => a.startsWith('--frontend-url='));
  const v = arg?.slice('--frontend-url='.length).trim();
  if (v && /^https?:\/\//.test(v)) return v;
  return undefined;
}

// 패키지의 package.json에 주입된 extraMetadata.frontendUrl 읽기
const getPackagedFrontendUrl = (): string | undefined => {
  try {
    const pkgPath = path.join(app.getAppPath(), 'package.json');
    const meta = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const v = meta?.frontendUrl;
    return typeof v === 'string' && v.length > 0 ? v : undefined;
  } catch {
    return undefined;
  }
}

// 최종 Frontend URL 결정 (argv > env > packaged meta > fallback)
const resolveFrontendUrl = (): { url: string; source: 'argv' | 'env' | 'meta' | 'fallback' } => {
  const fromArgv = parseArgvUrl();
  if (fromArgv) return { url: fromArgv, source: 'argv' };

  const env = process.env.FRONTEND_URL?.trim();
  if (env && /^https?:\/\//.test(env)) return { url: env, source: 'env' };

  if (app.isPackaged) {
    const fromMeta = getPackagedFrontendUrl();
    if (fromMeta) return { url: fromMeta, source: 'meta' };
    return { url: 'https://bunyangin.com/', source: 'fallback' };
  }
  return { url: 'http://localhost:5173/#/', source: 'fallback' };
}

/** ===== HELPERS ===== */
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

/** 특정 URL 허용 여부 (bunyangin.com / localhost / 127.0.0.1) */
const allow = (url: string): boolean => {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host === 'bunyangin.com' || host === 'www.bunyangin.com') return true;
    if (host === 'localhost' || host === '127.0.0.1') return true;
    return false;
  } catch {
    return false;
  }
}

/** loadURL + timeout + 실패시 대체 화면 */
const safeLoad = async (win: BrowserWindow, url: string, timeoutMs = 10000) => {
  let timer: NodeJS.Timeout | null = null;
  try {
    const p = win.loadURL(url);
    const t = new Promise((_r, rej) => {
      timer = setTimeout(() => rej(new Error(`loadURL timeout: ${url}`)), timeoutMs);
    });
    await Promise.race([p, t]);
  } catch (e) {
    logger.error('[load] failed:', e);
    try {
      await win.loadURL(
        'data:text/html;charset=utf-8,' + encodeURIComponent(`
          <h2 style="font-family:sans-serif">네트워크/로드 오류</h2>
          <p>페이지를 불러오지 못했습니다.</p>
          <pre style="white-space:pre-wrap">${String(e)}</pre>
        `)
      );
    } catch { }
  } finally {
    if (timer) clearTimeout(timer);
    if (!win.isVisible()) win.show();
  }
}

/** ===== 서비스 초기화 ===== */
export async function initializeCidService({ allowSwitchOpen = false } = {}) {
  if (reinitLock) await reinitLock;

  reinitLock = (async () => {
    if (adapter) {
      logger.info('[App] 기존 CID 어댑터 종료 중 ...');
      try {
        await adapter.close();
      } catch (e: any) {
        logger.warn('[App] 어댑터 종료 실패(무시): ', e ?? e.message);
      } finally {
        adapter = null;
      }
    }

    const settings = settingsStore.get();
    const cid = settings?.cid ?? {};
    const { cidType, callstarPort, captureDevice } = cid;

    logger.info(`[App] 설정 기반 어댑터 생성 시도: ${cidType}`);

    if (cidType === 'callstar' && (!callstarPort || callstarPort.trim() === '')) {
      logger.warn('[App] callstar 선택됨: 포트(callstarPort) 미지정 → 사용자 선택 대기');
      emitToFrontend(IPC.CID.STATUS, { isOpen: false, cidType: 'callstar' });
      return;
    }
    if (cidType === 'switch' && (!captureDevice || captureDevice.trim() === '')) {
      logger.warn('[App] switch 선택됨: 캡처 장치(captureDevice) 미지정 → 사용자 선택 대기');
      emitToFrontend(IPC.CID.STATUS, { isOpen: false, cidType: 'switch' });
      return;
    }

    adapter = CidAdapterFactory.fromSettings(cid);
    if (!adapter) {
      logger.warn('[App] 어댑터 생성 실패(설정 불충분/알 수 없는 타입).');
      emitToFrontend(IPC.CID.STATUS, { isOpen: false, cidType });
      return;
    }

    adapter.on('cid', (event: CidEvent) => {
      logger.info('[App] CID 이벤트 발생 → Frontend 전송:', event);
      emitToFrontend(IPC.CID.EVENT, event);
    });
    (adapter as any).on?.('status', () => emitStatus());

    try {
      logger.info('[App] CID 어댑터 시작 중...');

      if (cidType === 'switch' && !allowSwitchOpen) {
        logger.info('[App] 부팅 중이므로 switch 자동 open 생략');
        emitToFrontend(IPC.CID.STATUS, { isOpen: false, cidType: 'switch' });
        return;
      }

      if (cidType === 'callstar') {
        await adapter.open(callstarPort!);
      } else {
        await adapter.open();
      }

      const status = adapter.getStatus?.();
      if (!status?.isOpen) {
        logger.warn('[App] CID 어댑터 시작 실패(예외 없음, isOpen = false)');
        adapter = null;
        emitToFrontend(IPC.CID.STATUS, { isOpen: false, cidType });
        return;
      }

      emitStatus();
      logger.info('[App] CID 어댑터 시작 완료.');
    } catch (e) {
      logger.error('[App] CID 어댑터 시작 실패:', e);
      adapter = null;
      emitToFrontend(IPC.CID.STATUS, { isOpen: false, cidType });
    }
  })();

  try {
    await reinitLock;
  } finally {
    reinitLock = null;
  }

  logger.info('[App] CID 서비스 초기화 완료. 현재 어댑터: ', adapter ? adapter : '없음');
}

/** ===== IPC 등록 ===== */
const registerIpcHandlersSafe = async () => {
  try {
    const ipc = await import('./ipc');
    (ipc.registerCaptureIpc as typeof RegisterCaptureIpc)();
    (ipc.registerCidIpc as typeof RegisterCidIpc)(() => adapter, () => mainWindow);
    (ipc.registerSettingsIpc as typeof RegisterSettingsIpc)();
    (ipc.registerPortIpc as typeof RegisterPortIpc)();
    (ipc.registerNavIpc as typeof RegisterNavIpc)(() => mainWindow);
    logger.info('[App] IPC 핸들러 등록 완료');
  } catch (e: any) {
    logger.error('[App] IPC 핸들러 등록 실패', e?.message || e);
  }
}

/** ===== 프로그램 라이프 사이클 ===== */
const registerAppLifecycleEvents = () => {
  app.on('window-all-closed', () => {
    logger.info('All windows closed, quitting application.');
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
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

  wc.on('did-navigate', emitNavState);
  wc.on('did-navigate-in-page', emitNavState);

  win.on('app-command', (_e, cmd) => {
    if (cmd === 'browser-backward' && wc.canGoBack()) wc.goBack();
    if (cmd === 'browser-forward' && wc.canGoForward()) wc.goForward();
  });

  wc.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.meta) {
      if (input.key === '[' && wc.canGoBack()) wc.goBack();
      if (input.key === ']' && wc.canGoForward()) wc.goForward();
    }
    if (input.type === 'keyDown' && input.alt) {
      if (input.key === 'ArrowLeft' && wc.canGoBack()) wc.goBack();
      if (input.key === 'ArrowRight' && wc.canGoForward()) wc.goForward();
    }
    if (input.type === 'keyDown') {
      if (input.key === 'BrowserBack' && wc.canGoBack()) wc.goBack();
      if (input.key === 'BrowserForward' && wc.canGoForward()) wc.goForward();
    }
  });

  emitNavState();
};

/** ===== Window(화면) 생성 ===== */
const createWindow = async () => {
  logger.info('[App] Window 생성: Window 만드는 중...');
  logger.info('[paths] userData =', app.getPath('userData'));

  const { window: windowSettings } = settingsStore.get();

  const preloadPath = path.resolve(__dirname, 'preload.js');
  logger.debug(`[App] preloadPath = ${preloadPath}, exists? = ${fs.existsSync(preloadPath)}`);

  mainWindow = new BrowserWindow({
    width: windowSettings?.width ?? 1200,
    height: windowSettings?.height ?? 800,
    x: windowSettings?.x,
    y: windowSettings?.y,
    show: true,
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
      sandbox: false,
      webSecurity: true,
    },
  });

  if (!mainWindow.isVisible()) mainWindow.show();

  // 외부/새창/내비게이션 가드 (bunyangin/localhost만 허용)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    return { action: allow(url) ? 'allow' : 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!allow(url)) e.preventDefault();
  });

  // 창 표시 안정화
  mainWindow.once('ready-to-show', () => {
    if (!mainWindow?.isVisible()) mainWindow?.show();
  });
  mainWindow.webContents.on('did-finish-load', () => {
    logger.debug('[App] did-finish-load');
    if (!mainWindow?.isVisible()) mainWindow?.show();
  });
  mainWindow.webContents.on('did-fail-load', async (_e, code, desc, url) => {
    logger.error('[app] did-fail-load', { code, desc, url });
    try {
      await mainWindow?.loadURL(
        'data:text/html;charset=utf-8,' +
        encodeURIComponent(`
            <h1>네트워크 오류</h1>
            <p>${desc} (code: ${code})</p>
            <p>URL: ${url}</p>
            <p>인터넷 연결 또는 방화벽/프록시를 확인하세요.</p>
          `)
      );
    } catch { }
    if (!mainWindow?.isVisible()) mainWindow?.show();
  });

  // 메뉴 숨김
  mainWindow.setMenuBarVisibility(false);

  // F12로 DevTools 토글
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

  // 최종 URL 로드
  const { url: targetUrl, source } = resolveFrontendUrl();
  logger.info(`[App] target FRONTEND URL =`, targetUrl, `(source=${source})`);
  await safeLoad(mainWindow, targetUrl, 10000);

  if (process.env.ELECTRON_DEBUG === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // 렌더러 로드 완료 후 CID 초기화
  mainWindow.webContents.once('did-finish-load', () => {
    void initializeCidService({ allowSwitchOpen: false });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

/** ===== 앱 생성(메인) ===== */
export const createApp = async () => {
  try {
    if (!app.isReady()) {
      logger.info('[App] 앱 준비 안됨, 기다리기...');
      await app.whenReady();
    }
    logger.info('[App] 앱 준비 됨, window 우선 생성');
    if (process.platform === 'darwin') {
      Menu.setApplicationMenu(null);
    }

    // 라이프사이클 & 설정 스토어
    registerAppLifecycleEvents();
    await settingsStore.init();

    await createWindow();

    void initializeCidService({ allowSwitchOpen: false });

    await registerIpcHandlersSafe();
  } catch (e: any) {
    logger.error('[App] createApp 에러 발생:', e?.message || e);
    try {
      const fallback = new BrowserWindow({ show: true, backgroundColor: '#fff' });
      await fallback.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
        <h2 style="font-family:sans-serif">앱 시작 실패</h2>
        <pre style="white-space:pre-wrap">${String(e?.message || e)}</pre>
        <p>로그 폴더: ${app.getPath('logs')}</p>
      `));
    } catch { }
  }
};
