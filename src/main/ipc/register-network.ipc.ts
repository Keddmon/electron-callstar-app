import { IpcMain, ipcMain } from 'electron';
import { IPC } from '../constants/ipc.constant';
import { listInterfaces, getArpTable } from '../network/network-info';

export function registerNetworkIpc(ipcm: IpcMain = ipcMain) {
  ipcm.handle(IPC.NET.LIST_INTERFACES, async () => listInterfaces());
  ipcm.handle(IPC.NET.ARP_TABLE, async () => getArpTable());
}