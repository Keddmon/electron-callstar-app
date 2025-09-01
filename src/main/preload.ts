/**
 * 메인 프로세스 + 렌더러 프로세스 연결
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
    SETTINGS: {
        GET: 'settings:get',
        SET: 'settings:set',
        PATCH: 'settings:patch',
    },
    NET: {
        LIST_INTERFACES: 'net:listInterfaces',
        ARP_TABLE: 'net:arpTable',
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

export interface Settings {
    cid: {
        lastPortPath?: string;
        baudRate?: number;
        autoReconnect?: boolean;
    };
    ipPhone: {
        phoneNumber?: string;
        ipAddress?: string;
        macAddress?: string;
        autoDetect?: boolean;
    };
    app: {
        startOnLogin?: boolean;
    };
    window?: {
        width?: number;
        height?: number;
        x?: number;
        y?: number;
    };
}

// Main Process의 `network-info.ts`에 정의된 타입
export interface NetIf {
    name: string;
    address: string;
    netmask: string;
    family: string;
    mac: string;
    internal: boolean;
}

export interface ArpEntry {
    ip: string;
    mac: string;
    type?: string;
}

console.log('[preload] running. href=', location.href, 'electron=', process.versions.electron);

try {
    contextBridge.exposeInMainWorld('cid', {
        open: (path: string, baudRate?: number) => ipcRenderer.invoke(IPC.CID.OPEN, { path, baudRate }),
        close: () => ipcRenderer.invoke(IPC.CID.CLOSE),
        status: () => ipcRenderer.invoke(IPC.CID.STATUS),

        listPorts: () => ipcRenderer.invoke(IPC.CID.LIST_PORTS),

        deviceInfo: (channel = '1') => ipcRenderer.invoke(IPC.CID.DEVICE_INFO, { channel }),
        dialOut: (channel = '1', phoneNumber: string) => ipcRenderer.invoke(IPC.CID.DIAL_OUT, { channel, phoneNumber }),
        forceEnd: (channel = '1') => ipcRenderer.invoke(IPC.CID.FORCE_END, { channel }),

        incoming: (channel = '1', phoneNumber: string) => ipcRenderer.invoke(IPC.CID.INCOMING, { channel, phoneNumber }),
        dialComplete: (channel = '1') => ipcRenderer.invoke(IPC.CID.DIAL_COMPLETE, { channel }),
        onHook: (channel = '1') => ipcRenderer.invoke(IPC.CID.ON_HOOK, { channel }),
        offHook: (channel = '1') => ipcRenderer.invoke(IPC.CID.OFF_HOOK, { channel }),

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

try {
    contextBridge.exposeInMainWorld('settings', {
        get: () => ipcRenderer.invoke(IPC.SETTINGS.GET),
        set: (settings: any) => ipcRenderer.invoke(IPC.SETTINGS.SET, settings),
        patch: (partialSettings: any) => ipcRenderer.invoke(IPC.SETTINGS.PATCH, partialSettings),
    });
    console.log('[preload] exposed window.settings');
} catch (e) {
    console.error('[preload] failed', e);
}

try {
    contextBridge.exposeInMainWorld('net', {
        listInterfaces: () => ipcRenderer.invoke(IPC.NET.LIST_INTERFACES),
        getArpTable: () => ipcRenderer.invoke(IPC.NET.ARP_TABLE),
    });
    console.log('[preload] exposed window.net');
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

            incoming: (phoneNumber: string, channel?: string) => Promise<IpcResult<boolean>>;
            dialComplete: (channel?: string) => Promise<IpcResult<boolean>>;
            onHook: (channel?: string) => Promise<IpcResult<boolean>>;
            offHook: (channel?: string) => Promise<IpcResult<boolean>>;

            onEvent: (handler: (evt: CidEvent) => void) => () => void;
        };
        /**
         * 설정 관련 API
         */
        settings: {
            get: () => Promise<Settings>;
            set: (settings: Settings) => Promise<void>;
            patch: (partialSettings: Partial<Settings>) => Promise<void>;
        };

        /**
         * 네트워크 정보 API
         */
        net: {
            listInterfaces: () => Promise<NetIf[]>;
            getArpTable: () => Promise<ArpEntry[]>;
        };
    }
}