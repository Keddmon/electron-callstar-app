import { BrowserWindow, IpcMain, ipcMain } from 'electron';
import { logger } from '../logs';
import type { CidAdapter } from '../interfaces/cid.interface';
import { IPC } from '../constants/ipc.constant';

type StandardCidEvent = {
  type: 'incoming' | 'masked' | 'unknown';
  channel?: string;
  payload?: string;
  callId?: string;
}

export function registerCidIpc(
  getAdapter: () => CidAdapter | null,
  getWindow: () => BrowserWindow | null,
  ipcm: IpcMain = ipcMain
) {

  /**
   * Frontend로 이벤트 전송
   * --
   */
  const sendToFrontend = (channel: string, payload: any) => {
    const win = getWindow();
    if (!win) {
      logger.debug('[cid][ipc] no render window to send', channel, payload);
      return;
    }
    if (win.isDestroyed()) {
      logger.debug('[cid][ipc] renderer window destroyed - skip send', channel);
      return;
    }

    try {
      win.webContents.send(channel, payload);
    } catch (e) {
      logger.warn('[cid][ipc] failed to send to frontend', e);
    }
  };

  /**
   * Callstar - Switch 이벤트 통일
   * --
   */
  const normalizeCidEvent = (src: any): StandardCidEvent => {
    if (!src || typeof src !== 'object') {
      return { type: 'unknown' };
    }

    const type = (src.type ?? '').toString();

    if (type === 'incoming') {
      const phoneNumber = (src.payload ?? src.phoneNumber ?? '') as string;
      return {
        type: 'incoming',
        payload: phoneNumber || undefined,
        // channel: src.channel ?? '1',
        // callId: src.callId ?? undefined,
      };
    }

    // if (src.phoneNumber) {
    //   return {
    //     type: 'incoming',
    //     payload: String(src.phoneNumber),
    //     // channel: src.channel ?? '1'
    //   };
    // }

    return { type: 'unknown' };

    return {

    }
  };

  /**
   * CID Adapter 교체용 (Callstar - Switch)
   * --
   */
  let boundAdapter: CidAdapter | null = null;
  let onCid: ((p: any) => void) | null = null;
  let onStatus: ((s: any) => void) | null = null;

  /**
   * 이전 Adapter에서 리스너 제거 → 새 Adapter에 cid/status 리스너 연결
   * --
   */
  const attachAdapter = (adapter: CidAdapter | null) => {
    if (boundAdapter === adapter) return;

    // 이전 Adapter가 있으면 리스너 해제
    try {
      if (boundAdapter) {
        if (onCid) boundAdapter.removeListener('cid', onCid);
        if (onStatus) boundAdapter.removeListener('status', onStatus);
      }
    } catch (e) {
      logger.debug('[CID][IPC] error detaching old adapter', e);
    }

    // 없으면 새 Adapter에 onCid/onStatus 핸들러 연결
    boundAdapter = adapter;

    if (!adapter) {
      logger.debug('[CID][IPC] no adapter to attach');
      return;
    }

    onCid = (payload: any) => {
      // const normalized = normalizeCidEvent(payload);
      sendToFrontend(IPC.CID.EVENT, payload);
    };
    onStatus = (s: any) => {
      sendToFrontend(IPC.CID.STATUS, s);
    };

    try {
      adapter.on('cid', onCid);
      adapter.on('status', onStatus);
      logger.info('[CID][IPC] attached listeners to adapter');
    } catch (e) {
      logger.warn('[CID][IPC] failed to attach adapter listeners', e);
    }
  };

  // 외부에서 Adapter 인스턴스가 나중에 준비/교체되는 케이스를 주기적으로 감지
  const attachInterval = setInterval(() => {
    try {
      attachAdapter(getAdapter());
    } catch (e) {
      logger.debug('[CID][IPC] attach check failed', e);
    }
  }, 1000);



  /** ========== Frontend와 통신하는 함수(기능) ========== */
  /**
   * CID OPEN
   * --
   */
  ipcm.handle(IPC.CID.OPEN, async (_e, args?: any): Promise<any> => {
    const adapter = getAdapter();
    if (!adapter) return { data: null, error: 'CID adapter not ready' };
    try {
      const param = args?.path ?? args;
      if (typeof adapter.open === 'function') {
        await adapter.open(param);
        attachAdapter(adapter);
        return { data: adapter.getStatus?.() ?? null, error: null };
      }
      return { data: null, error: 'Adapter does not implement open()' };
    } catch (e: any) {
      logger.error('[CID][IPC] OPEN() Error: ', e);
      return { data: null, error: e?.message ?? String(e) };
    }
  });

  /**
   * CID CLOSE
   * --
   */
  ipcm.handle(IPC.CID.CLOSE, async (): Promise<any> => {
    const adapter = getAdapter();
    if (!adapter) return { data: null, error: 'CID adapter not ready' };
    try {
      if (typeof adapter.close === 'function') {
        await adapter.close();
        attachAdapter(null);
        return { data: adapter.getStatus?.() ?? null, error: null };
      }
      return { data: null, error: 'Adapter does not implement close()' };
    } catch (e: any) {
      logger.error('[CID][IPC] CLOSE() Error: ', e);
      return { data: null, error: e?.message ?? String(e) };
    }
  });

  /**
   * CID STATUS
   * --
   */
  ipcm.handle(IPC.CID.STATUS, async (): Promise<any> => {
    const adapter = getAdapter();
    if (!adapter) return { data: null, error: 'CID adapter not ready' };
    try {
      const status = typeof adapter.getStatus === 'function' ? adapter.getStatus() : null;
      return { data: status, error: null };
    } catch (e: any) {
      logger.error('[CID][IPC] STATUS() Error: ', e);
      return { data: null, error: e?.message ?? String(e) };
    }
  });

  /**
   * CID PORT LIST
   * --
   */
  ipcm.handle(IPC.CID.LIST_PORTS, async (): Promise<any> => {
    const adapter = getAdapter();
    if (!adapter) return { data: null, error: 'CID adapter not ready' };
    try {
      if (typeof adapter?.listPorts === 'function') {
        const ports = await adapter.listPorts();
        return { data: ports, error: null };
      }
      return { data: null, error: 'Adapter does not implement listPorts()' };
    } catch (e: any) {
      return { data: null, error: e?.message ?? String(e) };
    }
  });

  /** TEST */
  ipcm.handle(IPC.CID.INCOMING, async (_e, { payload }): Promise<any> => {
    const adapter = getAdapter();
    try {
      const result = await adapter?.incoming(payload);
      return { data: result, error: null };
    } catch (e: any) {
      return { data: null, error: e.message ?? String(e) };
    }
  });

  /**
   * CID Adapter Clear
   * --
   */
  const cleanup = () => {
    try {
      clearInterval(attachInterval);
      attachAdapter(null);
    } catch (e) {
      logger.debug('[CID][IPC] cleanup error', e);
    }
  };
  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  logger.info('[CID][IPC] registered CID IPC handlers');
}