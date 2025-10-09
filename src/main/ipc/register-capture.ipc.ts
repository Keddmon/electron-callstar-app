import { ipcMain } from 'electron';
import * as capModule from 'cap';
import { logger } from '../logs';
import { IPC } from '../constants/ipc.constant';
import type { CapDevice as RawCapDevice } from 'cap';

const Cap: typeof import('cap').Cap =
  (capModule as any)?.Cap ?? (capModule as any);

interface CaptureDevice {
  id: string;
  name: string;
  description: string;
}

export function registerCaptureIpc() {
  ipcMain.handle(
    IPC.CAPTURE.LIST_DEVICES,
    async (): Promise<CaptureDevice[]> => {
      if (typeof (Cap as any)?.deviceList !== 'function') {
        logger.error(
          `[Capture][IPC][${IPC.CAPTURE.LIST_DEVICES}] Cap.deviceList() 존재하지 않음. (Npcap 설치 확인 요망)`
        );
        return [];
      }

      try {
        const rawDevices: RawCapDevice[] = Cap.deviceList();

        if (!rawDevices || rawDevices.length === 0) {
          logger.warn(
            `[Capture][IPC][${IPC.CAPTURE.LIST_DEVICES}] 반환값 없음.`
          );
          return [];
        }

        const devices = rawDevices
          .map((dev): CaptureDevice | null => {
            const id = dev.name;
            if (!id) {
              return null;
            }

            const ipv4Address = dev.addresses.find(
              (a) => a.family === 'IPv4' || a.family.toLowerCase() === 'ipv4'
            )?.addr;

            const displayName = dev.description || id;
            const displayDescription = ipv4Address
              ? `IP: ${ipv4Address}`
              : 'No IPv4 address';

            return {
              id: id,
              name: displayName,
              description: displayDescription,
            };
          })
          .filter((dev): dev is CaptureDevice => dev !== null);

        return devices;
      } catch (e: any) {
        logger.error(
          `[Capture][IPC][${IPC.CAPTURE.LIST_DEVICES}] 캡처 장비 조회 실패: ${e.message}`
        );
        return [];
      }
    }
  );
}
