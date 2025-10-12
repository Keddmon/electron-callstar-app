import { ipcMain } from 'electron';
// import * as capModule from 'cap';
import { logger } from '../logs';
import { IPC } from '../constants/ipc.constant';
// import type { CapDevice as RawCapDevice } from 'cap';

// const Cap: typeof import('cap').Cap =
//   (capModule as any)?.Cap ?? (capModule as any);


// let CapCtor: any;
let capRoot: any;
try {
  capRoot = require('cap');
  // CapCtor = capRoot.Cap ?? capRoot;
} catch (e) {
  console.error('[IPC][Capture] cap native module load failed, Rebuild for Electron');
}

// const decoders = capRoot.decoders || capRoot?.default?.decoders;
// const PROTOCOL = decoders?.PROTOCOL;

export function registerCaptureIpc() {
  ipcMain.handle(IPC.CID.LIST_SWITCHES, async () => {
    if (typeof capRoot?.deviceList !== 'function') {
      logger.error(`[Capture][IPC][${IPC.CID.LIST_SWITCHES}] capRoot.deviceList() 존재하지 않음. (Npcap 설치 확인 요망)`);
      return [];
    }

    try {
      const devices = await capRoot?.deviceList();

      if (!devices.length) {
        return [];
      }
      return devices;

      // if (!rawDevices || rawDevices.length === 0) {
      //   logger.warn(
      //     `[Capture][IPC][${IPC.CID.LIST_SWITCHES}] 반환값 없음.`
      //   );
      //   return [];
      // }

      // const devices = rawDevices
      //   .map((dev): CaptureDevice | null => {
      //     const id = dev.name;
      //     if (!id) {
      //       return null;
      //     }

      //     const ipv4Address = dev.addresses.find(
      //       (a) => a.family === 'IPv4' || a.family.toLowerCase() === 'ipv4'
      //     )?.addr;

      //     const displayName = dev.description || id;
      //     const displayDescription = ipv4Address
      //       ? `IP: ${ipv4Address}`
      //       : 'No IPv4 address';

      //     return {
      //       id: id,
      //       name: displayName,
      //       description: displayDescription,
      //     };
      //   })
      //   .filter((dev): dev is CaptureDevice => dev !== null);

    } catch (e: any) {
      logger.error(`[Capture][IPC][${IPC.CID.LIST_SWITCHES}] 캡처 장비 조회 실패: ${e.message}`);
      return [];
    }
  }
  );
}
