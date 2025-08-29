/**
 * renderer에 노출되는 IPC 브리지(window.cid)
 * --
 */
import { contextBridge, ipcRenderer } from 'electron';

// // import { IPC } from './ipc/channels';
// // import { IpcResult } from './types/ipc';
// // import { CidEvent, CidPortInfo } from './types/cid';
// import { CidAdapterStatus } from './interfaces/cid.interface';

/**
 * preload.ts: TypeScript 컴파일러가 변환 과정에서 import를 제대로 읽지 못함
 * → preload.ts안에서 channel, type, interface 직접 선언
 */
interface ParsedPacket {
    channel: string;
    opcode: string;
    payload: string;
    raw: string;
    receivedAt: number;
};

interface CidAdapterStatus {
    isOpen: boolean;
    portPath?: string;
    lastEventAt?: number;
    lastPacket?: ParsedPacket | null;
};

const IPC = {
    CID: {
        OPEN: 'cid:open',
        CLOSE: 'cid:close',
        STATUS: 'cid:status',
        LIST_PORTS: 'cid:listPorts',
        DEVICE_INFO: 'cid:deviceInfo',
        INCOMING: 'cid:incoming',
        DIAL_OUT: 'cid:dialOut',
        DIAL_COMPLETE: 'cid:dialComplete',
        FORCE_END: 'cid:forceEnd',
        ON_HOOK: 'cid:onHook',
        OFF_HOOK: 'cid:offHook',
        EVENT: 'cid:event',
    },
} as const;

type IpcResult<T> = {
    data: T | null;
    error: string | null;
};

type CidPortInfo = {
    path: string;
    manufacturer?: string;
    serialNumber?: string;
    pnpId?: string;
    locationId?: string;
    vendorId?: string;
    productId?: string;
    friendlyName?: string;
    isLikelyCid: boolean;
};

type CidEvent =
    | { type: 'device-info'; channel: string; payload: string }

    | { type: 'incoming'; channel: string; phoneNumber: string }
    | { type: 'masked'; channel: string; reason: 'PRIVATE' | 'PUBLIC' | 'UNKNOWN' }

    | { type: 'dial-out'; channel: string; phoneNumber: string }
    | { type: 'dial-complete'; channel: string; }
    | { type: 'force-end'; channel: string; }

    | { type: 'on-hook', channel: string; }
    | { type: 'off-hook', channel: string; }

    | { type: 'raw', packet: ParsedPacket };

console.log('[preload] running. href=', location.href, 'electron=', process.versions.electron);

try {
    contextBridge.exposeInMainWorld('cid', {
        open: (path: string, baudRate?: number) => ipcRenderer.invoke(IPC.CID.OPEN, { path, baudRate }),
        close: () => ipcRenderer.invoke(IPC.CID.CLOSE),
        status: () => ipcRenderer.invoke(IPC.CID.STATUS),

        listPorts: () => ipcRenderer.invoke(IPC.CID.LIST_PORTS),

        deviceInfo: (channel = '1') => ipcRenderer.invoke(IPC.CID.DEVICE_INFO, { channel }),
        dialOut: (phoneNumber: string, channel = '1') => ipcRenderer.invoke(IPC.CID.DIAL_OUT, { phoneNumber, channel }),
        forceEnd: (channel = '1') => ipcRenderer.invoke(IPC.CID.FORCE_END, { channel }),

        onEvent: (handler: (evt: CidEvent) => void) => {
            if (typeof handler !== 'function') {
                console.error('[preload] onEvent handler must be a function.');
                return () => { };
            }
            const wrapped = (_e: Electron.IpcRendererEvent, payload: CidEvent) => handler(payload);

            ipcRenderer.on(IPC.CID.EVENT, wrapped);
            return () => ipcRenderer.removeListener(IPC.CID.EVENT, wrapped);
        },
    });
    console.log('[preload] exposed window.cid');
} catch (e) {
    console.error('[preload] failed', e);
}

declare global {
    interface Window {
        cid: {
            open: (path: string, baudRate?: number) => Promise<IpcResult<CidAdapterStatus>>;
            close: () => Promise<IpcResult<CidAdapterStatus>>;
            status: () => Promise<IpcResult<CidAdapterStatus>>;
            listPorts: () => Promise<IpcResult<CidPortInfo[]>>;

            deviceInfo: (channel?: string) => Promise<IpcResult<boolean>>;
            dialOut: (phoneNumber: string, channel?: string) => Promise<IpcResult<boolean>>;
            forceEnd: (channel?: string) => Promise<IpcResult<boolean>>;

            onEvent: (handler: (evt: CidEvent) => void) => () => void;
        };
    }
}