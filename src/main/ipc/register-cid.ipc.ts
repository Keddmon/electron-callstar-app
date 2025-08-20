import { BrowserWindow, IpcMain, ipcMain } from 'electron';
import { CidAdapter } from '../cid/cid-adapter';
import { IPC } from './channels';

function mapToFrontendEvent(evt: any) {
    switch (evt?.type) {
        case 'incoming': {
            return { type: 'ring', payload: { channel: evt.channel, phoneNumber: evt.phoneNumber } };
        }
        case 'maksed': {
            return { type: 'ring', payload: { channel: evt.channel, masked: true, reason: evt.reason } };
        }
        case 'off-hook': {
            return { type: 'call:start', payload: { channel: evt.channel, phoneNumber: evt.phoneNumber } };
        }
        case 'on-hook': {
            return { type: 'call:end', payload: { channel: evt.channel, phoneNumber: evt.phoneNumber } };
        }
        case 'force-end': {
            return { type: 'call:end', payload: { channel: evt.channel, phoneNumber: evt.phoneNumber } };
        }
        case 'dial-out': {
            // 발신
            return { type: 'dial', payload: { channel: evt.channel, phase: 'out' } };
        }
        case 'dial-complete': {
            // 발신 완료 시도 'call:end'로 치부?
            return { type: 'call:end', payload: { channel: evt.channel, phoneNumber: evt.phoneNumber, reason: 'dial-complete' } };
        }
        case 'device-info': {
            return { type: 'device-info:request', payload: { channel: evt.channel, info: evt.payload } };
        }
        default:
            // 알 수 없는건 프론트에서 'event'로 표기
            return { type: 'event', payload: evt };
    }
}

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

    // 2025 08 20
    // [cid-adapter.ts][고수준 명령]: dial → dialOut으로 수정

    ipcm.handle(IPC.CID.DIAL, async (_e, args: { phoneNumber: string; channel?: string }) => {
        adapter.dial(args.phoneNumber, args.channel ?? '1');
        return true;
    });
    // ipcm.handle(IPC.CID.DIAL, async (_e, args: { phoneNumber: string; channel?: string }) => {
    //     adapter.dialOut(args.phoneNumber, args.channel ?? '1');
    //     return true;
    // });

    ipcm.handle(IPC.CID.FORCE_END, async (_e, args?: { channel?: string }) => {
        adapter.forceEnd(args?.channel ?? '1');
        return true;
    });

    ipcm.handle(IPC.CID.DEVICE_INFO, async (_e, args?: { channel?: string }) => {
        adapter.requestDeviceInfo(args?.channel ?? '1');
        return true;
    });

    // 2025 08 20
    ipcm.handle(IPC.CID.INCOMING, async(_e, args: { phoneNumber: string; channel?: string }) => {
        adapter.incoming(args.phoneNumber, args.channel ?? '1');
        return true;
    });

    /**
     * 마지막 수정일: 2025 08 20 월요일
     */
    // push: main -> renderer
    adapter.on('event', (payload) => {
        const mapped = mapToFrontendEvent(payload);
        win.webContents.send(IPC.CID.ON_EVENT, mapped);
    });

    // let lastOpen = false;
    // adapter.on('status', (status) => {
    //     const isOpen = !!status?.isOpen;
    //     win.webContents.send(IPC.CID.ON_EVENT, { type: 'status', payload: status });

    //     if (isOpen !== lastOpen) {
    //         win.webContents.send(IPC.CID.ON_EVENT, { type: isOpen ? 'port:opened' : 'port:closed', payload: { portPath: status?.portPath } });
    //         lastOpen = isOpen;
    //     }
    // });
    adapter.on('status', (status) => {
        win.webContents.send(IPC.CID.ON_EVENT, { type: 'status', status });
    });

    // 포트 탐지 및 연결
    ipcMain.handle(IPC.CID.LIST_PORTS, async () => {
        try {
            return await adapter.listPorts();
        } catch (e: any) {
            return { error: e?.message ?? String(e) };
        }
    });
}