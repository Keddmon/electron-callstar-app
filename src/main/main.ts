/**
 * 메인 프로세스 진입점
 * --
 */
import { app, BrowserWindow } from 'electron';
import { createApp } from './app';
import { logger } from './logs';

// 다중 실행 방지
const gotTheLock = app.requestSingleInstanceLock();

if (process.platform === 'win32') {
  app.setAppUserModelId('com.bunyangin.app');
}

if (!gotTheLock) {
  app.quit();
} else {
  // app.on('second-instance', () => {
  //   const win = BrowserWindow.getAllWindows()[0];
  //   if (win) {
  //     if (win.isMinimized()) win.restore();
  //     win.focus();
  //   }
  // });
  app.on('second-instance', async () => {
    let win = BrowserWindow.getAllWindows()[0];
    if (!win) {
      try {
        await createApp();
        win = BrowserWindow.getAllWindows()[0];
      } catch (e: any) {
        logger.error('[Main] second-instance createApp failed: ', e?.message || e);
      }
    }
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus;
    }
  });

  createApp().catch((err) => {
    logger.error('[main] Unhandled error during app creation:', err);
    app.quit();
  });
}
