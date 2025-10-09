import { BrowserWindow, IpcMain, ipcMain } from 'electron';
import { logger } from '../logs';
import type { CidAdapter } from '../interfaces/cid.interface';
import { IPC } from '../constants/ipc.constant';
import { CallstarCidAdapter } from '../cid/callstar.adapter';

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
    if (!win || win.isDestroyed()) return;

    try {
      win.webContents.send(channel, payload);
    } catch (e) {
      logger.warn('[CID][IPC] 프론트엔드 전송 실패', e);
    }
  };

  let boundAdapter: CidAdapter | null = null;
  let onCid: ((p: any) => void) | null = null;
  let onStatus: ((s: any) => void) | null = null;

  const attachAdapter = (adapter: CidAdapter | null) => {
    if (boundAdapter === adapter) return;

    if (boundAdapter) {
      if (onCid) boundAdapter.removeListener('cid', onCid);
      if (onStatus) boundAdapter.removeListener('status', onStatus);
    }

    boundAdapter = adapter;

    if (!adapter) {
      logger.debug('[CID][IPC] 어댑터 붙은게 없음');
      return;
    }

    if (adapter) {
      onCid = (payload: any) => sendToFrontend(IPC.CID.EVENT, payload);
      onStatus = (s: any) => sendToFrontend(IPC.CID.STATUS, s);
      adapter.on('cid', onCid);
      adapter.on('status', onStatus);
      logger.info('[CID][IPC] attached listeners to adapter');
    }
  };

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
    if (!adapter)
      return { data: null, error: 'CID 어댑터가 준비되지 않았습니다.' };
    try {
      const param = args?.path ?? args;
      if (typeof adapter.open === 'function') {
        await adapter.open(param);
        attachAdapter(adapter);
        return { data: adapter.getStatus?.() ?? null, error: null };
      }
      return { data: null, error: '어댑터에 open()가 없습니다.' };
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
      await adapter.close();
      attachAdapter(null);
      return { data: adapter.getStatus?.() ?? null, error: null };
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
      const status = adapter.getStatus ? adapter.getStatus() : null;
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
    try {
      const ports = await CallstarCidAdapter.listPorts();
      return { data: ports, error: null };
    } catch (e: any) {
      logger.error('[CID][IPC] LIST_PORTS() Error: ', e);
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
