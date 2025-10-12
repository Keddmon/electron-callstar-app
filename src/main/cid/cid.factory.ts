/** UTILS */
import { logger } from '../logs';
/** ADAPTERS */
import { CallstarCidAdapter } from './callstar.adapter';
import { SwitchCidAdapter } from './switch.adapter';
/** CONSTANTS & INTERFACES & TYPES */
import type { CidAdapter } from '../interfaces/cid.interface';

type CidConfig = {
  cidType?: 'callstar' | 'switch';
  callstarPort?: string | undefined;
  captureDevice?: string | undefined;
};

type CreatePayload =
  | { type: 'callstar'; path: string }
  | { type: 'switch'; captureDevice: string };

export class CidAdapterFactory {
  /**
   * Settings Store(로컬 스토리지: JSON) 기반으로 Adapter 연결
   * --
   */
  static fromSettings(cid: CidConfig): CidAdapter | null {
    const cidType = cid?.cidType;
    logger.info(`[CID][Factory] 어댑터 생성 시도: ${cidType}`);

    switch (cidType) {
      case 'callstar': {
        const p = cid.callstarPort;
        if (typeof p !== 'string' || p.trim() === '') {
          logger.warn(
            '[CID][Factory] callstar 선택, 포트(callstarPort) 미지정'
          );
          return null;
        }
        return new CallstarCidAdapter();
      }

      case 'switch': {
        const dev = cid.captureDevice;
        if (typeof dev !== 'string' || dev.trim() == '') {
          logger.warn(
            '[CID][Factory] switch 선택, 캡처 장치(captureDevice) 미지정'
          );
          return null;
        }
        return new SwitchCidAdapter(dev);
      }

      default:
        logger.warn(
          `[Factory] 알 수 없는/미지정 장치 타입: ${String(cidType)}`
        );
        return null;
    }
  }

  /**
   * 수신값을 기반으로 Adapter 연결
   * --
   */
  static fromPayload(payload: CreatePayload): CidAdapter {
    if (payload.type === 'callstar') {
      if (typeof payload.path !== 'string' || payload.path.trim() === '') {
        throw new Error(
          '[Factory] callstar 전환에는 유효한 path가 필요합니다.'
        );
      }
      return new CallstarCidAdapter();
    }

    if (
      typeof payload.captureDevice !== 'string' ||
      payload.captureDevice.trim() === ''
    ) {
      throw new Error(
        '[Factory] switch 전환에는 유효한 captureDevice가 필요합니다.'
      );
    }
    return new SwitchCidAdapter(payload.captureDevice);
  }
}
