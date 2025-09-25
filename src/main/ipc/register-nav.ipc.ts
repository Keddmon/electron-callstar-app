import { BrowserWindow, ipcMain } from "electron";

export const registerNavIpc = (getWindow: () => BrowserWindow | null) => {
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
    if (!win) return { canGoBack: false, canGoForward: false, url: ''};
    const wc = win.webContents;
    return {
      canGoBack: wc.canGoBack(),
      canGoForward: wc.canGoForward(),
      url: wc.getURL(),
    };
  });
};