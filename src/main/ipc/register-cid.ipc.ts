import { BrowserWindow, IpcMain, ipcMain } from 'electron';
import { logger } from '../logs';
import type { CidAdapter } from '../interfaces/cid.interface';
import type { CidPortInfo } from '../types/cid';
import { IPC } from '../constants/ipc.constant';

type StandardCidEvent = {
  type: 'incoming' | 'masked' | unknown;
  channel?: string;
  payload?: string;
  callId?: string;
}

export function registerCidIpc(
  getAdapter: () => CidAdapter | null,
  getWindow: () => BrowserWindow | null,
  ipcm: IpcMain = ipcMain
) {
  const sendToFrontend = (channel: string, payload: any) => {
    const win = getWindow();
    if (!win) {
      logger.debug('[cid][ipc] no render window to send', channel, payload);
      return;
    }
    if (win.isDestroyed()) {
      logger.debug('[cid][ipc] renderer window destroyed - skip send', channel);
    }
    try {
      win.webContents.send(channel, payload);
    } catch (e) {
      logger.warn('[cid][ipc] failed to send to renderer', e);
    }
  };

  const normalizeCidEvent = (src: any): StandardCidEvent => {
    if (!src || typeof src !== 'object') {
      return { type: 'unknown' };
    }

    const t = (src.type ?? '').toString();

    if (t === 'incoming') {
      const phoneNumber = (src.payload ?? src.phoneNumber ?? '') as string;
      return {
        type: 'incoming',
        payload: phoneNumber || undefined,
        channel: src.channel ?? '1',
        callId: src.callId ?? undefined,
      };
    }

    if (src.phoneNumber) {
      return {
        type: 'incoming',
        payload: String(src.phoneNumber), channel: src.channel ?? '1'
      };
    }

    return { type: 'unknown' };
  };

  let boundAdapter: CidAdapter | null = null;
  let onCid: ((p: any) => void) | null = null;
  let onStatus: ((s: any) => void) | null = null;

  const attachAdapter = (adapter: CidAdapter | null) => {
    if (boundAdapter === adapter) return;

    // detach previous
    try {
      if (boundAdapter) {
        if (onCid) boundAdapter.removeListener('cid', onCid);
        if (onStatus) boundAdapter.removeListener('status', onStatus);
      }
    } catch (e) {
      logger.debug('[cid.ipc] error detaching old adapter', e);
    }

    boundAdapter = adapter;

    if (!adapter) {
      logger.debug('[cid.ipc] no adapter to attach');
      return;
    }

    onCid = (payload: any) => {
      const normalized = normalizeCidEvent(payload);
      sendToFrontend(IPC.CID.EVENT, normalized);
    };
    onStatus = (s: any) => {
      sendToFrontend(IPC.CID.STATUS, s);
    };

    try {
      adapter.on('cid', onCid);
      adapter.on('status', onStatus);
      logger.info('[cid.ipc] attached listeners to adapter');
    } catch (e) {
      logger.warn('[cid.ipc] failed to attach adapter listeners', e);
    }
  };

  const attachInterval = setInterval(() => {
    try {
      attachAdapter(getAdapter());
    } catch (e) {
      logger.debug('[cid.ipc] attach check failed', e);
    }
  }, 1000);

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
      logger.error('[cid][ipc] OPEN Error: ', e);
      return { data: null, error: e?.message ?? String(e) };
    }
  });

  ipcm.handle(IPC.CID.CLOSE, async (): Promise<any> => {
    const adapter = getAdapter();
    if (!adapter) return { data: null, error: 'CID adapter not ready' };
    try {
      if (typeof adapter.close === 'function') {
        await adapter.close();
        // detach after close
        attachAdapter(null);
        return { data: adapter.getStatus?.() ?? null, error: null };
      }
      return { data: null, error: 'Adapter does not implement close()' };
    } catch (err: any) {
      logger.error('[cid.ipc] CLOSE error', err);
      return { data: null, error: err?.message ?? String(err) };
    }
  });

  ipcm.handle(IPC.CID.STATUS, async (): Promise<any> => {
    const adapter = getAdapter();
    if (!adapter) return { data: null, error: 'CID adapter not ready' };
    try {
      const status = typeof adapter.getStatus === 'function' ? adapter.getStatus() : null;
      return { data: status, error: null };
    } catch (err: any) {
      logger.error('[cid.ipc] STATUS error', err);
      return { data: null, error: err?.message ?? String(err) };
    }
  });

  ipcm.handle(IPC.CID.LIST_PORTS, async (): Promise<CidPortInfo[]> => {
    const adapter = getAdapter();
    try {
      if (typeof adapter?.listPorts === 'function') {
        const ports = await adapter.listPorts();
        return ports ?? [];
      }
    } catch (e: any | unknown) {
      logger.error(`[IPC Error] ${IPC.CID.LIST_PORTS}: `, e);
      throw new Error(`[cid][listPorts] Error ${e.message}`)
    }
    return [];
  });

  const cleanup = () => {
    try {
      clearInterval(attachInterval);
      attachAdapter(null);
    } catch (e) {
      logger.debug('[cid.ipc] cleanup error', e);
    }
  };
  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  logger.info('[cid.ipc] registered CID IPC handlers');
}