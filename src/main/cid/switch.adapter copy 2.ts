// import { EventEmitter } from 'events';
// import { Cap } from 'cap';
// import { logger } from '../logs';
// import {
//   one,
//   pickCallerNumber,
//   safeParseHeaders,
//   formatKR,
// } from '../utils/sip';
// import type { CidAdapter, CidStatus } from '../interfaces/cid.interface';
// import type { CidEvent } from '../types/cid';

// export class SwitchCidAdapter extends EventEmitter implements CidAdapter {
//   private cap: InstanceType<typeof Cap> | null = null;
//   private status: CidStatus = {
//     isOpen: false,
//     deviceName: undefined,
//     deviceType: undefined,
//   };
//   private handler?: (nbytes: number, trunc?: boolean) => void;

//   constructor(
//     private readonly captureDevice: string,
//     private readonly filter = 'udp portrange 5060-5085 or tcp portrange 5060-5085'
//   ) {
//     super();
//     if (!captureDevice) {
//       throw new Error('[Switch][Adapter] 캡처 장비가 지정되지 않았습니다.');
//     }
//   }
//   // TEST
//   async incoming() {
//     console.log('TEST INCOMING');
//   }

//   async open(): Promise<void> {
//     logger.info(`[Switch][Adapter] 캡처 장비 여는 중...`);
//     await this.close();

//     if (this.status.isOpen) return;

//     const device = this.findDevice(this.captureDevice);
//     if (!device) {
//       throw new Error(
//         `[Switch][Adapter] 캡처 장비를 찾을 수 없음: ${this.captureDevice}`
//       );
//     }

//     this.cap = new Cap();
//     const bufSize = 10 * 1024 * 1024; // 10MB
//     const buffer = Buffer.alloc(bufSize);

//     try {
//       this.cap.open(device, this.filter, bufSize, buffer);
//       this.cap.setMinBytes && this.cap.setMinBytes(0);

//       this.handler = (nbytes: number) => {
//         try {
//           const raw = buffer.toString('utf8', 0, nbytes);
//           logger.debug(`[SIP] Raw Packet Received:\n${raw}`);

//           if (!raw.includes('SIP/2.0')) return;

//           const text = raw.replace(/\r\n[ \t]+/g, ' ');
//           const lower = text.toLowerCase();

//           if (/^invite\s+sip:/im.test(lower)) {
//             const headers = safeParseHeaders(text);
//             const phoneNumber = pickCallerNumber(headers);
//             const callId = one(headers['call-id']);
//             this.emitCid({ type: 'incoming', payload: phoneNumber, callId });
//           } else if (/^sip\/2\.0\s+200/im.test(lower)) {
//             const headers = safeParseHeaders(text);
//             this.emitCid({ type: 'off-hook', callId: one(headers['call-id']) });
//           } else if (/^(bye|cancel)\s+sip:/im.test(lower)) {
//             const headers = safeParseHeaders(text);
//             this.emitCid({ type: 'on-hook', callId: one(headers['call-id']) });
//           }
//         } catch (e: any) {
//           logger.debug(`[SIP][packet][parse-fail] ${e.message}`);
//         }
//       };

//       this.cap.on('packet', this.handler);
//     } catch (e: any) {
//       logger.error(
//         `[Switch][Adapter] cap.open 실패 - Npcap 설치 및 캡처 권한 확인: ${e.message}`
//       );
//       throw e;
//     }

//     this._updateStatus({
//       isOpen: true,
//       deviceName: device,
//       deviceType: 'switch',
//     });
//     logger.info(
//       `[Switch][Adapter] ${device}에서 캡처 시작, 필터: ${this.filter}`
//     );
//   }

//   async close(): Promise<void> {
//     if (!this.cap) {
//       this._updateStatus({
//         isOpen: false,
//         deviceName: undefined,
//         deviceType: undefined,
//       });
//       return;
//     }

//     try {
//       if (this.handler) {
//         (this.cap as EventEmitter).removeListener('packet', this.handler);
//       }
//       this.cap.close();
//     } catch (e: any) {
//       logger.error(`[Switch][Adapter] 캡처 종료 에러: ${e.message}`);
//     } finally {
//       this.cap = null;
//       this.handler = undefined;
//       this._updateStatus({
//         isOpen: false,
//         deviceName: undefined,
//         deviceType: undefined,
//       });
//       logger.info('[Switch][Adapter] 캡처 종료');
//     }
//   }

//   getStatus(): CidStatus {
//     return { ...this.status };
//   }

//   private _updateStatus(status: Partial<CidStatus>) {
//     this.status = { ...this.status, ...status };
//     this.emit('status', this.getStatus());
//   }

//   private emitCid(evt: CidEvent) {
//     if (evt.type === 'incoming') {
//       const formattedPayload = formatKR(evt.payload);
//       this.emit('cid', { ...evt, payload: formattedPayload });
//     } else {
//       this.emit('cid', evt);
//     }
//   }

//   private findDevice(ipOrDev: string): string {
//     try {
//       const device = Cap.findDevice(ipOrDev);
//       if (device) {
//         logger.info(`[Switch][Adapter] Cap.findDevice 장비 검색: ${device}`);
//         return device;
//       }
//     } catch (e: any) {
//       logger.warn(
//         `[Switch][Adapter] Cap.findDevice(${ipOrDev}) 실패: ${e.message}.`
//       );
//     }

//     try {
//       const list = Cap.deviceList();
//       const match = list.find((dev) =>
//         (dev.addresses ?? []).some((a) => a.addr === ipOrDev)
//       );
//       if (match) {
//         const deviceName = match.name ?? match.description;
//         if (deviceName) {
//           logger.info(
//             `[Switch][Adapter] Cap.deviceList 장비 찾음: ${deviceName}`
//           );
//           return deviceName;
//         }
//       }
//     } catch (e: any) {
//       logger.warn(`[Switch][Adapter] Cap.deviceList() 찾기 실패: ${e.message}`);
//     }

//     logger.warn(
//       `[Switch][Adapter] "${ipOrDev}"에 맞는 장비를 찾지 못했습니다. 식별자를 직접 사용합니다.`
//     );
//     return ipOrDev;
//   }
// }
