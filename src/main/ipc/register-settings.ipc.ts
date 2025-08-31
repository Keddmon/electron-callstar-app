import { ipcMain, IpcMain } from 'electron';
import { IPC } from './channels';
import { Settings, settingsStore } from '../state/settings-store';

export function registerSettingsIpc(ipcm: IpcMain = ipcMain) {
    ipcm.handle(IPC.SETTINGS.GET, async () => settingsStore.get());
    ipcm.handle(IPC.SETTINGS.SET, async (_e, next: Settings) => settingsStore.set(next));
    ipcm.handle(IPC.SETTINGS.PATCH, async (_e, patch: Partial<Settings>) => settingsStore.patch(patch));
}