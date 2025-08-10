import { BrowserWindow, IpcMain, ipcMain } from 'electron';
import { CidAdapter } from '../cid/cid-adapter';
import { IPC } from './channels';

export function registerCidIpc(adapter: CidAdapter, win: BrowserWindow, ipcm: IpcMain = ipcMain) {
    ipcm.handle(IPC.CID.OPEN, async (_e, args: { path: string; baudRate?: number }) => {
        await adapter.open(args);
        return adapter.getStatus();
    });

    ipcm.handle(IPC.CID.CLOSE, async () => {
        await adapter.close();
        return adapter.getStatus();
    });

    ipcm.handle(IPC.CID.STATUS, async () => adapter.getStatus());

    ipcm.handle(IPC.CID.DIAL, async (_e, args: { phoneNumber: string; channel?: string }) => {
        adapter.dial(args.phoneNumber, args.channel ?? '1');
        return true;
    });

    ipcm.handle(IPC.CID.FORCE_END, async (_e, args?: { channel?: string }) => {
        adapter.forceEnd(args?.channel ?? '1');
        return true;
    });

    ipcm.handle(IPC.CID.DEVICE_INFO, async (_e, args?: { channel?: string }) => {
        adapter.requestDeviceInfo(args?.channel ?? '1');
        return true;
    });

    // push: main -> renderer
    adapter.on('event', (payload) => {
        win.webContents.send(IPC.CID.ON_EVENT, payload);
    });
    adapter.on('status', (status) => {
        win.webContents.send(IPC.CID.ON_EVENT, { type: 'status', status });
    });
}