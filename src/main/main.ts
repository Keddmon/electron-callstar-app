/**
 * 메인 프로세스 진입점
 * --
 */
import 'dotenv/config';
import { app, BrowserWindow } from 'electron';
import { createApp } from './app';

// 다중 실행 방지
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win) {
            if (win.isMinimized()) win.restore();
            win.focus();
        }
    });

    createApp();
}