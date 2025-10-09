import { EventEmitter } from 'events';
import { Cap, decoders } from 'cap';
import { logger } from '../logs';
import { one, pickCallerNumber, safeParseHeaders } from '../utils/sip';
import { settingsStore } from '../state/settings-store';
import type { CidAdapter, CidStatus } from '../interfaces/cid.interface';
import type { CidEvent } from '../types/cid';
import type { IpPhone } from '../types/settings';

const { PROTOCOL } = decoders;

export class SwitchCidAdapter extends EventEmitter implements CidAdapter {
  private cap: InstanceType<typeof Cap> | null = null;
  private status: CidStatus = {
    isOpen: false,
    deviceName: undefined,
    deviceType: undefined,
  };
  private handler?: (buffer: Buffer, linkType: string) => void;
  private ipPhones: IpPhone[] = [];

  constructor(private readonly captureDevice: string) {
    super();
    if (!captureDevice) {
      throw new Error('[Switch][Adapter] 캡처 장비가 지정되지 않았습니다.');
    }
  }

  // TEST
  async incoming() {
    return 'test';
  }

  async open(): Promise<void> {
    logger.info(`[Switch][Adapter] 캡처 장비 여는 중...`);
    await this.close();

    if (this.status.isOpen) return;

    this.ipPhones = settingsStore.get().ipPhones ?? [];
    if (this.ipPhones.length === 0) {
      logger.warn('[Switch][Adapter] 감시할 IP 주소가 설정되지 않았습니다.');
      return;
    }

    const filter = this.ipPhones.map((p) => `host ${p.ipAddress}`).join(' or ');

    const device = this.findDevice(this.captureDevice);
    if (!device) {
      throw new Error(
        `[Switch][Adapter] 캡처 장비를 찾을 수 없음: ${this.captureDevice}`
      );
    }

    this.cap = new Cap();
    const bufSize = 10 * 1024 * 1024; // 10MB
    const buffer = Buffer.alloc(bufSize);

    try {
      const linkType = this.cap.open(device, filter, bufSize, buffer);
      this.cap.setMinBytes && this.cap.setMinBytes(0);

      this.handler = (buf: Buffer) => {
        try {
          // `linkType`을 사용하여 올바른 디코더를 선택할 수 있지만, 대부분 Ethernet이므로 직접 사용
          const decoded = decoders.Ethernet(buf);
          if (decoded.info.type !== PROTOCOL.ETHERNET.IPV4) return;

          const ipPacket = decoded.info.payload;
          const sourceIp = ipPacket.saddr;

          const phone = this.ipPhones.find((p) => p.ipAddress === sourceIp);
          if (!phone) return;

          const udpPayload = ipPacket.info.payload;
          const raw = udpPayload.data.toString('utf8');

          logger.debug(
            `[Switch][Adapter] 패킷 원본 수신 from ${sourceIp}:\n${raw}`
          );
          if (!raw.includes('SIP/2.0')) return;

          const text = raw.replace(/\r\n[ \t]+/g, ' ');
          const lower = text.toLowerCase();

          if (/^invite\s+sip:/im.test(lower)) {
            const headers = safeParseHeaders(text);
            const phoneNumber = pickCallerNumber(headers);
            const callId = one(headers['call-id']);
            this.emitCid({
              type: 'incoming',
              payload: phoneNumber,
              callId,
              extension: phone.extension,
            });
          } else if (/^sip\/2\.0\s+200/im.test(lower)) {
            const headers = safeParseHeaders(text);
            this.emitCid({
              type: 'off-hook',
              callId: one(headers['call-id']),
              extension: phone.extension,
            });
          } else if (/^(bye|cancel)\s+sip:/im.test(lower)) {
            const headers = safeParseHeaders(text);
            this.emitCid({
              type: 'on-hook',
              callId: one(headers['call-id']),
              extension: phone.extension,
            });
          }
        } catch (e: any) {
          logger.debug(`[SIP][packet][parse-fail] ${e.message}`);
        }
      };

      this.cap.on('packet', this.handler);
    } catch (e: any) {
      logger.error(
        `[Switch][Adapter] cap.open 실패 - Npcap 설치 및 캡처 권한 확인: ${e.message}`
      );
      throw e;
    }

    this._updateStatus({
      isOpen: true,
      deviceName: device,
      deviceType: 'switch',
    });
    logger.info(`[Switch][Adapter] ${device}에서 캡처 시작, 필터: ${filter}`);
  }

  async close(): Promise<void> {
    if (!this.cap) {
      this._updateStatus({
        isOpen: false,
        deviceName: undefined,
        deviceType: undefined,
      });
      return;
    }

    try {
      if (this.handler) {
        (this.cap as EventEmitter).removeListener('packet', this.handler);
      }
      this.cap.close();
    } catch (e: any) {
      logger.error(`[Switch][Adapter] 캡처 종료 에러: ${e.message}`);
    } finally {
      this.cap = null;
      this.handler = undefined;
      this._updateStatus({
        isOpen: false,
        deviceName: undefined,
        deviceType: undefined,
      });
      logger.info('[Switch][Adapter] 캡처 종료');
    }
  }

  getStatus(): CidStatus {
    return { ...this.status };
  }

  private _updateStatus(status: CidStatus) {
    this.status = { ...this.status, ...status };
  }

  private emitCid(evt: CidEvent) {
    this.emit('cid', evt);
  }

  private findDevice(ipOrDev: string): string {
    try {
      const device = Cap.findDevice(ipOrDev);
      if (device) {
        logger.info(`[Switch][Adapter] Cap.findDevice 장비 검색: ${device}`);
        return device;
      }
    } catch (e: any) {
      logger.warn(
        `[Switch][Adapter] Cap.findDevice(${ipOrDev}) 실패: ${e.message}.`
      );
    }

    try {
      const list = Cap.deviceList();
      logger.debug('[Switch][Adapter] Device List: ', list);
      const match = list.find((dev) =>
        (dev.addresses ?? []).some((a) => a.addr === ipOrDev)
      );
      if (match) {
        const deviceName = match.name ?? match.description;
        if (deviceName) {
          logger.info(
            `[Switch][Adapter] Cap.deviceList 장비 찾음: ${deviceName}`
          );
          return deviceName;
        }
      }
    } catch (e: any) {
      logger.warn(`[Switch][Adapter] Cap.deviceList() 찾기 실패: ${e.message}`);
    }

    logger.warn(
      `[Switch][Adapter] "${ipOrDev}"에 맞는 장비를 찾지 못했습니다. 식별자를 직접 사용합니다.`
    );
    return ipOrDev;
  }
}
