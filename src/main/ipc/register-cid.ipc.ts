import { BrowserWindow, IpcMain, ipcMain } from 'electron';
import { logger } from '../logs';
import type { CidAdapter } from '../interfaces/cid.interface';
import { IPC } from '../constants/ipc.constant';
import { settingsStore } from '../state/settings-store';
import { initializeCidService } from '../app';

type CidPayload =
  | { type: 'callstar'; path: string }
  | { type: 'switch'; captureDevice: string };

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
      onCid = null;
      onStatus = null;
    }

    boundAdapter = adapter;

    if (!adapter) {
      logger.debug('[CID][IPC] 어댑터 없음(분리됨)');
      return;
    }

    onCid = (payload: any) => sendToFrontend(IPC.CID.EVENT, payload);
    onStatus = (s: any) => sendToFrontend(IPC.CID.STATUS, s);
    adapter.on('cid', onCid);
    adapter.on('status', onStatus);
    logger.info('[CID][IPC] 어댑터 리스너 부착 완료');
  };

  attachAdapter(getAdapter());

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
      if (typeof (adapter as any).open !== 'function') {
        return { data: null, error: '어댑터에 open()이 없습니다.' };
      }
      await (adapter as any).open(param);
      attachAdapter(adapter);
      const status = (adapter as any).getStatus?.() ?? null;
      return { data: status, error: null };
    } catch (e: any) {
      logger.error('[CID][IPC] OPEN 실패: ', e);
      return { data: null, error: e?.message ?? String(e) };
    }
  });

  /**
   * CID CLOSE
   * --
   */
  ipcm.handle(IPC.CID.CLOSE, async (): Promise<any> => {
    const adapter = getAdapter();
    if (!adapter) return { data: null, error: 'CID 어댑터가 준비되지 않았습니다.' };
    try {
      await (adapter as any).close?.();
      attachAdapter(null);
      const status = (adapter as any).getStatus?.() ?? null;
      return { data: status, error: null };
    } catch (e: any) {
      logger.error('[CID][IPC] CLOSE 실패: ', e);
      return { data: null, error: e.message ?? String(e) };
    }
  });

  /**
   * CID STATUS
   * --
   */
  ipcm.handle(IPC.CID.STATUS, async (): Promise<any> => {
    const adapter = getAdapter();
    if (!adapter) return { data: null, error: 'CID 어댑터가 준비되지 않았습니다.' };
    try {
      const status = (adapter as any).getStatus?.() ?? null;
      return { data: status, error: null };
    } catch (e: any) {
      logger.error('[CID][IPC] STATUS 실패: ', e);
      return { data: null, error: e?.message ?? String(e) };
    }
  });

  /**
   * SWITCH CID
   * --
   */
  ipcm.handle(IPC.CID.SWITCH_CID, async (_e, payload: CidPayload) => {
    try {
      if (!payload || !payload.type) return { data: null, error: '전환 payload가 비어 있습니다.' };

      if (payload.type === 'callstar') {
        if (!payload.path || typeof payload.path !== 'string') {
          return { data: null, error: 'callstar 전환에는 유효한 포트 경로(path)가 필요합니다.' };
        }
        await settingsStore.patch({
          cid: { deviceType: 'callstar', callstarPort: payload.path, switchCaptureDevice: undefined },
        });
      } else if (payload.type === 'switch') {
        if (!payload.captureDevice || typeof payload.captureDevice !== 'string') {
          return { data: null, error: 'switch 전환에는 유효한 캡처 장치 식별자(captureDevice)가 필요합니다.' };
        }
        await settingsStore.patch({
          cid: { deviceType: 'switch', switchCaptureDevice: payload.captureDevice, callstarPort: undefined },
        });
      } else {
        return { data: null, error: `알 수 없는 타입: ${(payload as any).type}` };
      }

      await initializeCidService();

      const next = getAdapter();
      attachAdapter(next);

      const status = next?.getStatus?.() ?? null;
      return { data: status, error: null };
    } catch (e: any) {
      logger.error('[CID][IPC] SWITCH_CID 실패: ', e);
      return { data: null, error: e.message ?? String(e) };
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
