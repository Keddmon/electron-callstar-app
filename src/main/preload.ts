/**
 * preload.ts
 * ---
 * contextIsolation + 안전한 IPC 브리지
 */
import { contextBridge, ipcRenderer } from 'electron';

/**
 * IPC 채널명 상수
 * ---
 */
export const IPC = {
    CID: {
        OPEN: 'cid:open',
        CLOSE: 'cid:close',
        STATUS: 'cid:status',
        DIAL: 'cid:dial',
        FORCE_END: 'cid:forceEnd',
        DEVICE_INFO: 'cid:deviceInfo',
        ON_EVENT: 'cid:onEvent',
        LIST_PORTS: 'cid:listPorts',
    },
} as const;

console.log('[preload] running. href=', location.href, 'electron=', process.versions.electron);

try {
    contextBridge.exposeInMainWorld('cid', {
        open: (path: string, baudRate?: number) => ipcRenderer.invoke(IPC.CID.OPEN, { path, baudRate }),
        close: () => ipcRenderer.invoke(IPC.CID.CLOSE),
        status: () => ipcRenderer.invoke(IPC.CID.STATUS),
        dial: (phoneNumber: string, channel = '1') => ipcRenderer.invoke(IPC.CID.DIAL, { phoneNumber, channel }),
        forceEnd: (channel = '1') => ipcRenderer.invoke(IPC.CID.FORCE_END, { channel }),
        deviceInfo: (channel = '1') => ipcRenderer.invoke(IPC.CID.DEVICE_INFO, { channel }),
        listPorts: () => ipcRenderer.invoke(IPC.CID.LIST_PORTS),
        onEvent: (handler: (evt: any) => void) => {
            const wrapped = (_e: any, payload: any) => handler(payload);
            ipcRenderer.on(IPC.CID.ON_EVENT, wrapped);
            return () => ipcRenderer.removeListener(IPC.CID.ON_EVENT, wrapped);
        },
    });
    console.log('[preload] exposed window.cid');
} catch (e) {
    console.error('[preload] failed', e);
}

declare global {
    interface Window {
        cid: {
            open: (path: string, baudRate?: number) => Promise<any>;
            close: () => Promise<any>;
            status: () => Promise<any>;
            dial: (phone: string, channel?: string) => Promise<boolean>;
            forceEnd: (channel?: string) => Promise<boolean>;
            deviceInfo: (channel?: string) => Promise<boolean>;
            listPorts: () => Promise<any>; // ← 추가
            onEvent: (handler: (evt: any) => void) => () => void;
        };
    }
}