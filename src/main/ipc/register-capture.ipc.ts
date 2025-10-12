/** PACKAGE */
import { ipcMain } from 'electron';
/** UTILS */
import { logger } from '../logs';
/** CONSTANTS & INTERFACES & TYPES */
import { IPC } from '../constants/ipc.constant';

/**
 * Cap 안전하게 Import
 * --
 */
let capRoot: any;
try {
  capRoot = require('cap');
} catch (e) {
  console.error('[IPC][Capture] cap 모듈 로드 실패: Electron 리빌드 필요');
}

/**
 * Switch CID: 캡처 장비 목록
 * --
 */
const registerCaptureIpc = () => {
  ipcMain.handle(IPC.CID.LIST_SWITCHES, async () => {
    if (typeof capRoot?.deviceList !== 'function') {
      logger.error(
        `[IPC][Capture] capRoot.deviceList() 존재하지 않음. (Npcap 설치 확인 요망)`
      );
      return [];
    }

    try {
      const devices = await capRoot?.deviceList();

      if (!devices.length) {
        return [];
      }
      return devices;
    } catch (e: any) {
      logger.error(
        `[IPC][Capture] 캡처 장비 조회 실패: ${e.message}`
      );
      return [];
    }
  });
};

export default registerCaptureIpc;
