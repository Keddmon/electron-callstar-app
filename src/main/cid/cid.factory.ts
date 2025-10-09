import { settingsStore } from '../state/settings-store';
import { CidAdapter } from '../interfaces/cid.interface';
import { CallstarCidAdapter } from './callstar.adapter';
import { SwitchCidAdapter } from './switch.adapter';
import { logger } from '../logs';

export class CidAdapterFactory {
  static createAdapterFromSettings(): CidAdapter | null {
    const settings = settingsStore.get();
    const { deviceType, callstarPort, switchCaptureDevice } = settings.cid;

    logger.info(callstarPort);

    logger.info(`[Factory] 어댑터 생성 시도: ${deviceType}`);

    switch (deviceType) {
      case 'callstar':
        if (!callstarPort) {
          logger.warn(
            '[Factory] Callstar 어댑터를 선택했지만, 포트가 지정되지 않았습니다.'
          );
          return null;
        }
        return new CallstarCidAdapter();

      case 'switch':
        if (!switchCaptureDevice) {
          logger.warn(
            '[Factory] Switch 어댑터를 선택했지만, 캡처 장치가 지정되지 않았습니다.'
          );
          return null;
        }
        return new SwitchCidAdapter(switchCaptureDevice);

      default:
        logger.warn(`[Factory] 알 수 없는 장치 타입입니다: ${deviceType}`);
        return null;
    }
  }
}

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
