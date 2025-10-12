/** PACKAGE */
import { BrowserWindow, ipcMain } from 'electron';

/**
 * Electron 내에서 페이지 이동(뒤로가기, 앞으로가기) 설정
 * --
 */
const registerNavIpc = (getWindow: () => BrowserWindow | null) => {
  ipcMain.handle('nav:back', () => {
    const win = getWindow();
    if (win && win.webContents.canGoBack()) win.webContents.goBack();
  });

  ipcMain.handle('nav:forward', () => {
    const win = getWindow();
    if (win && win.webContents.canGoForward()) win.webContents.goForward();
  });

  ipcMain.handle('nav:state', () => {
    const win = getWindow();
    if (!win) return { canGoBack: false, canGoForward: false, url: '' };
    const wc = win.webContents;
    return {
      canGoBack: wc.canGoBack(),
      canGoForward: wc.canGoForward(),
      url: wc.getURL(),
    };
  });
};

export default registerNavIpc;
