import type { CidAdapter } from '../interfaces/cid.interface';
import { CallstarCidAdapter } from './callstar.adapter';
import { SwitchCidAdapter } from './switch.adapter';
import { logger } from '../logs';

type CidConfig = {
  deviceType?: 'callstar' | 'switch';
  callstarPort?: string | undefined;
  switchCaptureDevice?: string | undefined;
};

type CreatePayload =
  | { type: 'callstar'; path: string }
  | { type: 'switch'; captureDevice: string };

export class CidAdapterFactory {
  static fromSettings(cid: CidConfig): CidAdapter | null {
    const deviceType = cid?.deviceType;
    logger.info(`[Factory] 어댑터 생성 시도: ${deviceType}`);

    switch (deviceType) {
      case 'callstar': {
        const p = cid.callstarPort;
        if (typeof p !== 'string' || p.trim() === '') {
          logger.warn('[Factory] callstar 선택, 포트(callstarPort) 미지정');
          return null;
        }
        return new CallstarCidAdapter();
      }

      case 'switch': {
        const dev = cid.switchCaptureDevice;
        if (typeof dev !== 'string' || dev.trim() == '') {
          logger.warn('[Factory] switch 선택, 캡처 장치(switchCaptureDevice) 미지정');
          return null;
        }
        return new SwitchCidAdapter(dev);
      }

      default:
        logger.warn(`[Factory] 알 수 없는/미지정 장치 타입: ${String(deviceType)}`);
        return null;
    }
  }

  static fromPayload(payload: CreatePayload): CidAdapter {
    if (payload.type === 'callstar') {
      if (typeof payload.path !== 'string' || payload.path.trim() === '') {
        throw new Error('[Factory] callstar 전환에는 유효한 path가 필요합니다.');
      }
      return new CallstarCidAdapter();
    }

    if (typeof payload.captureDevice !== 'string' || payload.captureDevice.trim() === '') {
      throw new Error('[Factory] switch 전환에는 유효한 captureDevice가 필요합니다.');
    }
    return new SwitchCidAdapter(payload.captureDevice);
  }
}

// export class CidAdapterFactory {
//   static createAdapterFromSettings(): CidAdapter | null {
//     const settings = settingsStore.get();
//     const { deviceType, callstarPort, switchCaptureDevice } = settings.cid;

//     logger.info(callstarPort);

//     logger.info(`[Factory] 어댑터 생성 시도: ${deviceType}`);

//     switch (deviceType) {
//       case 'callstar':
//         if (!callstarPort) {
//           logger.warn(
//             '[Factory] Callstar 어댑터를 선택했지만, 포트가 지정되지 않았습니다.'
//           );
//           return null;
//         }
//         return new CallstarCidAdapter();

//       case 'switch':
//         if (!switchCaptureDevice) {
//           logger.warn(
//             '[Factory] Switch 어댑터를 선택했지만, 캡처 장치가 지정되지 않았습니다.'
//           );
//           return null;
//         }
//         return new SwitchCidAdapter(switchCaptureDevice);

//       default:
//         logger.warn(`[Factory] 알 수 없는 장치 타입입니다: ${deviceType}`);
//         return null;
//     }
//   }
// }

// import { CidAdapter } from '../interfaces/cid.interface';
// import { CallstarCidAdapter } from './callstar.adapter';
// import { SwitchCidAdapter } from './switch.adapter';

// export type CidDeviceType = 'callstar' | 'switch';

// export interface CidFactoryOptions {
//   type: CidDeviceType;
//   callstarPath?: string;
//   sipCaptureIp?: string;
//   sipFilter?: string;
// }

// export class CidAdapterFactory {
//   static create(options: CidFactoryOptions): CidAdapter {
//     switch (options.type) {
//       case 'callstar':
//         if (!options.callstarPath) {
//           throw new Error(
//             `[Factory] callstar 장비는 callstarPath가 필요합니다.`
//           );
//         }
//         return new CallstarCidAdapter();
//       case 'switch':
//         if (!options.sipCaptureIp) {
//           throw new Error(`[Factory] switch 장비는 sipCaptureIp가 필요합니다.`);
//         }
//         return new SwitchCidAdapter(options.sipCaptureIp);
//     }
//   }
// }
