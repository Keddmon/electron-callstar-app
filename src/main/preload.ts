import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

const IPC = {
  CID: {
    OPEN: 'cid:open',
    CLOSE: 'cid:close',
    STATUS: 'cid:status',
    LIST_PORTS: 'cid:listPorts',
    EVENT: 'cid:event',
    INCOMING: 'cid:incoming',
  },
  CAPTURE: {
    LIST_DEVICES: 'capture:listDevices',
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
  NAV: {
    STATE: 'nav:state',
  },
};

type CidEvent =
  | {
      type: 'incoming';
      payload: string | null;
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
  path?: string;
  deviceType?: 'callstar' | 'switch' | undefined;
}

interface IpPhone {
  ipAddress: string;
  extension: string;
  description?: string;
  macAddress?: string;
}
interface Settings {
  /**
   * CID 장치 관련 설정
   */
  cid: {
    deviceType: 'callstar' | 'switch';
    autoReconnect?: boolean;
    // Callstar 장치 설정
    callstarPort?: string;
    // Switch 장치 설정
    switchCaptureDevice?: string;
  };

  /**
   * Switch CID 모드에서 사용할 IP 전화기 목록
   */
  ipPhones: IpPhone[];

  /**
   * 애플리케이션 관련 설정
   */
  app: {
    startOnLogin?: boolean;
  };

  /**
   * 윈도우 상태 저장
   */
  window?: {
    width?: number;
    height?: number;
    x?: number;
    y?: number;
  };
}

// 필요한 함수들만 명시적으로 노출하는 API 객체
const api = {
  /**
   * CID 어댑터 제어 및 이벤트 수신
   */
  cid: {
    open: (args?: { path: string }) => ipcRenderer.invoke(IPC.CID.OPEN, args),
    close: () => ipcRenderer.invoke(IPC.CID.CLOSE),
    getStatus: () => ipcRenderer.invoke(IPC.CID.STATUS),
    listPorts: () => ipcRenderer.invoke(IPC.CID.LIST_PORTS),
    // TEST (추후 삭제 요망)
    incoming: (payload: string) =>
      ipcRenderer.invoke(IPC.CID.INCOMING, { payload }),

    // Main -> Renderer 이벤트 수신
    onEvent: (callback: (evt: CidEvent) => void) => {
      const handler = (_e: IpcRendererEvent, evt: CidEvent) => callback(evt);
      ipcRenderer.on(IPC.CID.EVENT, handler);
      // 클린업 함수 반환 (React useEffect 등에서 사용)
      return () => ipcRenderer.removeListener(IPC.CID.EVENT, handler);
    },
    onStatus: (callback: (status: CidStatus) => void) => {
      const handler = (_e: IpcRendererEvent, status: CidStatus) =>
        callback(status);
      ipcRenderer.on(IPC.CID.STATUS, handler);
      return () => ipcRenderer.removeListener(IPC.CID.STATUS, handler);
    },
  },

  /**
   * 네트워크 장치 캡처 관련
   */
  capture: {
    listDevices: () => ipcRenderer.invoke(IPC.CAPTURE.LIST_DEVICES),
  },

  /**
   * 설정(Settings) 관리
   */
  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke(IPC.SETTINGS.GET),
    patch: (partialSettings: Partial<Settings>) =>
      ipcRenderer.invoke(IPC.SETTINGS.PATCH, partialSettings),
  },

  /**
   * 내비게이션 제어
   */
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
};

// `contextBridge`를 통해 `window.api` 객체로 안전하게 노출
try {
  contextBridge.exposeInMainWorld('api', api);
} catch (error) {
  console.error('Failed to expose API via contextBridge:', error);
}
