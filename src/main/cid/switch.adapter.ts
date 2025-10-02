// import { EventEmitter } from 'events';
// // 기존: import { Cap } from 'cap';
// /* 변경: 안전한 런타임 바인딩 */
// import * as capModule from 'cap';
// const Cap: typeof import('cap').Cap = (capModule as any)?.Cap ?? (capModule as any);
// import os from 'os';
// import { logger } from '../logs';
// import type { CidAdapter, CidStatus } from '../interfaces/cid.interface';
// import type { CidEvent } from '../types/cid';
// import {
//   formatKR,
//   one,
//   pickCallerNumber,
//   safeParseHeaders
// } from '../utils/sip';

// // const HEALTHY_INVITE_TIMEOUT_MS = 12_000;

// export class SwitchCidAdapter extends EventEmitter implements CidAdapter {
//   private cap: InstanceType<typeof Cap> | null = null;
//   private status: CidStatus = {
//     isOpen: false,
//     device: undefined,
//   };
//   private handler?: (nbytes: number) => void;
//   // private buffer?: Buffer;
//   // private lastInviteAt: number | null = null;
//   // private healthTimer?: NodeJS.Timeout;

//   constructor(private readonly captureIpOrDevice?: string, private readonly filter = 'udp port 5060 or tcp port 5060') {
//     super();
//   }

//   /**
//    * 장비 열기
//    * --
//    */
//   async open() {
//     logger.info(`[Switch][Adapter] 장비 여는 중...`);
//     await this.close();

//     if (this.status.isOpen) return;

//     const device = this.findDevice(this.captureIpOrDevice);
//     if (!device) throw new Error('[SIP][cap] Capture device not found. (check sip.captureIp))');

//     this.cap = new Cap();
//     const bufSize = 10 * 1024 * 1024;
//     const buffer = Buffer.allocUnsafe(bufSize);

//     try {
//       this.cap.open(device, this.filter, bufSize, buffer);
//       this.cap.setMinBytes && this.cap.setMinBytes(0);
//     } catch (e) {
//       logger.error('[SIP] cap.open failed - check NPcap installed and capture permission: ', e);
//       throw e;
//     }

//     this._updateStatus({ isOpen: true, device: device });
//     logger.info(`[SIP] capture started on ${device} with filter "${this.filter}"`);

//     this.handler = (nbytes: number) => {
//       try {
//         const raw = buffer.toString('utf8', 0, nbytes);
//         if (!raw.includes('SIP/2.0')) return;
//         const text = raw.replace(/\r\n[ \t]+/g, ' ');
//         const lower = text.toLowerCase();

//         if (/^invite\s+sip:/mi.test(lower)) {
//           const headers = safeParseHeaders(text);
//           const phoneNumber = pickCallerNumber(headers);
//           const callId = one(headers['call-id']);
//           this.emitCid({ type: 'incoming', payload: phoneNumber, callId });
//         } else if (/^sip\/2\.0\s+200/mi.test(lower)) {
//           const headers = safeParseHeaders(text);
//           this.emitCid({ type: 'off-hook', callId: one(headers['call-id']) });
//         } else if (/^(bye|cancel)\s+sip:/mi.test(lower)) {
//           const headers = safeParseHeaders(text);
//           this.emitCid({ type: 'on-hook', callId: one(headers['call-id']) });
//         }
//       } catch (e) {
//         logger.debug('[SIP][packet][parse-fail]', e);
//       }
//     };

//     this.cap.on('packet', this.handler);
//   }

//   async close() {
//     if (!this.cap) {
//       this._updateStatus({ isOpen: false, device: undefined });
//       return;
//     }

//     try {
//       if (this.cap && this.handler) {
//         // @ts-ignore
//         this.cap.removeListener('packet', this.handler);
//       }
//       this.cap.close();
//     } catch (e) {
//       logger.error('[SIP] capture close error: ', e);
//     } finally {
//       this.cap = null;
//       this._updateStatus({ isOpen: false, device: undefined });
//       logger.info(`[SIP] capture closed`);
//     }
//   }

//   getStatus(): CidStatus {
//     return { ...this.status };
//   }

//   private _updateStatus(status: CidStatus) {
//     this.status = { ...this.status, ...status };
//     this.emit('status', this.getStatus());
//   }

//   private emitCid(evt: CidEvent) {
//     if (evt.type === 'incoming') {
//       const phoneNumber = formatKR(evt.payload as string | null);
//       // channel은 기존 Callstar가 1회선이라 가정. 프런트 필요시 extend.
//       this.emit('cid', { type: 'incoming', payload: phoneNumber });
//     } else if (evt.type === 'off-hook') {
//       this.emit('cid', { type: 'off-hook' });
//     } else if (evt.type === 'on-hook') {
//       this.emit('cid', { type: 'on-hook' });
//     }
//   }

//   private findDevice(ipOrDev?: string) {
//     // 1) try using Cap.findDevice if available
//     try {
//       const capAny = Cap as any;
//       if (ipOrDev && typeof capAny.findDevice === 'function') {
//         const d = capAny.findDevice(ipOrDev);
//         if (d) return d;
//       }

//       // 2) if cap exposes deviceList(), try to match by ip
//       if (typeof capAny.deviceList === 'function') {
//         const list = capAny.deviceList() as Array<any>;
//         if (ipOrDev) {
//           const match = list.find((dev: any) =>
//             (dev.addresses ?? []).some((a: any) => a.addr === ipOrDev || a.addr === ipOrDev.split(':').pop())
//           );
//           if (match) return match.name ?? match.description ?? null;
//         }
//         // no ipOrDev match -> if list non-empty use first device name
//         if (list.length > 0) return list[0].name ?? null;
//       }
//     } catch (e) {
//       logger.warn('[SIP] findDevice via cap API failed: ', e);
//     }

//     // 3) fallback: use OS networkInterfaces to pick the first non-internal IPv4
//     try {
//       const ifs = os.networkInterfaces();
//       const cand = Object.values(ifs).flat().find((i: any) => i && !i.internal && i.family === 'IPv4');
//       if (cand?.address) {
//         const capAny = Cap as any;
//         if (typeof capAny.findDevice === 'function') {
//           const d = capAny.findDevice(cand.address);
//           if (d) return d;
//         }
//         if (typeof capAny.deviceList === 'function') {
//           const list = capAny.deviceList() as Array<any>;
//           const match = list.find((dev: any) =>
//             (dev.addresses ?? []).some((a: any) => a.addr === cand.address)
//           );
//           if (match) return match.name ?? match.description ?? null;
//         }
//         // last resort: return the IP itself (some code uses this with Cap.open)
//         return cand.address;
//       }
//     } catch (e) {
//       logger.warn('[SIP] fallback findDevice failed: ', e);
//     }

//     return null;
//   }
// }