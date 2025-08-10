"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * preload.ts
 * ---
 * contextIsolation + 안전한 IPC 브리지
 */
const electron_1 = require("electron");
const channels_1 = require("./ipc/channels");
electron_1.contextBridge.exposeInMainWorld('cid', {
    open: (path, baudRate) => electron_1.ipcRenderer.invoke(channels_1.IPC.CID.OPEN, { path, baudRate }),
    close: () => electron_1.ipcRenderer.invoke(channels_1.IPC.CID.CLOSE),
    status: () => electron_1.ipcRenderer.invoke(channels_1.IPC.CID.STATUS),
    dial: (phoneNumber, channel = '1') => electron_1.ipcRenderer.invoke(channels_1.IPC.CID.DIAL, { phoneNumber, channel }),
    forceEnd: (channel = '1') => electron_1.ipcRenderer.invoke(channels_1.IPC.CID.FORCE_END, { channel }),
    deviceInfo: (channel = '1') => electron_1.ipcRenderer.invoke(channels_1.IPC.CID.DEVICE_INFO, { channel }),
    onEvent: (handler) => {
        const wrapped = (_e, payload) => handler(payload);
        electron_1.ipcRenderer.on(channels_1.IPC.CID.ON_EVENT, wrapped);
        return () => electron_1.ipcRenderer.removeListener(channels_1.IPC.CID.ON_EVENT, wrapped);
    },
});
//# sourceMappingURL=preload.js.map