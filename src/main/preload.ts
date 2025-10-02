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
  | { type: 'incoming'; payload: string | null, callId?: string; channel?: string }
  | { type: 'masked'; payload: 'PRIVATE' | 'PUBLIC' | 'UNKNOWN'; callId?: string, channel?: string }
  | { type: 'answered'; callId?: string, channel?: string }
  | { type: 'end'; reason?: 'bye' | 'cancel' | 'failed' | 'timeout'; callId?: string; channel?: string }

  | { type: 'device-info'; payload: string | null }
  | { type: 'dial-out'; payload: string; callId?: string }
  | { type: 'dial-complete'; callId?: string }
  | { type: 'force-end'; callId?: string }
  | { type: 'on-hook'; callId?: string; }
  | { type: 'off-hook'; callId?: string; };

// type Settings = {
//   cid: {
//     deviceType?: 'callstar' | 'switch';
//     lastPortPath?: string;
//     autoReconnect?: boolean;
//     switchIp?: string;
//     lanCardIndex?: number;
//   };
//   sip: {
//     captureIp?: string;
//     filter?: string;
//   };
//   ipPhone: {
//     phoneNumber?: string;
//     ipAddress?: string;
//     macAddress?: string;
//     autoDetect?: boolean;
//   };
//   app: {
//     startOnLogin?: boolean
//   };
//   window?: {
//     width?: number;
//     height?: number;
//     x?: number;
//     y?: number;
//   };
// };

// export interface NetIf {
//   name: string;
//   address: string;
//   netmask: string;
//   family: string;
//   mac: string;
//   internal: boolean;
// }

// export interface ArpEntry {
//   ip: string;
//   mac: string;
//   type?: string;
// }



/** ===== CID ===== */
try {
  contextBridge.exposeInMainWorld('cid', {
    open: (path?: string) => ipcRenderer.invoke(IPC.CID.OPEN, { path }),
    close: () => ipcRenderer.invoke(IPC.CID.CLOSE),
    status: () => ipcRenderer.invoke(IPC.CID.STATUS),
    listPorts: () => ipcRenderer.invoke(IPC.CID.LIST_PORTS),
    // deviceInfo: () => ipcRenderer.invoke(IPC.CID.DEVICE_INFO),
    // dialOut: (payload: string) => ipcRenderer.invoke(IPC.CID.DIAL_OUT, { payload }),
    // forceEnd: () => ipcRenderer.invoke(IPC.CID.FORCE_END),
    incoming: (payload: string) => ipcRenderer.invoke(IPC.CID.INCOMING, { payload }),
    // dialComplete: () => ipcRenderer.invoke(IPC.CID.DIAL_COMPLETE),
    // onHook: () => ipcRenderer.invoke(IPC.CID.ON_HOOK),
    // offHook: () => ipcRenderer.invoke(IPC.CID.OFF_HOOK),

    onEvent: (handler: (evt: CidEvent) => void) => {
      if (typeof handler !== 'function') {
        console.error('[preload] onEvent handler must be a function.');
        return () => { };
      }
      const wrapped = (_e: Electron.IpcRendererEvent, payload: CidEvent) => handler(payload);
      ipcRenderer.on(IPC.CID.EVENT, wrapped);
      return () => ipcRenderer.removeListener(IPC.CID.EVENT, wrapped);
    },

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

/** ===== SETTINGS ===== */
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

/** ===== NET ===== */
try {
  contextBridge.exposeInMainWorld('net', {
    listInterfaces: () => ipcRenderer.invoke(IPC.NET.LIST_INTERFACES),
    getArpTable: () => ipcRenderer.invoke(IPC.NET.ARP_TABLE),
  });
  console.log('[preload] exposed window.net');
} catch (e) {
  console.error('[preload] failed', e);
}

/** ===== NAVIGATION ===== */
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