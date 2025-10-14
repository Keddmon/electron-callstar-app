/** PACKAGE */
import { ipcMain } from 'electron';
/** UTILS */
import { logger } from '../logs';
/** CONSTANTS & INTERFACES & TYPES */
import { IPC } from '../constants/ipc.constant';

type CapModule = {
  deviceList?: () => any[];
  Cap?: { deviceList?: () => any[] };
};

/**
 * Switch CID: Cap 모듈 안전하게 로드하기
 * --
 */
const loadCapSafe = (): CapModule | null => {
  try {
    const mod = require('cap') as CapModule;
    return mod ?? null;
  } catch (e: any) {
    logger.error('[IPC][Capture] cap 모듈 로드 실패: ', e?.message || e);
    return null;
  }

}

/**
 * Switch CID: 캡처 장비 목록
 * --
 */
const getDeviceList = (mod: CapModule | null): (() => any[]) | null => {
  if (!mod) return null;
  if (typeof mod.deviceList === 'function') return mod.deviceList;
  if (typeof mod.Cap?.deviceList === 'function') return mod.Cap.deviceList;
  return null;
}

/**
 * Switch CID: IPC 등록
 * --
 */
const registerCaptureIpc = () => {
  ipcMain.handle(IPC.CID.LIST_SWITCHES, async () => {
    const capMod = loadCapSafe();
    const deviceList = getDeviceList(capMod);

    if (!deviceList) {
      logger.error(`[IPC][Capture] deviceList API가 없습니다. (Npcap/패킹/asarUnpack 확인)`);
      return [];
    }

    try {
      const devices = deviceList();
      return Array.isArray(devices) ? devices : [];
    } catch (e: any) {
      logger.error(`[IPC][Capture] 장비 조회 실패: `, e?.message ?? e);
      return []
    }
  });
};

export default registerCaptureIpc;
