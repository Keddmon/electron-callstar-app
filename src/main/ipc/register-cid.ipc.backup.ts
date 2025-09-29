// /**
//  * 메인프로세스 IPC 핸들러 묶음
//  * --
//  */
// import { BrowserWindow, IpcMain, ipcMain } from 'electron';
// import { CidAdapter } from '../cid/cid.adapter';
// import logger from '../logs/logger';
// import { IPC } from './channels';
// import { CidAdapterStatus } from '../interfaces/cid.interface';
// import { IpcResult } from '../types/ipc';
// import { CidEvent, CidPortInfo } from '../types/cid';

// /**
//  * CidIpc (cid.adapter) 등록
//  * --
//  * - ipcm.handle: 양방향 통신
//  * - adapter.on:  단방향 통신
//  */
// export function registerCidIpc(adapter: CidAdapter, getWindow: () => BrowserWindow | null, ipcm: IpcMain = ipcMain) {

//   // CID OPEN
//   ipcm.handle(IPC.CID.OPEN, async (_e, { path }): Promise<IpcResult<CidAdapterStatus>> => {
//     try {
//       await adapter.open(path);
//       return { data: adapter.getStatus(), error: null };
//     } catch (e: any) {
//       logger.error(`[IPC Error] ${IPC.CID.OPEN}: `, e);
//       return { data: null, error: e.message || String(e) };
//     }
//   });

//   // CID CLOSE
//   ipcm.handle(IPC.CID.CLOSE, async (): Promise<IpcResult<CidAdapterStatus>> => {
//     try {
//       await adapter.close();
//       return { data: adapter.getStatus(), error: null };
//     } catch (e: any) {
//       logger.error(`[IPC Error] ${IPC.CID.CLOSE}: `, e);
//       return { data: null, error: e.message || String(e) };
//     }
//   });

//   // CID STATUS
//   ipcm.handle(IPC.CID.STATUS, async (): Promise<IpcResult<CidAdapterStatus>> => {
//     try {
//       const status = adapter.getStatus();
//       return { data: status, error: null };
//     } catch (e: any) {
//       logger.error(`[IPC Error] ${IPC.CID.STATUS}: `, e);
//       return { data: null, error: e.message || String(e) };
//     }
//   });

//   // LIST PORTS
//   ipcm.handle(IPC.CID.LIST_PORTS, async (): Promise<IpcResult<CidPortInfo[]>> => {
//     try {
//       const ports = await adapter.listPorts();
//       return { data: ports, error: null };
//     } catch (e: any | unknown) {
//       logger.error(`[IPC Error] ${IPC.CID.LIST_PORTS}: `, e);
//       throw new Error(`[cid][listPorts] Error ${e.message}`)
//     }
//   });

//   // CID DEVICE INFO
//   ipcm.handle(IPC.CID.DEVICE_INFO, async (): Promise<IpcResult<any>> => {
//     try {
//       const result = adapter.requestDeviceInfo();
//       return { data: result, error: null };
//     } catch (e: any | unknown) {
//       logger.error(`[IPC Error] ${IPC.CID.DEVICE_INFO}: `, e);
//       return { data: null, error: e.message };
//     }
//   });

//   // DIAL OUT
//   ipcm.handle(IPC.CID.DIAL_OUT, async (_e, args: { phoneNumber: string }): Promise<IpcResult<boolean>> => {
//     try {
//       adapter.dialOut(args.phoneNumber);
//       return { data: true, error: null };
//     } catch (e: any) {
//       logger.error(`[IPC Error] ${IPC.CID.DIAL_OUT}: `, e);
//       return { data: null, error: e.message || String(e) };
//     }
//   });

//   // FORCE END
//   ipcm.handle(IPC.CID.FORCE_END, async (): Promise<IpcResult<boolean>> => {
//     try {
//       adapter.forceEnd();
//       return { data: true, error: null };
//     } catch (e: any) {
//       logger.error(`[IPC Error] ${IPC.CID.FORCE_END} `, e);
//       return { data: null, error: e.message || String(e) };
//     }
//   });

//   // INCOMING
//   ipcm.handle(IPC.CID.INCOMING, async (_e, { phoneNumber }): Promise<IpcResult<any>> => {
//     try {
//       const result = adapter.incoming(phoneNumber);
//       return { data: result, error: null };
//     } catch (e: any) {
//       logger.error(`[IPC Error] ${IPC.CID.INCOMING}`, e);
//       throw new Error(`[IPC Error] ${e.message}`);
//     }
//   });

//   // DIAL COMPLETE
//   ipcm.handle(IPC.CID.DIAL_COMPLETE, async (): Promise<IpcResult<boolean>> => {
//     try {
//       adapter.dialComplete();
//       return { data: true, error: null };
//     } catch (e: any) {
//       logger.error(`[IPC Error] ${IPC.CID.DIAL_COMPLETE}`, e);
//       return { data: null, error: e.message || String(e) };
//     }
//   });

//   // OFF HOOK
//   ipcm.handle(IPC.CID.OFF_HOOK, async (): Promise<IpcResult<boolean>> => {
//     try {
//       adapter.offHook();
//       return { data: true, error: null };
//     } catch (e: any) {
//       logger.error(`[IPC Error] ${IPC.CID.OFF_HOOK}`, e);
//       return { data: null, error: e.message || String(e) };
//     }
//   });

//   // ON HOOK
//   ipcm.handle(IPC.CID.ON_HOOK, async (): Promise<IpcResult<boolean>> => {
//     try {
//       adapter.onHook();
//       return { data: true, error: null };
//     } catch (e: any) {
//       logger.error(`[IPC Error] ${IPC.CID.ON_HOOK}`, e);
//       return { data: null, error: e.message || String(e) };
//     }
//   });

//   // Electron → Frontend 단방향 이벤트 전송
//   const sendToFrontend = (channel: string, payload: any) => {
//     const win = getWindow();
//     if (win && !win.isDestroyed()) {
//       win.webContents.send(channel, payload);
//     }
//   };

//   adapter.on('event', (payload: CidEvent) => {
//     sendToFrontend(IPC.CID.EVENT, payload);
//   });

//   adapter.on('status', (status: CidAdapterStatus) => {
//     sendToFrontend(IPC.CID.EVENT, { type: 'status', status });
//   });
// }