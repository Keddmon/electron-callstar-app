import { BrowserWindow, IpcMain, ipcMain } from 'electron';
import { CidAdapter } from '../cid/cid.adapter';
import { IPC } from './channels';
import { IpcResult } from '../types/ipc';
import logger from '../logs/logger';
import { CidEvent, CidPortInfo } from '../types/cid';
import { CidAdapterStatus } from '../interfaces/cid.interface';
import { settingsStore } from '../state/settings-store';

/**
 * CID 어댑터 이벤트 → Frontend 이벤트 변환 (편의)
 * --
 */
function mapToFrontendEvent(evt: CidEvent) {
    switch (evt?.type) {
        case 'device-info':
            return { type: 'cid:deviceInfo', payload: { channel: evt.channel, info: evt.payload } };

        case 'incoming':
            return { type: 'cid:incoming', payload: { channel: evt.channel, phoneNumber: evt.phoneNumber } };
        case 'masked':
            return { type: 'cid:incoming', payload: { channel: evt.channel, reason: evt.reason } };

        case 'dial-out':
            return { type: 'cid:dialOut', payload: { channel: evt.channel, phoneNumber: evt.phoneNumber } };
        case 'dial-complete':
            return { type: 'cid:dialComplete', payload: { channel: evt.channel } };
        case 'force-end':
            return { type: 'cid:forceEnd', payload: { channel: evt.channel } };

        case 'on-hook':
            return { type: 'cid:onHook', payload: { channel: evt.channel } };
        case 'off-hook':
            return { type: 'cid:offHook', payload: { channel: evt.channel } };

        default:
            logger.warn('[IPC] Unknown CID event type received: ', evt);
            return { type: 'event', payload: evt };
    }
}

/**
 * CidIpc (cid.adapter) 등록
 * --
 * - ipcm.handle: 양방향 통신
 * - adapter.on:  단방향 통신
 */
export function registerCidIpc(adapter: CidAdapter, win: BrowserWindow, ipcm: IpcMain = ipcMain) {
    const DEFAULT_CHANNEL = '1';

    // CID OPEN
    ipcm.handle(IPC.CID.OPEN, async (_e, args: { path: string; baudRate?: number }): Promise<IpcResult<CidAdapterStatus>> => {
        try {
            await adapter.open(args);
            return { data: adapter.getStatus(), error: null };
        } catch (e: any) {
            logger.error(`[IPC Error] ${IPC.CID.OPEN}: `, e);
            return { data: null, error: e.message || String(e) };
        }
    });

    // CID CLOSE
    ipcm.handle(IPC.CID.CLOSE, async (): Promise<IpcResult<CidAdapterStatus>> => {
        try {
            await adapter.close();
            return { data: adapter.getStatus(), error: null };
        } catch (e: any) {
            logger.error(`[IPC Error] ${IPC.CID.CLOSE}: `, e);
            return { data: null, error: e.message || String(e) };
        }
    });

    // CID STATUS
    ipcm.handle(IPC.CID.STATUS, async (): Promise<IpcResult<CidAdapterStatus>> => {
        try {
            const status = adapter.getStatus();
            return { data: status, error: null };
        } catch (e: any) {
            logger.error(`[IPC Error] ${IPC.CID.STATUS}: `, e);
            return { data: null, error: e.message || String(e) };
        }
    });

    // LIST PORTS
    ipcm.handle(IPC.CID.LIST_PORTS, async (): Promise<IpcResult<CidPortInfo[]>> => {
        try {
            const ports = await adapter.listPorts();
            return { data: ports, error: null };
        } catch (e: any) {
            logger.error(`[IPC Error] ${IPC.CID.LIST_PORTS}: `, e);
            return { data: null, error: e.message || String(e) };
        }
    });

    // CID DEVICE INFO
    ipcm.handle(IPC.CID.DEVICE_INFO, async (_e, args?: { channel?: string }): Promise<IpcResult<boolean>> => {
        try {
            adapter.requestDeviceInfo(args?.channel ?? DEFAULT_CHANNEL);
            return { data: true, error: null };
        } catch (e: any) {
            logger.error(`[IPC Error] ${IPC.CID.DEVICE_INFO}: `, e);
            return { data: null, error: e.message || String(e) };
        }
    });

    // DIAL OUT
    ipcm.handle(IPC.CID.DIAL_OUT, async (_e, args: { phoneNumber: string; channel?: string }): Promise<IpcResult<boolean>> => {
        try {
            adapter.dialOut(args.phoneNumber, args.channel ?? DEFAULT_CHANNEL);
            return { data: true, error: null };
        } catch (e: any) {
            logger.error(`[IPC Error] ${IPC.CID.DIAL_OUT}: `, e);
            return { data: null, error: e.message || String(e) };
        }
    });

    // FORCE END
    ipcm.handle(IPC.CID.FORCE_END, async (_e, args?: { channel?: string }): Promise<IpcResult<boolean>> => {
        try {
            adapter.forceEnd(args?.channel ?? DEFAULT_CHANNEL);
            return { data: true, error: null };
        } catch (e: any) {
            logger.error(`[IPC Error] ${IPC.CID.FORCE_END} `, e);
            return { data: null, error: e.message || String(e) };
        }
    });

    // INCOMING
    ipcm.handle(IPC.CID.INCOMING, async (_e, args: { phoneNumber: string, channel?: string }): Promise<IpcResult<boolean>> => {
        try {
            adapter.incoming(args.phoneNumber, args.channel ?? DEFAULT_CHANNEL);
            return { data: true, error: null };
        } catch (e: any) {
            logger.error(`[IPC Error] ${IPC.CID.INCOMING}`, e);
            return { data: null, error: e.message || String(e) };
        }
    });

    // DIAL COMPLETE
    ipcm.handle(IPC.CID.DIAL_COMPLETE, async (_e, args?: { channel?: string }): Promise<IpcResult<boolean>> => {
        try {
            adapter.dialComplete(args?.channel ?? DEFAULT_CHANNEL);
            return { data: true, error: null };
        } catch (e: any) {
            logger.error(`[IPC Error] ${IPC.CID.DIAL_COMPLETE}`, e);
            return { data: null, error: e.message || String(e) };
        }
    });

    // OFF HOOK
    ipcm.handle(IPC.CID.OFF_HOOK, async (_e, args?: { channel?: string }): Promise<IpcResult<boolean>> => {
        try {
            adapter.offHook(args?.channel ?? DEFAULT_CHANNEL);
            return { data: true, error: null };
        } catch (e: any) {
            logger.error(`[IPC Error] ${IPC.CID.OFF_HOOK}`, e);
            return { data: null, error: e.message || String(e) };
        }
    });

    // ON HOOK
    ipcm.handle(IPC.CID.ON_HOOK, async (_e, args?: { channel?: string }): Promise<IpcResult<boolean>> => {
        try {
            adapter.onHook(args?.channel ?? DEFAULT_CHANNEL);
            return { data: true, error: null };
        } catch (e: any) {
            logger.error(`[IPC Error] ${IPC.CID.ON_HOOK}`, e);
            return { data: null, error: e.message || String(e) };
        }
    });

    // 메인 → 렌더러 이벤트 푸시
    adapter.on('event', (payload: CidEvent) => {
        const mapped = mapToFrontendEvent(payload);
        win.webContents.send(IPC.CID.EVENT, mapped);
    });

    adapter.on('status', (status: CidAdapterStatus) => {
        win.webContents.send(IPC.CID.EVENT, { type: 'status', status });
    });
}