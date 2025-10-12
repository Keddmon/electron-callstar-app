import { ipcMain } from 'electron';
import { initializeCidService } from '../app';
import { settingsStore } from '../state/settings-store';

export function registerSettingsIpc() {
  ipcMain.handle('settings:get', async () => settingsStore.get());

  ipcMain.handle('settings:set', async (_e, settings) => {
    const result = await settingsStore.set(settings);
    await initializeCidService(); // 설정 변경 후 CID 서비스 재시작
    return result;
  });

  ipcMain.handle('settings:patch', async (_e, partial) => {
    const result = await settingsStore.patch(partial);
    await initializeCidService(); // 설정 변경 후 CID 서비스 재시작
    return result;
  });
}
