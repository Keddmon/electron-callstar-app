import { ipcMain } from 'electron';
import { settingsStore } from '../state/settings-store';

export function registerSettingsIpc() {
	ipcMain.handle('settings:get', async () => settingsStore.get());
	ipcMain.handle('settings:set', async (_e, settings) => settingsStore.set(settings));
	ipcMain.handle('settings:patch', async (_e, partial) => settingsStore.patch(partial));
}