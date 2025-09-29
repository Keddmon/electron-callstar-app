import { CidAdapter } from '../interfaces/cid.interface';
import { CallstarCidAdapter } from './callstar.adapter';
import { SwitchCidAdapter } from './switch.adapter';

export type CidDeviceType = 'callstar' | 'switch';

export interface CidFactoryOptions {
  type: CidDeviceType;
  callstarPath?: string;
  sipCaptureIp?: string;
  sipFilter?: string;
}

export class CidAdapterFactory {
  static create(options: CidFactoryOptions): CidAdapter {
    switch (options.type) {
      case 'callstar':
        return new CallstarCidAdapter();
      case 'switch':
        if (!options.sipCaptureIp) {
          throw new Error(`[Factory] switch 장비는 sipCaptureIp가 필요합니다.`);
        }
        return new SwitchCidAdapter(options.sipCaptureIp, options.sipFilter);
    }
  }
}