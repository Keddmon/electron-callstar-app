// src/main/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

// interface ParsedPacket {
//   channel: string;
//   opcode: string;
//   payload: string;
//   raw: string;
//   receivedAt: number;
// };

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

type CidEvent =
  | { type: 'incoming'; phoneNumber: string }
  | { type: 'masked'; reason: 'PRIVATE' | 'PUBLIC' | 'UNKNOWN' }
  | { type: 'dial-out'; phoneNumber: string }
  | { type: 'dial-complete' }
  | { type: 'force-end' }
  | { type: 'on-hook' }
  | { type: 'off-hook' }
  | { type: 'unknown' };

export interface Settings {
  cid: {
    lastPortPath?: string;
    baudRate?: number;
    autoReconnect?: boolean;
    lanCardIndex?: number | string;
    switchIp?: string;
    deviceType?: 'callstar' | 'switch';
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

try {
  contextBridge.exposeInMainWorld('cid', {
    open: (path: string) => ipcRenderer.invoke(IPC.CID.OPEN, { path }),
    close: () => ipcRenderer.invoke(IPC.CID.CLOSE),
    status: () => ipcRenderer.invoke(IPC.CID.STATUS),
    listPorts: () => ipcRenderer.invoke(IPC.CID.LIST_PORTS),
    deviceInfo: () => ipcRenderer.invoke(IPC.CID.DEVICE_INFO),
    dialOut: (phoneNumber: string) => ipcRenderer.invoke(IPC.CID.DIAL_OUT, { phoneNumber }),
    forceEnd: () => ipcRenderer.invoke(IPC.CID.FORCE_END),
    incoming: (phoneNumber: string) => ipcRenderer.invoke(IPC.CID.INCOMING, { phoneNumber }),
    dialComplete: () => ipcRenderer.invoke(IPC.CID.DIAL_COMPLETE),
    onHook: () => ipcRenderer.invoke(IPC.CID.ON_HOOK),
    offHook: () => ipcRenderer.invoke(IPC.CID.OFF_HOOK),

    onEvent: (handler: (evt: CidEvent) => void) => {
      if (typeof handler !== 'function') {
        console.error('[preload] onEvent handler must be a function.');
        return () => { };
      }
      const wrapped = (_e: Electron.IpcRendererEvent, payload: CidEvent) => handler(payload);
      ipcRenderer.on(IPC.CID.EVENT, wrapped);
      return () => ipcRenderer.removeListener(IPC.CID.EVENT, wrapped);
    },

    // new: status updates (adapter status changes)
    onStatus: (handler: (status: any) => void) => {
      if (typeof handler !== 'function') {
        console.error('[preload] onStatus handler must be a function.');
        return () => { };
      }
      const wrapped = (_e: Electron.IpcRendererEvent, payload: any) => handler(payload);
      ipcRenderer.on(IPC.CID.STATUS, wrapped);
      return () => ipcRenderer.removeListener(IPC.CID.STATUS, wrapped);
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

try {
  contextBridge.exposeInMainWorld('nav', {
    back: () => ipcRenderer.invoke('nav:back'),
    forward: () => ipcRenderer.invoke('nav:forward'),
    getState: () => ipcRenderer.invoke('nav:state'),
    onState: (handler: (s: { canGoBack: boolean; canGoForward: boolean; url: string }) => void) => {
      if (typeof handler !== 'function') return () => { };
      const wrapped = (_: Electron.IpcRendererEvent, state: any) => handler(state);
      ipcRenderer.on('nav:state', wrapped);
      return () => ipcRenderer.removeListener('nav:state', wrapped);
    },
  });
  console.log('[preload] exposed window.nav');
} catch (e) {
  console.error('[preload] nav expose failed', e);
}