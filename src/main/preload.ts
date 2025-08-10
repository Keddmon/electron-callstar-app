/**
 * preload.ts
 * ---
 * contextIsolation + 안전한 IPC 브리지
 */
import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from './ipc/channels';

contextBridge.exposeInMainWorld('cid', {
    open: (path: string, baudRate?: number) =>
        ipcRenderer.invoke(IPC.CID.OPEN, { path, baudRate }),
    close: () => ipcRenderer.invoke(IPC.CID.CLOSE),
    status: () => ipcRenderer.invoke(IPC.CID.STATUS),
    dial: (phoneNumber: string, channel = '1') =>
        ipcRenderer.invoke(IPC.CID.DIAL, { phoneNumber, channel }),
    forceEnd: (channel = '1') => ipcRenderer.invoke(IPC.CID.FORCE_END, { channel }),
    deviceInfo: (channel = '1') => ipcRenderer.invoke(IPC.CID.DEVICE_INFO, { channel }),
    onEvent: (handler: (evt: any) => void) => {
        const wrapped = (_e: any, payload: any) => handler(payload);
        ipcRenderer.on(IPC.CID.ON_EVENT, wrapped);
        return () => ipcRenderer.removeListener(IPC.CID.ON_EVENT, wrapped);
    },
});

declare global {
    interface Window {
        cid: {
            open: (path: string, baudRate?: number) => Promise<any>;
            close: () => Promise<any>;
            status: () => Promise<any>;
            dial: (phone: string, channel?: string) => Promise<boolean>;
            forceEnd: (channel?: string) => Promise<boolean>;
            deviceInfo: (channel?: string) => Promise<boolean>;
            onEvent: (handler: (evt: any) => void) => () => void; // unsubscribe
        };
    }
}