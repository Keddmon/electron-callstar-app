// /**
//  * BrowserWindow 생성/URL 로드/IPC 등록
//  * --
//  */
// import { app, BrowserWindow, Menu } from 'electron';
// import * as path from 'path';
// import * as fs from 'fs';
// import logger from './logs/logger';

// /** 어댑터 */
// import { CidAdapter } from './cid/cid.adapter';

// /** 서비스 */
// // import { AutoReconnectService } from './reconnect/auto-reconnect.service';

// /** IPC */
// import { registerCidIpc } from './ipc/register-cid.ipc';
// import { registerSettingsIpc } from './ipc/register-settings.ipc';
// import { registerNetworkIpc } from './ipc/register-network.ipc';

// /** 상태 */
// import { settingsStore } from './state/settings-store';
// import { registerNavIpc } from './ipc/register-nav.ipc';

// /** Constant */

// const DEV_FRONTEND_URL = 'http://localhost:5173/#/';
// const PROD_FRONTEND_URL = 'http://localhost:5173/#/';
// // const PROD_FRONTEND_URL = 'https://app.example.com/#/'; // 운영 배포 도메인으로 교체
// const TARGET_URL = process.env.LOAD_URL || PROD_FRONTEND_URL;

// const adapter = new CidAdapter();
// let mainWindow: BrowserWindow | null = null;

// /** 서비스 초기화 */
// function initializeServices() {
//   // const reconnectService = new AutoReconnectService(adapter);
//   // 다른 서비스가 있다면 여기서 초기화
// }

// /** handler 등록 */
// function registerIpcHandlers() {
//   registerCidIpc(adapter, () => mainWindow);
//   registerSettingsIpc();
//   registerNetworkIpc();
//   registerNavIpc(() => mainWindow);
// }

// /** 애플리케이션 라이프 사이클 설정 */
// function registerAppLifecycleEvents() {
//   app.on('window-all-closed', () => {
//     logger.info('All windows closed, quitting application.');
//     if (process.platform !== 'darwin') app.quit();
//   });

//   app.on('activate', () => {
//     if (BrowserWindow.getAllWindows().length === 0) {
//       createWindow();
//     }
//   });
// }

// function bindNavControls(win: BrowserWindow) {
//   const wc = win.webContents;

//   const emitNavState = () => {
//     win.webContents.send('nav:state', {
//       canGoBack: wc.canGoBack(),
//       canGoForward: wc.canGoForward(),
//       url: wc.getURL(),
//     });
//   };

//   // in-page / full navigation 모두 감지
//   wc.on('did-navigate', emitNavState);
//   wc.on('did-navigate-in-page', emitNavState);

//   // Windows 마우스 측면 버튼 / 멀티미디어 키에 대응
//   win.on('app-command', (_e, cmd) => {
//     if (cmd === 'browser-backward' && wc.canGoBack()) wc.goBack();
//     if (cmd === 'browser-forward' && wc.canGoForward()) wc.goForward();
//   });

//   // 창 포커스 내 표준 단축키 처리
//   wc.on('before-input-event', (_e, input) => {
//     // 기존 F12 DevTools 토글은 그대로 두고, 아래에 내비 키 추가
//     // macOS: Cmd+[ / Cmd+]
//     if (input.type === 'keyDown' && input.meta) {
//       if (input.key === '[' && wc.canGoBack()) wc.goBack();
//       if (input.key === ']' && wc.canGoForward()) wc.goForward();
//     }
//     // Win/Linux: Alt+Left / Alt+Right
//     if (input.type === 'keyDown' && input.alt) {
//       if (input.key === 'ArrowLeft' && wc.canGoBack()) wc.goBack();
//       if (input.key === 'ArrowRight' && wc.canGoForward()) wc.goForward();
//     }
//     // 전용 브라우저 백/포워드 키
//     if (input.type === 'keyDown') {
//       if (input.key === 'BrowserBack' && wc.canGoBack()) wc.goBack();
//       if (input.key === 'BrowserForward' && wc.canGoForward()) wc.goForward();
//     }
//   });

