import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

/**
 * NOTE
 * - build 시, preload.ts에서 import 에러 발생
 * → constants, interfaces, types 직접 작성
 */
const IPC = {
  CID: {
    OPEN: 'cid:open',
    CLOSE: 'cid:close',
    STATUS: 'cid:status',
    EVENT: 'cid:event',
    SWITCH_CID: 'cid:switchCid',
    LIST_PORTS: 'cid:listPorts',
    LIST_SWITCHES: 'cid:listSwitches',
    INCOMING: 'cid:incoming',
  },
  SETTINGS: {
    GET: 'settings:get',
    SET: 'settings:set',
    PATCH: 'settings:patch',
  },
  NAV: {
    STATE: 'nav:state',
  },
};

type CidEvent =
  | {
      type: 'incoming';
      payload: string | undefined;
      callId?: string;
      channel?: string;
      extension?: string;
    }
  | {
      type: 'masked';
      payload: 'PRIVATE' | 'PUBLIC' | 'UNKNOWN';
      callId?: string;
      channel?: string;
      extension?: string;
    }
  | { type: 'answered'; callId?: string; channel?: string; extension?: string }
  | {
      type: 'end';
      reason?: 'bye' | 'cancel' | 'failed' | 'timeout';
      callId?: string;
      channel?: string;
      extension?: string;
    }
  | { type: 'device-info'; payload: string | null; extension?: string }
  | { type: 'dial-out'; payload: string; callId?: string; extension?: string }
  | { type: 'dial-complete'; callId?: string; extension?: string }
  | { type: 'force-end'; callId?: string; extension?: string }
  | { type: 'on-hook'; callId?: string; extension?: string }
  | { type: 'off-hook'; callId?: string; extension?: string };

interface CidStatus {
  isOpen: boolean;
  cidType?: 'callstar' | 'switch' | undefined;
  callstarPort?: string;
  captureDevice?: string;
}

interface IpPhone {
  ipAddress: string;
  extension: string;
  description?: string;
  macAddress?: string;
}

interface Settings {
  cid: {
    cidType: 'callstar' | 'switch' | undefined;
    callstarPort?: string;
    captureDevice?: string;
  };
  ipPhones: IpPhone[];
  window?: {
    width?: number;
    height?: number;
    x?: number;
    y?: number;
  };
}

function buildApi() {
  const api = {
    cid: {
      open: (args?: { path: string }) => ipcRenderer.invoke(IPC.CID.OPEN, args),
      close: () => ipcRenderer.invoke(IPC.CID.CLOSE),
      getStatus: () => ipcRenderer.invoke(IPC.CID.STATUS),
      switchCid: (args: {
        cidType: string;
        callstarPort?: string;
        captureDevice?: string;
      }) => ipcRenderer.invoke(IPC.CID.SWITCH_CID, args),
      listPorts: () => ipcRenderer.invoke(IPC.CID.LIST_PORTS),
      listSwitches: () => ipcRenderer.invoke(IPC.CID.LIST_SWITCHES),

      onEvent: (callback: (evt: CidEvent) => void) => {
        const handler = (_e: IpcRendererEvent, evt: CidEvent) => callback(evt);
        ipcRenderer.on(IPC.CID.EVENT, handler);
        return () => ipcRenderer.removeListener(IPC.CID.EVENT, handler);
      },
      onStatus: (callback: (status: CidStatus) => void) => {
        const handler = (_e: IpcRendererEvent, status: CidStatus) =>
          callback(status);
        ipcRenderer.on(IPC.CID.STATUS, handler);
        return () => ipcRenderer.removeListener(IPC.CID.STATUS, handler);
      },
    },
    settings: {
      get: (): Promise<Settings> => ipcRenderer.invoke(IPC.SETTINGS.GET),
      patch: (partialSettings: Partial<Settings>) =>
        ipcRenderer.invoke(IPC.SETTINGS.PATCH, partialSettings),
    },
    nav: {
      onState: (
        callback: (state: {
          canGoBack: boolean;
          canGoForward: boolean;
          url: string;
        }) => void
      ) => {
        const handler = (_e: IpcRendererEvent, state: any) => callback(state);
        ipcRenderer.on(IPC.NAV.STATE, handler);
        return () => ipcRenderer.removeListener(IPC.NAV.STATE, handler);
      },
    },
    __meta__: {
      electron: true,
      versions: process.versions,
    },
  } as const;

  return api;
}

// const api = {
//   cid: {
//     open: (args?: { path: string }) => ipcRenderer.invoke(IPC.CID.OPEN, args),
//     close: () => ipcRenderer.invoke(IPC.CID.CLOSE),
//     getStatus: () => ipcRenderer.invoke(IPC.CID.STATUS),
//     switchCid: (args: {
//       cidType: string;
//       callstarPort?: string;
//       captureDevice?: string;
//     }) => ipcRenderer.invoke(IPC.CID.SWITCH_CID, args),
//     listPorts: () => ipcRenderer.invoke(IPC.CID.LIST_PORTS),
//     listSwitches: () => ipcRenderer.invoke(IPC.CID.LIST_SWITCHES),
//     onEvent: (callback: (evt: CidEvent) => void) => {
//       const handler = (_e: IpcRendererEvent, evt: CidEvent) => callback(evt);
//       ipcRenderer.on(IPC.CID.EVENT, handler);
//       return () => ipcRenderer.removeListener(IPC.CID.EVENT, handler);
//     },
//     onStatus: (callback: (status: CidStatus) => void) => {
//       const handler = (_e: IpcRendererEvent, status: CidStatus) =>
//         callback(status);
//       ipcRenderer.on(IPC.CID.STATUS, handler);
//       return () => ipcRenderer.removeListener(IPC.CID.STATUS, handler);
//     },
//     // TEST (추후 삭제 요망)
//     incoming: (payload: string) =>
//       ipcRenderer.invoke(IPC.CID.INCOMING, { payload }),
//   },
//   settings: {
//     get: (): Promise<Settings> => ipcRenderer.invoke(IPC.SETTINGS.GET),
//     patch: (partialSettings: Partial<Settings>) =>
//       ipcRenderer.invoke(IPC.SETTINGS.PATCH, partialSettings),
//   },
//   nav: {
//     onState: (
//       callback: (state: {
//         canGoBack: boolean;
//         canGoForward: boolean;
//         url: string;
//       }) => void
//     ) => {
//       const handler = (_e: IpcRendererEvent, state: any) => callback(state);
//       ipcRenderer.on(IPC.NAV.STATE, handler);
//       return () => ipcRenderer.removeListener(IPC.NAV.STATE, handler);
//     },
//   },
//   __meta__: {
//     electron: true,
//     versions: process.versions,
//   },
// };

try {
  // @ts-ignore
  if (!(window as any).__BYNATIVE__) {
    const api = buildApi();
    contextBridge.exposeInMainWorld('__BYNATIVE__', api);
    console.log('[Preload] exposed __BYNATIVE__ ok', process.versions.electron);
  } else {
    console.log('[Preload] __BYNATIVE__ already exposed, skipping');
  }
} catch (e: any) {
  console.error('[Preload] expose failed: ', e?.message || e);
}
