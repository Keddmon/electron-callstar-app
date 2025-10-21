/**
 * SECTION - Package
 */
import { app, BrowserWindow, Menu, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
/**!SECTION - Package */

/**
 * SECTION - Utils
 */
import { logger } from './logs';
import { CidAdapterFactory } from './cid/cid.factory';
import { settingsStore } from './state/settings-store';
/**!SECTION - Utils */

/**
 * SECTION - IPC
 */
import type {
  registerCaptureIpc as RegisterCaptureIpc,
  registerCidIpc as RegisterCidIpc,
  registerNavIpc as RegisterNavIpc,
  registerPortIpc as RegisterPortIpc,
  registerSettingsIpc as RegisterSettingsIpc,
} from './ipc';
/**!SECTION - IPC */

/**
 * SECTION - CONSTANTS & INTERFACES & TYPES
 */
import { IPC } from './constants/ipc.constant';
import type { CidAdapter } from './interfaces/cid.interface';
import type { CidEvent } from './types/cid';
type InAppRules = { exact: Set<string>; suffix: string[] };
/**!SECTION - CONSTANTS & INTERFACES & TYPES*/

/**
 * SECTION - Globals
 */
let adapter: CidAdapter | null = null;
let mainWindow: BrowserWindow | null = null;
let reinitLock: Promise<void> | null = null;
let oauthHandledAt = 0;
/**!SECTION - Globals */

/** ===== EARLY LOGGING/CRASH HOOKS (설치본 진단용) ===== */
// try {
//   app.setAppLogsPath();
//   app.commandLine.appendSwitch('enable-logging');
//   if (process.env.ELECTRON_DISABLE_GPU === '1') {
//     app.disableHardwareAcceleration();
//   }
// } catch { }

/**
 * SECTION - Process Error Hooks
 */
process.on('uncaughtException', (e) => logger.error('[uncaughtException]', e));
process.on('unhandledRejection', (e: any) =>
  logger.error('[unhandledRejection]', e)
);

app.on('render-process-gone', (_e, wc, details) => {
  logger.error('[crash] render-process-gone', { id: wc?.id, details });
});
app.on('child-process-gone', (_e, details) => {
  logger.error('[crash] child-process-gone', details);
});
/**!SECTION - Process Error Hooks */

/**
 * SECTION - Helpers
 */
const getHashParams = (u: URL) => {
  const h = u.hash || '';
  const qIdx = h.indexOf('?');
  if (qIdx === -1) return new URLSearchParams();
  return new URLSearchParams(h.slice(qIdx + 1));
};

const isKakaoCallbackUrl = (raw: string) => {
  try {
    const u = new URL(raw);
    if (!/^https?:$/i.test(u.protocol)) return false;
    const host = u.hostname.toLowerCase();
    const isBunyangin =
      host === 'bunyangin.com' || host.endsWith('.bunyangin.com');
    if (!isBunyangin) return false;

    const sp = u.searchParams;
    const hp = getHashParams(u);

    const socialType = (
      sp.get('socialType') ||
      hp.get('socialType') ||
      ''
    ).toUpperCase();
    const hasCode = sp.has('code') || hp.has('code');

    if (socialType === 'KAKAO' || hasCode) return true;

    // 라우트 패턴도 안전망으로 허용
    if (/\/oauth\/callback|\/auth\/kakao\/callback/i.test(u.pathname))
      return true;
    if (/#\/oauth\/kakao/i.test(u.hash)) return true;

    return false;
  } catch {
    return false;
  }
};

// CLI 인자에서 --frontend-url=... 읽기
const parseArgvUrl = (): string | undefined => {
  const arg = process.argv.find((a) => a.startsWith('--frontend-url='));
  const v = arg?.slice('--frontend-url='.length).trim();
  if (v && /^https?:\/\//.test(v)) return v;
  return undefined;
};

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
};

// 최종 Frontend URL 결정 (argv > env > packaged meta > fallback)
const resolveFrontendUrl = (): {
  url: string;
  source: 'argv' | 'env' | 'meta' | 'fallback';
} => {
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
};

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

/** loadURL + timeout + fallback screen */
const safeLoad = async (win: BrowserWindow, url: string, timeoutMs = 10000) => {
  let timer: NodeJS.Timeout | null = null;
  try {
    const p = win.loadURL(url);
    const t = new Promise((_r, rej) => {
      timer = setTimeout(
        () => rej(new Error(`loadURL timeout: ${url}`)),
        timeoutMs
      );
    });
    await Promise.race([p, t]);
  } catch (e) {
    logger.error('[load] failed:', e);
    try {
      await win.loadURL(
        'data:text/html;charset=utf-8,' +
          encodeURIComponent(`
          <h2 style="font-family:sans-serif">네트워크/로드 오류</h2>
          <p>페이지를 불러오지 못했습니다.</p>
          <pre style="white-space:pre-wrap">${String(e)}</pre>
        `)
      );
    } catch {}
  } finally {
    if (timer) clearTimeout(timer);
    if (!win.isVisible()) win.show();
  }
};

/** 앱 도메인 화이트리스트 생성 (인앱 유지 대상) */
const buildAppHosts = (targetUrl: string): InAppRules => {
  const exact = new Set<string>();
  const suffix: string[] = [];

  try {
    const host = new URL(targetUrl).hostname.toLowerCase();
    if (host) {
      exact.add(host);
      // 자사 도메인 전체 서브도메인 허용 (예: *.bunyangin.com)
      const root = host.split('.').slice(-2).join('.');
      if (root === 'bunyangin.com') {
        exact.add('bunyangin.com');
        exact.add('www.bunyangin.com');
        suffix.push('.bunyangin.com');
      }
    }
  } catch {}

  // 개발 환경용
  exact.add('localhost');
  exact.add('127.0.0.1');

  // 카카오 OAuth: 다수 서브도메인 사용 가능성 → *.kakao.com 전체 허용
  exact.add('kakao.com');
  suffix.push('.kakao.com');
  exact.add('kakaocdn.net');
  suffix.push('.kakaocdn.net');

  // ★ Kakao-DAUM SSO 체인 추가
  exact.add('daum.net');
  suffix.push('.daum.net');
  exact.add('daumcdn.net');
  suffix.push('.daumcdn.net');

  // (선택) 혹시 모를 한국 도메인 플로우 대비
  // exact.add('kakao.co.kr');   suffix.push('.kakao.co.kr');

  return { exact, suffix };
};

/** 인앱 유지 여부 판정 */
const createInAppUrlChecker = (rules: InAppRules) => (url: string) => {
  try {
    const u = new URL(url);
    if (!/^https?:$/i.test(u.protocol)) return false;
    const h = u.hostname.toLowerCase();

    if (h === 'bunyangin.com' || h.endsWith('.bunyangin.com')) return true;

    if (rules.exact.has(h)) return true;
    return rules.suffix.some((suf) => h.endsWith(suf));
  } catch {
    return false;
  }
};

/** 외부 브라우저로 열기 */
const openExternally = (url: string, e?: Electron.Event) => {
  e?.preventDefault();
  shell
    .openExternal(url)
    .catch((err) => logger.warn('[openExternal] Error:', err));
};

// intent://...#Intent;...;S.browser_fallback_url=...;end 형태나
// 기타 문자열 안의 첫 https://... 를 뽑아내서 반환
const extractHttpFallback = (raw: string): string | null => {
  try {
    const u = new URL(raw);
    if (/^https?:$/i.test(u.protocol)) return u.toString();
  } catch {}
  const m = raw.match(/browser_fallback_url=([^;#]+)/i);
  if (m?.[1]) {
    try {
      const decoded = decodeURIComponent(m[1]);
      if (/^https?:\/\//i.test(decoded)) return decoded;
    } catch {}
  }
  const m2 = raw.match(/https?:\/\/[^\s'"]+/i);
  if (m2?.[0]) return m2[0];
  return null;
};

const navigateToCallbackThenCleanup = (callbackUrl: string) => {
  try {
    // 1) 콜백 주소로 실제 이동 → SPA가 code/socialType 읽고 토큰 교환
    mainWindow?.loadURL(callbackUrl).catch(() => {});
    logger.info('[auth] navigate to callback:', callbackUrl);

    // 2) 잠시 후 주소만 깔끔하게 정리
    setTimeout(() => {
      const cur = mainWindow?.webContents.getURL() ?? '';
      if (isKakaoCallbackUrl(cur)) {
        mainWindow?.webContents
          .executeJavaScript(`history.replaceState(null, "", "/#/");`)
          .catch(() => {});
        logger.info('[auth] cleanup URL -> "#/"');
      }
    }, 1500);
  } catch (e) {
    logger.warn('[auth] navigateToCallbackThenCleanup failed:', e);
  }
};

const maybeCloseAuthPopup = (wc: Electron.WebContents, url: string) => {
  if (!isKakaoCallbackUrl(url)) return;

  const now = Date.now();
  if (now - oauthHandledAt < 3000) return; // 루프 방지
  oauthHandledAt = now;

  const bw = BrowserWindow.fromWebContents(wc);
  const isPopup = !!(bw && mainWindow && bw.id !== mainWindow.id);
  if (isPopup) bw!.close();

  // ★ 핵심: 콜백으로 먼저 로드 → 프론트가 쿼리 읽고 로그인 처리
  navigateToCallbackThenCleanup(url);
};
/**!SECTION - Helpers */

/**
 * SECTION - CID Service
 */
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

    if (
      cidType === 'callstar' &&
      (!callstarPort || callstarPort.trim() === '')
    ) {
      logger.warn(
        '[App] callstar 선택됨: 포트(callstarPort) 미지정 → 사용자 선택 대기'
      );
      emitToFrontend(IPC.CID.STATUS, { isOpen: false, cidType: 'callstar' });
      return;
    }
    if (
      cidType === 'switch' &&
      (!captureDevice || captureDevice.trim() === '')
    ) {
      logger.warn(
        '[App] switch 선택됨: 캡처 장치(captureDevice) 미지정 → 사용자 선택 대기'
      );
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

  logger.info(
    '[App] CID 서비스 초기화 완료. 현재 어댑터: ',
    adapter ? adapter : '없음'
  );
}
/**!SECTION - CID Service */

/**
 * SECTION - IPC Registration
 */
const registerIpcHandlersSafe = async () => {
  try {
    const ipc = await import('./ipc');
    (ipc.registerCaptureIpc as typeof RegisterCaptureIpc)();
    (ipc.registerCidIpc as typeof RegisterCidIpc)(
      () => adapter,
      () => mainWindow
    );
    (ipc.registerSettingsIpc as typeof RegisterSettingsIpc)();
    (ipc.registerPortIpc as typeof RegisterPortIpc)();
    (ipc.registerNavIpc as typeof RegisterNavIpc)(() => mainWindow);
    logger.info('[App] IPC 핸들러 등록 완료');
  } catch (e: any) {
    logger.error('[App] IPC 핸들러 등록 실패', e?.message || e);
  }
};
/**!SECTION - IPC Registration */

/**
 * SECTION - App Life Cycle
 */
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
/**!SECTION - App Life Cycle */

/**
 * SECTION - NAV Controls
 */
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
/**!SECTION - NAV Controls */

/**
 * SECTION - Window (Main)
 */
const createWindow = async () => {
  logger.info('[App] Window 생성: Window 만드는 중...');
  logger.info('[paths] userData =', app.getPath('userData'));

  const { window: windowSettings } = settingsStore.get();

  const preloadPath = path.resolve(__dirname, 'preload.js');
  logger.info(
    `[App] preloadPath = ${preloadPath}, exists? = ${fs.existsSync(
      preloadPath
    )}`
  );

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
      partition: 'persist:bunyangin',
    },
  });

  if (!mainWindow.isVisible()) mainWindow.show();

  const { url: targetUrl, source } = resolveFrontendUrl();
  logger.info(`[App] target FRONTEND URL =`, targetUrl, `(source=${source})`);

  const INAPP_RULES = buildAppHosts(targetUrl);
  const isInAppUrl = createInAppUrlChecker(INAPP_RULES);

  const ses = mainWindow.webContents.session;
  ses.webRequest.onBeforeRequest(
    { urls: ['*://*/*'] }, // <= 표준 스킴만 필터
    (details, callback) => {
      const raw = details.url;
      // 표준 http(s)면 그대로
      if (/^https?:\/\//i.test(raw)) return callback({});

      // 비-HTTP (intent://, kakaolink:// 등) → https fallback 시도
      const fb = extractHttpFallback(raw);
      if (fb && isInAppUrl(fb)) {
        console.log('[onBeforeRequest] redirect →', fb);
        return callback({ redirectURL: fb }); // 인앱으로 리다이렉트
      }

      // fallback 없으면 손대지 않음 (이후 will-navigate 등에서 외부로 열릴 수 있음)
      return callback({});
    }
  );

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank' || isInAppUrl(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          parent: mainWindow!,
          modal: false,
          autoHideMenuBar: true,
          backgroundColor: '#ffffff',
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            webSecurity: true,
            partition: 'persist:bunyangin',
          },
        },
      };
    }
    openExternally(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (isKakaoCallbackUrl(url)) {
      e.preventDefault();
      navigateToCallbackThenCleanup(url);
      return;
    }

    // 메인 윈도우에서도 OAuth 콜백을 감지(팝업 한정 X)
    maybeCloseAuthPopup(mainWindow!.webContents, url);

    // 인앱 유지 도메면 그대로 진행
    if (isInAppUrl(url)) {
      logger.info('[navigate in-app]', url);
      console.log('[navigate in-app]', url);
      return;
    }

    // 비-HTTP 스킴(intent:// 등) → https fallback을 뽑아서 인앱으로 처리
    const fb = extractHttpFallback(url);
    if (fb && isInAppUrl(fb)) {
      e.preventDefault();
      logger.info('[navigate fallback→in-app]', fb);
      console.log('[navigate fallback→in-app]', fb);
      mainWindow?.loadURL(fb).catch(() => {});
      return;
    }

    // 그 외는 외부 브라우저
    console.log('[EXTERNAL NAV] In-app check failed. Opening externally:', url);
    logger.error(
      '[EXTERNAL NAV] In-app check failed. Opening externally:',
      url
    );
    openExternally(url, e);
  });

  mainWindow.webContents.on('will-redirect', (e, url) => {
    if (isKakaoCallbackUrl(url)) {
      e.preventDefault();
      navigateToCallbackThenCleanup(url);
      return;
    }

    // 콜백 감지
    maybeCloseAuthPopup(mainWindow!.webContents, url);

    // 인앱 유지 도메인이면 그대로
    if (isInAppUrl(url)) {
      console.log('[redirect in-app]', url);
      logger.info('[redirect in-app]', url);
      return;
    }

    // intent:// 등 → https fallback 보정 후 인앱 유지 가능한 경우엔 인앱으로
    const fb = extractHttpFallback(url);
    if (fb && isInAppUrl(fb)) {
      e.preventDefault();
      logger.info('[redirect fallback→in-app]', fb);
      mainWindow?.loadURL(fb).catch(() => {});
      return;
    }

    // 나머지는 외부 브라우저
    logger.error(
      '[EXTERNAL REDIRECT] In-app check failed. Opening externally:',
      url
    );
    openExternally(url, e);
  });

  mainWindow.webContents.on('did-navigate', (_e, url) => {
    maybeCloseAuthPopup(mainWindow!.webContents, url);
  });
  mainWindow.webContents.on('did-navigate-in-page', (_e, url) => {
    maybeCloseAuthPopup(mainWindow!.webContents, url);
  });

  await safeLoad(mainWindow, targetUrl, 10000);

  mainWindow.webContents.on('did-create-window', (child) => {
    child.webContents.setWindowOpenHandler(({ url }) => {
      if (url === 'about:blank' || isInAppUrl(url)) {
        logger.info('[popup] allow window.open → in-app:', url);
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            parent: mainWindow!,
            modal: false,
            autoHideMenuBar: true,
            backgroundColor: '#ffffff',
            webPreferences: {
              nodeIntegration: false,
              contextIsolation: true,
              sandbox: false,
              webSecurity: true,
              partition: 'persist:bunyangin', // ← 팝업도 동일 세션
            },
          },
        };
      }
      logger.info('[popup] open externally:', url);
      shell
        .openExternal(url)
        .catch((err) => logger.warn('[openExternal:child]', err));
      return { action: 'deny' };
    });

    child.webContents.on('will-navigate', (e, url) => {
      if (isKakaoCallbackUrl(url)) {
        e.preventDefault();
        navigateToCallbackThenCleanup(url);
        return;
      }

      if (isInAppUrl(url)) {
        maybeCloseAuthPopup(child.webContents, url);
        return;
      }

      const fb = extractHttpFallback(url);
      if (fb && isInAppUrl(fb)) {
        e.preventDefault();
        logger.info('[popup navigate fallback→in-app]', fb);
        child.loadURL(fb).catch(() => {});
        return;
      }
      openExternally(url, e);
    });

    child.webContents.on('will-redirect', (e, url) => {
      if (isKakaoCallbackUrl(url)) {
        e.preventDefault();
        navigateToCallbackThenCleanup(url);
        return;
      }

      // 콜백 감지: 팝업 컨텍스트 기준으로 처리
      maybeCloseAuthPopup(child.webContents, url);

      if (isInAppUrl(url)) {
        logger.info('[popup redirect in-app]', url);
        return;
      }

      const fb = extractHttpFallback(url);
      if (fb && isInAppUrl(fb)) {
        e.preventDefault();
        logger.info('[popup redirect fallback→in-app]', fb);
        // 팝업 자신을 fallback으로 이동
        child.loadURL(fb).catch(() => {});
        return;
      }

      openExternally(url, e);
    });

    child.webContents.on('did-navigate', (_e, url) => {
      maybeCloseAuthPopup(child.webContents, url);
    });
    child.webContents.on('did-navigate-in-page', (_e, url) => {
      maybeCloseAuthPopup(child.webContents, url);
    });
  });

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow?.isVisible()) mainWindow?.show();
  });

  mainWindow.webContents.on('did-finish-load', () => {
    logger.info('[App] did-finish-load');
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
    } catch {}
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

  bindNavControls(mainWindow);

  if (process.env.ELECTRON_DEBUG === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.webContents.once('did-finish-load', () => {
    void initializeCidService({ allowSwitchOpen: false });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};
/**!SECTION - Window (Main) */

/**
 * SECTION - App Entry
 */
export const createApp = async () => {
  try {
    if (!app.isReady()) {
      logger.info('[App] not ready, waiting...');
      await app.whenReady();
    }

    logger.info('[App] ready, creating window first');
    if (process.platform === 'darwin') {
      Menu.setApplicationMenu(null);
    }

    registerAppLifecycleEvents();
    await settingsStore.init();

    await createWindow();
    await registerIpcHandlersSafe();
  } catch (e: any) {
    logger.error('[App] createApp error:', e?.message || e);
    try {
      const fallback = new BrowserWindow({
        show: true,
        backgroundColor: '#fff',
      });
      await fallback.loadURL(
        'data:text/html;charset=utf-8,' +
          encodeURIComponent(`
            <h2 style="font-family:sans-serif">앱 시작 실패</h2>
            <pre style="white-space:pre-wrap">${String(e?.message || e)}</pre>
            <p>로그 폴더: ${app.getPath('logs')}</p>
          `)
      );
    } catch {}
  }
};
/**!SECTION - App Entry */