//   // 초기 상태 한번 쏘기 (초기 버튼 활성화 동기화용)
//   emitNavState();
// }

// /** Window(화면) 생성 */
// async function createWindow() {
//   logger.info('[app] Create Window: Creating a new window...');

//   const { window: windowSettings } = settingsStore.get();

//   const preloadPath = path.resolve(__dirname, 'preload.js');
//   logger.debug(`[app] preloadPath = ${preloadPath}, exists? = ${fs.existsSync(preloadPath)}`);

//   mainWindow = new BrowserWindow({
//     width: windowSettings?.width ?? 1200,
//     height: windowSettings?.height ?? 800,
//     x: windowSettings?.x,
//     y: windowSettings?.y,
//     show: false,
//     autoHideMenuBar: true,  // 상단 'File, Edit, View, ...' 숨김 - Alt키
//     // frame: false,           // 아이콘 및 타이틀과 같은 외곽 프레임 숨김
//     webPreferences: {
//       preload: preloadPath,
//       nodeIntegration: false,
//       contextIsolation: true,
//       spellcheck: false,
//     }
//   });

//   // Debounce 타이머 변수
//   let saveTimer: NodeJS.Timeout;

//   // Window(화면) 위치/크기 저장
//   const saveWindowGeometry = () => {
//     clearTimeout(saveTimer);
//     saveTimer = setTimeout(() => {
//       if (!mainWindow) return;
//       const [width, height] = mainWindow.getSize();
//       const [x, y] = mainWindow.getPosition();
//       logger.debug(`Saving window geometry: ${JSON.stringify({ width, height, x, y })}`);
//       settingsStore.patch({ window: { width, height, x, y } });
//     }, 500);
//   };

//   // 창 크기/위치 변경 시 설정 저장 (Debounce 적용)
//   mainWindow.on('resize', saveWindowGeometry);
//   mainWindow.on('move', saveWindowGeometry);

//   mainWindow.webContents.on('did-finish-load', () => {
//     logger.debug(`[app] did-finish-load`);
//     if (mainWindow && !mainWindow.isVisible()) mainWindow.show();
//   });

//   mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
//     logger.error(`[app] did-fail-load: `, { code, desc, url });
//   });

//   // 키(Alt)로 메뉴 나타나는 것 막기
//   mainWindow.setMenuBarVisibility(false);

//   // F12로 개발자 도구 켜기
//   mainWindow.webContents.on('before-input-event', (_e, input) => {
//     if (input.type === 'keyDown' && input.key === 'F12') {
//       if (mainWindow?.webContents.isDevToolsOpened()) {
//         mainWindow.webContents.closeDevTools();
//       } else {
//         mainWindow?.webContents.openDevTools({ mode: 'detach' });
//       }
//     }
//   });

//   // 히스토리/단축키/마우스 버튼 바인딩
//   bindNavControls(mainWindow);

//   // 패키지시 PROD면 개발자 도구 X, DEV면 개발자 도구 O
//   if (app.isPackaged) {
//     // await mainWindow.loadURL(PROD_FRONTEND_URL);
//     await mainWindow.loadURL(TARGET_URL);
//   } else {
//     await mainWindow.loadURL(DEV_FRONTEND_URL);
//     mainWindow.webContents.openDevTools({ mode: 'detach' });
//   }

//   mainWindow.on('closed', () => {
//     mainWindow = null;
//   });
// }

// /** App 생성 */
// export async function createApp() {
//   if (!app.isReady()) {
//     logger.info('[app] App not ready, waiting...');
//     await app.whenReady();
//   }
//   logger.info('[app] App is ready, setting up listeners and creating window.');

//   // 전역 메뉴 제거
//   if (process.platform === 'darwin') {
//     Menu.setApplicationMenu(null);
//   } else {
//     Menu.setApplicationMenu(null);
//   }

//   // 설정 스토어 초기화
//   await settingsStore.init();

//   registerIpcHandlers();
//   initializeServices();
//   registerAppLifecycleEvents();

//   await createWindow();
// }
