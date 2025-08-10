"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCidIpc = registerCidIpc;
const electron_1 = require("electron");
const channels_1 = require("./channels");
function registerCidIpc(adapter, win, ipcm = electron_1.ipcMain) {
    ipcm.handle(channels_1.IPC.CID.OPEN, async (_e, args) => {
        await adapter.open(args);
        return adapter.getStatus();
    });
    ipcm.handle(channels_1.IPC.CID.CLOSE, async () => {
        await adapter.close();
        return adapter.getStatus();
    });
    ipcm.handle(channels_1.IPC.CID.STATUS, async () => adapter.getStatus());
    ipcm.handle(channels_1.IPC.CID.DIAL, async (_e, args) => {
        adapter.dial(args.phoneNumber, args.channel ?? '1');
        return true;
    });
    ipcm.handle(channels_1.IPC.CID.FORCE_END, async (_e, args) => {
        adapter.forceEnd(args?.channel ?? '1');
        return true;
    });
    ipcm.handle(channels_1.IPC.CID.DEVICE_INFO, async (_e, args) => {
        adapter.requestDeviceInfo(args?.channel ?? '1');
        return true;
    });
    // push: main -> renderer
    adapter.on('event', (payload) => {
        win.webContents.send(channels_1.IPC.CID.ON_EVENT, payload);
    });
    adapter.on('status', (status) => {
        win.webContents.send(channels_1.IPC.CID.ON_EVENT, { type: 'status', status });
    });
}
//# sourceMappingURL=register-cid.ipc.js.map