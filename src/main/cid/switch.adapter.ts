// import { EventEmitter } from 'events';
// import { logger } from '../logs';
// import { one, safeParseHeaders } from '../utils/sip';
// import { settingsStore } from '../state/settings-store';
// import type { CidAdapter, CidStatus } from '../interfaces/cid.interface';
// import type { CidEvent } from '../types/cid';
// import type { IpPhone } from '../types/settings';

// type CallState = {
//   seen200?: boolean;
//   pendingInvite?: boolean;           // ★ INVITE 선행 체크 플래그 추가
//   extension?: string | null;
//   last: number;
// };

// type SipHeaders = Record<string, string | string[]>;

// type PacketHandlerA = (nbytes: number, trunc: boolean) => void;   // cap >= 0.3
// type PacketHandlerB = (buffer: Buffer, linkType: string) => void;  // cap 구버전

// // 런타임 로드 대상
// let CapMod: any | null = null;
// let Decoders: any | null = null;

// /** header 값을 항상 string(첫 요소)로 정규화 */
// function h(headers: SipHeaders, name: string): string | undefined {
//   const v = headers[name.toLowerCase()];
//   if (Array.isArray(v)) return v[0];
//   return v;
// }

// export class SwitchCidAdapter extends EventEmitter implements CidAdapter {
//   private cap: any | null = null; // Cap 인스턴스 (런타임 로드이므로 any)
//   private status: CidStatus = {
//     isOpen: false,
//     deviceName: undefined,
//     deviceType: undefined,
//   };
//   private handler?: PacketHandlerA | PacketHandlerB;
//   private ipPhones: IpPhone[] = [];

//   private endpointMap = new Map<string, { extension: string; last: number }>();
//   private calls = new Map<string, CallState>();

//   constructor(private readonly captureDevice: string) {
//     super();
//     if (!captureDevice) {
//       throw new Error('[Switch][Adapter] 캡처 장비가 지정되지 않았습니다.');
//     }
//   }

//   // TEST
//   async incoming() {
//     return 'test';
//   }

//   async open(): Promise<void> {
//     logger.info(`[Switch][Adapter] 캡처 장비 여는 중...`);
//     await this.close();
//     if (this.status.isOpen) return;

//     // cap 런타임 로드
//     if (!CapMod || !Decoders) {
//       try {
//         const capRoot = require('cap');
//         CapMod = capRoot.Cap ?? capRoot; // v0.2 / v0.3 호환
//         Decoders = capRoot.decoders ?? capRoot?.default?.decoders;
//         if (!Decoders) throw new Error('cap.decoders not found');
//       } catch (e: any) {
//         logger.error(`[Switch][Adapter] cap 모듈 로드 실패: ${e?.message || e}`);
//         throw new Error(
//           '네트워크 캡처 모듈(cap)을 불러오지 못했습니다. Npcap/electron-rebuild 확인 요망.'
//         );
//       }
//     }

//     this.ipPhones = settingsStore.get().ipPhones ?? [];
//     const discoveryMode = this.ipPhones.length === 0;

//     const filter = discoveryMode
//       ? 'udp port 5060 or tcp port 5060 or port 5061'
//       : this.ipPhones.map((p) => `host ${p.ipAddress}`).join(' or ');

//     const device = this.findDevice(this.captureDevice);
//     if (!device) {
//       throw new Error(
//         `[Switch][Adapter] 캡처 장비를 찾을 수 없음: ${this.captureDevice}`
//       );
//     }

//     this.cap = new CapMod();
//     const bufSize = 10 * 1024 * 1024; // 10MB
//     const buffer = Buffer.alloc(bufSize);

//     try {
//       // @ts-ignore
//       (this.cap as any).open(device, filter, bufSize, buffer);
//       if ((this.cap as any).setMinBytes) (this.cap as any).setMinBytes(0);

//       this.handler = ((arg1: any, _arg2: any) => {
//         try {
//           // cap>=0.3 (nbytes), 또는 구버전(Buffer) 모두 지원
//           let frame: Buffer | null = null;
//           if (typeof arg1 === 'number') {
//             const nbytes = arg1 as number;
//             if (nbytes <= 0) return;
//             frame = buffer.slice(0, nbytes);
//           } else if (Buffer.isBuffer(arg1)) {
//             frame = arg1 as Buffer;
//           } else {
//             return; // 알 수 없는 형태
//           }

//           const eth = Decoders!.Ethernet(frame);
//           const PROTOCOL = Decoders!.PROTOCOL;
//           if (!eth?.info) return;
//           if (eth.info.type !== PROTOCOL.ETHERNET.IPV4) return;

//           const ipv4 = Decoders!.IPV4(frame, eth.offset);
//           if (!ipv4?.info) return;

//           let l4: any = null;
//           if (ipv4.info.protocol === PROTOCOL.IP.UDP) {
//             l4 = Decoders!.UDP(frame, ipv4.offset);
//           } else if (ipv4.info.protocol === PROTOCOL.IP.TCP) {
//             l4 = Decoders!.TCP(frame, ipv4.offset);
//           } else {
//             return; // 그 외 프로토콜은 스킵
//           }

//           const ipStart = eth.offset;
//           const ipEnd = ipStart + (ipv4.info.totallen || 0);
//           const dataStart = l4.offset;

//           // UDP/TCP 페이로드 추출 (cap 버전에 따라 l4.data가 없을 수 있어 수동 슬라이스)
//           let data: Buffer | undefined;
//           if (ipv4.info.protocol === PROTOCOL.IP.UDP && l4.info?.length) {
//             const udpPayloadLen = Math.max(0, l4.info.length - 8);
//             const dataEnd = Math.min(frame.length, dataStart + udpPayloadLen);
//             data = frame.slice(dataStart, dataEnd);
//           } else {
//             const dataEnd = Math.min(frame.length, ipEnd);
//             if (dataEnd > dataStart) data = frame.slice(dataStart, dataEnd);
//           }
//           if (!data || data.length === 0) return;

//           const raw = data.toString('utf8');
//           if (!raw.includes('SIP/2.0')) return;

//           console.log('raw: ', raw);

//           const text = raw.replace(/\r\n[ \t]+/g, ' ');
//           const lower = text.toLowerCase();

//           // 요청/응답/메소드 판별
//           const isRequest = /^[A-Z]+\s+sip:/i.test(text);
//           const isResponse = /^sip\/2\.0\s+\d{3}/i.test(text);
//           let method: string | null = null;
//           if (isRequest) {
//             const m = /^([A-Z]+)\s+sip:/i.exec(text);
//             method = m ? m[1].toUpperCase() : null;
//           } else if (isResponse) {
//             const m = /(^|\r?\n)\s*cseq\s*:\s*\d+\s+([A-Z]+)/i.exec(text);
//             method = m ? m[2].toUpperCase() : null;
//           }

//           const headers = safeParseHeaders(text) as SipHeaders;
//           const sourceIp = ipv4.info.saddr;

//           // 비통화 메소드(REGISTER 포함)는 학습만 하고 종료
//           const NON_CALLING = new Set([
//             'REGISTER','OPTIONS','SUBSCRIBE','NOTIFY','MESSAGE','UPDATE','INFO','REFER','PRACK','PUBLISH'
//           ]);
//           if (!method || NON_CALLING.has(method)) {
//             this.learnEndpointIfPossible(sourceIp, text, headers);
//             return;
//           }

//           // Call-ID 확보
//           const callId =
//             one(h(headers, 'call-id') ?? h(headers, 'i')) ||
//             this.makeCallIdFallback(text, sourceIp);

//           // 관심 소스 확인 (학습은 위에서 이미 수행)
//           if (!this.isInterestingSource(discoveryMode, sourceIp)) return;

//           // ── 콜 시그널 처리 ─────────────────────────────────────────

//           // INVITE 요청: incoming 이벤트 + pendingInvite 세팅
//           if (isRequest && method === 'INVITE') {
//             const caller = this.pickCallerNumber(headers, text);
//             const ext = this.pickExtension(sourceIp, headers, text);
//             this.updateCall(callId, { extension: ext, pendingInvite: true });
//             this.emitCid({
//               type: 'incoming',
//               payload: caller,
//               callId,
//               extension: ext ?? undefined,
//             });
//             return;
//           }

//           // INVITE 응답: 200 OK 일 때만, 그리고 pendingInvite=true 인 경우에만 off-hook
//           if (isResponse && method === 'INVITE') {
//             if (/^sip\/2\.0\s+200/i.test(lower)) {
//               const st = this.calls.get(callId);
//               if (st?.pendingInvite) {
//                 const ext = this.pickExtension(sourceIp, headers, text);
//                 this.updateCall(callId, { seen200: true, pendingInvite: false, extension: ext });
//                 this.emitCid({ type: 'off-hook', callId, extension: ext ?? undefined });
//               }
//             }
//             // 180/183 등은 필요하면 별도 처리 가능. 현재는 무시.
//             return;
//           }

//           // BYE / CANCEL : on-hook
//           if (method === 'BYE' || method === 'CANCEL') {
//             const ext = this.pickExtension(sourceIp, headers, text);
//             this.emitCid({ type: 'on-hook', callId, extension: ext ?? undefined });
//             this.calls.delete(callId);
//             return;
//           }

//           // ACK: 200 전 ACK만 온 경우 방어 처리 (일부 장비)
//           if (method === 'ACK') {
//             const st = this.calls.get(callId);
//             if (!st || !st.seen200) {
//               const ext = this.pickExtension(sourceIp, headers, text);
//               this.updateCall(callId, { extension: ext, seen200: true, pendingInvite: false });
//               this.emitCid({ type: 'off-hook', callId, extension: ext ?? undefined });
//             }
//             return;
//           }

//           // 나머지는 스킵
//         } catch (e: any) {
//           logger.debug(`[SIP][packet][parse-fail] ${e.message}`);
//         }
//       }) as PacketHandlerA | PacketHandlerB;

//       (this.cap as any).on('packet', this.handler as any);
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
//     logger.info(`[Switch][Adapter] ${device}에서 캡처 시작, 필터: ${filter}`);
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
//         (this.cap as any).removeListener('packet', this.handler as any);
//       }
//       (this.cap as any).close();
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
//       this.endpointMap.clear();
//       this.calls.clear();
//       logger.info('[Switch][Adapter] 캡처 종료');
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
//     this.emit('cid', evt);
//   }

//   // ─────────────────────────────
//   // Helpers
//   // ─────────────────────────────

//   /** 관심 소스(IP) 여부 판단: 디스커버리면 전체 허용, 목록 모드면 등록된 전화기만 */
//   private isInterestingSource(discoveryMode: boolean, sourceIp: string): boolean {
//     if (discoveryMode) return true;
//     return this.ipPhones.some((p) => p.ipAddress === sourceIp);
//   }

//   /** endpointMap 학습: REGISTER/200 등에서 extension 추출 → sourceIp 매핑 */
//   private learnEndpointIfPossible(
//     sourceIp: string,
//     text: string,
//     headers: SipHeaders
//   ) {
//     const ext =
//       this.tryPickUserFromRequestUri(text) ||
//       this.tryPickUserFromHeaderUri(h(headers, 'to')) ||
//       this.tryPickUserFromHeaderUri(h(headers, 'contact')) ||
//       this.tryPickUserFromHeaderUri(h(headers, 'from'));

//     if (ext) {
//       this.endpointMap.set(sourceIp, { extension: ext, last: Date.now() });
//     }
//   }

//   private makeCallIdFallback(text: string, ip: string): string {
//     let h = 0;
//     const s = `${ip}|${text.slice(0, 256)}`; // 과도한 비용 방지
//     for (let i = 0; i < s.length; i++) {
//       h = (h << 5) - h + s.charCodeAt(i);
//       h |= 0;
//     }
//     return `fallback-${ip}-${Math.abs(h)}`;
//   }

//   private updateCall(callId: string, patch: Partial<CallState>) {
//     const prev = (this.calls.get(callId) || { last: 0 }) as CallState;
//     const next = { ...prev, ...patch, last: Date.now() };
//     this.calls.set(callId, next);
//   }

//   /** 발신 번호 추출: PAI → RPID → From (대표번호/착신번호 제외) */
//   private pickCallerNumber(headers: SipHeaders, fullText: string): string | undefined {
//     const toUser = this.tryPickUserFromHeaderUri(h(headers, 'to') || '');
//     const contactUser = this.tryPickUserFromHeaderUri(h(headers, 'contact') || '');
//     const exclude = new Set([toUser, contactUser].filter(Boolean) as string[]);

//     const paiUser = this.tryPickUserFromHeaderUri(h(headers, 'p-asserted-identity'));
//     if (paiUser && !exclude.has(paiUser)) return this.normalizeDigits(paiUser);

//     const rpidUser = this.tryPickUserFromHeaderUri(h(headers, 'remote-party-id'));
//     if (rpidUser && !exclude.has(rpidUser)) return this.normalizeDigits(rpidUser);

//     const ppiUser = this.tryPickUserFromHeaderUri(h(headers, 'p-preferred-identity'));
//     if (ppiUser && !exclude.has(ppiUser)) return this.normalizeDigits(ppiUser);

//     const fromHdr = h(headers, 'from') || '';
//     const fromDisplay = this.tryPickPlainDigits(fromHdr);
//     if (fromDisplay && !exclude.has(fromDisplay)) {
//       const nd = this.normalizeDigits(fromDisplay);
//       if (nd.replace(/\D/g, '').length >= 7) return nd;
//     }

//     const fromUser = this.tryPickUserFromHeaderUri(fromHdr);
//     if (fromUser && !exclude.has(fromUser)) return this.normalizeDigits(fromUser);

//     const reqUser = this.tryPickUserFromRequestUri(fullText);
//     if (reqUser && !exclude.has(reqUser)) return this.normalizeDigits(reqUser);

//     return undefined;
//   }

//   /** 내선 추출: endpointMap(sourceIp) → To/Request-URI user 순 */
//   private pickExtension(
//     sourceIp: string,
//     headers: SipHeaders,
//     fullText: string
//   ): string | null {
//     const cached = this.endpointMap.get(sourceIp)?.extension;
//     if (cached) return cached;

//     const toUser =
//       this.tryPickUserFromRequestUri(fullText) ||
//       this.tryPickUserFromHeaderUri(h(headers, 'to'));
//     return toUser || null;
//   }

//   /** 헤더에서 sip:<user>@ 형태의 user 추출 */
//   private tryPickUserFromHeaderUri(h?: string): string | null {
//     if (!h) return null;
//     const m = h.match(/<\s*sip:([^>@;]+)@[^>]+>/i) || h.match(/\bsip:([^@>;]+)@/i);
//     return m?.[1] ?? null;
//   }

//   /** Request-Line/URI에서 user 추출: ACK/INVITE sip:user@host SIP/2.0 */
//   private tryPickUserFromRequestUri(text: string): string | null {
//     const m = text.match(/^(INVITE|ACK|BYE|CANCEL)\s+sip:([^@\s>]+)@/im);
//     if (m && m[2]) return m[2];
//     return null;
//   }

//   /** 따옴표(display name) 안 숫자만 추출 */
//   private tryPickPlainDigits(h: string): string | null {
//     const m = h.match(/"(\+?\d{6,})"/);
//     return m?.[1] ?? null;
//   }

//   /** 간단 정규화: 공백/대시 제거, 앞+ 유지 */
//   private normalizeDigits(n: string): string {
//     return n.replace(/[\s-]/g, '');
//   }

//   private findDevice(ipOrDev: string): string {
//     if (!CapMod) return ipOrDev; // (open에서 보장되지만 혹시 몰라 가드)

//     try {
//       const device = CapMod.findDevice(ipOrDev);
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
//       const list = CapMod.deviceList();
//       logger.debug('[Switch][Adapter] Device List: ', list);
//       const match = list.find((dev: any) =>
//         (dev.addresses ?? []).some((a: any) => a.addr === ipOrDev)
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

import { EventEmitter } from 'events';
import { logger } from '../logs';
import { one, safeParseHeaders } from '../utils/sip';
import { settingsStore } from '../state/settings-store';
import type { CidAdapter, CidStatus } from '../interfaces/cid.interface';
import type { CidEvent } from '../types/cid';
import type { IpPhone } from '../types/settings';

type CallState = {
  seen200?: boolean;
  pendingInvite?: boolean;
  extension?: string | null;
  last: number;
};

type SipHeaders = Record<string, string | string[]>;

type PacketHandlerA = (nbytes: number, trunc: boolean) => void;   // cap >= 0.3
type PacketHandlerB = (buffer: Buffer, linkType: string) => void;  // cap 구버전

let CapMod: any | null = null;
let Decoders: any | null = null;

/** header 값을 항상 string(첫 요소)로 정규화 */
function h(headers: SipHeaders, name: string): string | undefined {
  const v = headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0];
  return v;
}

/** cap 버전에 따라 다른 키명을 커버해 소스 IP를 안전하게 얻는다 */
function getSrcIp(ipv4: any): string | undefined {
  const info = ipv4?.info ?? {};
  return (
    info.saddr ??
    info.srcaddr ??
    info.src ??
    info.source ??
    info.sourceip ??
    undefined
  );
}

/** raw 텍스트에서 지정한 헤더(복수 alias 가능)의 값을 폴백 정규식으로 추출 */
function getHeaderVal(rawUnfolded: string, names: string[]): string | undefined {
  for (const n of names) {
    // 행 접힘은 이미 unfold 됨. compact 헤더(f/t/i) 포함.
    const re = new RegExp(`(?:^|\\n)\\s*${n}\\s*:\\s*([^\\r\\n]+)`, 'i');
    const m = rawUnfolded.match(re);
    if (m && m[1]) return m[1].trim();
  }
  return undefined;
}

/** Call-ID를 안전하게 얻는다 (헤더 파싱 실패시 정규식 폴백 + compact 'i') */
function getCallId(headers: SipHeaders, rawUnfolded: string, srcIp: string | undefined): string {
  const fromHeaders = one(h(headers, 'call-id') ?? h(headers, 'i'));
  if (fromHeaders && fromHeaders.trim()) return fromHeaders.trim();

  const fromRegex = getHeaderVal(rawUnfolded, ['Call-ID', 'i']);
  if (fromRegex && fromRegex.length > 0) return fromRegex;

  return `fallback-${srcIp ?? 'unknown'}-${Math.abs(hash32((rawUnfolded || '').slice(0, 256)))}`;
}
function hash32(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return h | 0;
}

class SwitchCidAdapter extends EventEmitter implements CidAdapter {
  private cap: any | null = null;
  private status: CidStatus = {
    isOpen: false,
    deviceName: undefined,
    deviceType: undefined,
  };
  private handler?: PacketHandlerA | PacketHandlerB;
  private ipPhones: IpPhone[] = [];

  private endpointMap = new Map<string, { extension: string; last: number }>();
  private calls = new Map<string, CallState>();

  constructor(private readonly captureDevice: string) {
    super();
    if (!captureDevice) {
      throw new Error('[Switch][Adapter] 캡처 장비가 지정되지 않았습니다.');
    }
  }

  async incoming() { return 'test'; }

  async open(): Promise<void> {
    logger.info(`[Switch][Adapter] 캡처 장비 여는 중...`);
    await this.close();
    if (this.status.isOpen) return;

    if (!CapMod || !Decoders) {
      try {
        const capRoot = require('cap');
        CapMod = capRoot.Cap ?? capRoot;
        Decoders = capRoot.decoders ?? capRoot?.default?.decoders;
        if (!Decoders) throw new Error('cap.decoders not found');
      } catch (e: any) {
        logger.error(`[Switch][Adapter] cap 모듈 로드 실패: ${e?.message || e}`);
        throw new Error('네트워크 캡처 모듈(cap)을 불러오지 못했습니다. Npcap/electron-rebuild 확인 요망.');
      }
    }

    this.ipPhones = settingsStore.get().ipPhones ?? [];
    const discoveryMode = this.ipPhones.length === 0;

    const filter = discoveryMode
      ? 'udp port 5060 or tcp port 5060 or port 5061'
      : this.ipPhones.map((p) => `host ${p.ipAddress}`).join(' or ');

    const device = this.findDevice(this.captureDevice);
    if (!device) {
      throw new Error(`[Switch][Adapter] 캡처 장비를 찾을 수 없음: ${this.captureDevice}`);
    }

    this.cap = new CapMod();
    const bufSize = 10 * 1024 * 1024;
    const buffer = Buffer.alloc(bufSize);

    try {
      (this.cap as any).open(device, filter, bufSize, buffer);
      if ((this.cap as any).setMinBytes) (this.cap as any).setMinBytes(0);

      this.handler = ((arg1: any, _arg2: any) => {
        try {
          let frame: Buffer | null = null;
          if (typeof arg1 === 'number') {
            const nbytes = arg1 as number;
            if (nbytes <= 0) return;
            frame = buffer.slice(0, nbytes);
          } else if (Buffer.isBuffer(arg1)) {
            frame = arg1 as Buffer;
          } else {
            return;
          }

          const eth = Decoders!.Ethernet(frame);
          const PROTOCOL = Decoders!.PROTOCOL;
          if (!eth?.info) return;
          if (eth.info.type !== PROTOCOL.ETHERNET.IPV4) return;

          const ipv4 = Decoders!.IPV4(frame, eth.offset);
          if (!ipv4?.info) return;

          let l4: any = null;
          if (ipv4.info.protocol === PROTOCOL.IP.UDP) {
            l4 = Decoders!.UDP(frame, ipv4.offset);
          } else if (ipv4.info.protocol === PROTOCOL.IP.TCP) {
            l4 = Decoders!.TCP(frame, ipv4.offset);
          } else {
            return;
          }

          const ipStart = eth.offset;
          const ipEnd = ipStart + (ipv4.info.totallen || 0);
          const dataStart = l4.offset;

          let data: Buffer | undefined;
          if (ipv4.info.protocol === PROTOCOL.IP.UDP && l4.info?.length) {
            const udpPayloadLen = Math.max(0, l4.info.length - 8);
            const dataEnd = Math.min(frame.length, dataStart + udpPayloadLen);
            data = frame.slice(dataStart, dataEnd);
          } else {
            const dataEnd = Math.min(frame.length, ipEnd);
            if (dataEnd > dataStart) data = frame.slice(dataStart, dataEnd);
          }
          if (!data || data.length === 0) return;

          const raw = data.toString('utf8');
          if (!raw.includes('SIP/2.0')) return;

          // 헤더 unfold (folded line 대비)
          const text = raw.replace(/\r\n[ \t]+/g, ' ');
          const lower = text.toLowerCase();

          const isRequest = /^[A-Z]+\s+sip:/i.test(text);
          const isResponse = /^sip\/2\.0\s+\d{3}/i.test(text);
          let method: string | null = null;
          if (isRequest) {
            const m = /^([A-Z]+)\s+sip:/i.exec(text);
            method = m ? m[1].toUpperCase() : null;
          } else if (isResponse) {
            const m = /(^|\r?\n)\s*cseq\s*:\s*\d+\s+([A-Z]+)/i.exec(text);
            method = m ? m[2].toUpperCase() : null;
          }

          const headers = safeParseHeaders(text) as SipHeaders;

          // 안전한 소스 IP/Call-ID 확보 (compact i: 포함)
          const sourceIp = getSrcIp(ipv4);
          const callId = getCallId(headers, text, sourceIp);

          // 비통화 메소드(REGISTER 등)는 학습만
          const NON_CALLING = new Set([
            'REGISTER', 'OPTIONS', 'SUBSCRIBE', 'NOTIFY', 'MESSAGE', 'UPDATE', 'INFO', 'REFER', 'PRACK', 'PUBLISH'
          ]);
          if (!method || NON_CALLING.has(method)) {
            if (sourceIp) this.learnEndpointIfPossible(sourceIp, text, headers);
            return;
          }

          // 관심 소스 확인 (착신 내선도 함께 판단)
          if (!this.isInterestingSource(discoveryMode, sourceIp, headers, text)) return;

          // ── 콜 시그널 처리 ─────────────────────────────────────────
          if (isRequest && method === 'INVITE') {
            const caller = this.pickCallerNumber(headers, text);
            const ext = this.pickExtension(sourceIp ?? '', headers, text);
            this.updateCall(callId, { extension: ext, pendingInvite: true, seen200: false });

            const dbg = {
              srcIp: sourceIp ?? '',
              callId,
              toUser: this.tryPickUserFromHeaderUri(
                h(headers, 'to') || h(headers, 't') || getHeaderVal(text, ['To', 't']) || ''
              ) ?? '',
              reqUser: this.tryPickUserFromRequestUri(text) ?? '',
              contactUser: this.tryPickUserFromHeaderUri(
                h(headers, 'contact') || getHeaderVal(text, ['Contact']) || ''
              ) ?? '',
              pai: this.tryPickUserFromHeaderUri(
                h(headers, 'p-asserted-identity') || getHeaderVal(text, ['P-Asserted-Identity']) || ''
              ) ?? '',
              rpid: this.tryPickUserFromHeaderUri(
                h(headers, 'remote-party-id') || getHeaderVal(text, ['Remote-Party-ID']) || ''
              ) ?? '',
              ppi: this.tryPickUserFromHeaderUri(
                h(headers, 'p-preferred-identity') || getHeaderVal(text, ['P-Preferred-Identity']) || ''
              ) ?? '',
              fromDisplay: this.tryPickPlainDigits(
                h(headers, 'from') || h(headers, 'f') || getHeaderVal(text, ['From', 'f']) || ''
              ) ?? '',
              fromUser: this.tryPickUserFromHeaderUri(
                h(headers, 'from') || h(headers, 'f') || getHeaderVal(text, ['From', 'f']) || ''
              ) ?? '',
              pickedCaller: caller ?? '',
              pickedExt: ext ?? ''
            };
            logger.info(`[CID][INVITE][debug] ${JSON.stringify(dbg)}`);

            if (caller) {
              this.emitCid({ type: 'incoming', payload: caller, callId, extension: ext ?? undefined });
            } else {
              logger.debug(`[SIP][INVITE] caller not found, callId=${callId}`);
            }
            return;
          }

          // if (isResponse && method === 'INVITE') {
          //   if (/^sip\/2\.0\s+200/i.test(lower)) {
          //     const st = this.calls.get(callId);
          //     if (st?.pendingInvite) {
          //       const ext = this.pickExtension(sourceIp ?? '', headers, text);
          //       this.updateCall(callId, { seen200: true, pendingInvite: false, extension: ext });
          //       this.emitCid({ type: 'off-hook', callId, extension: ext ?? undefined });
          //     } else {
          //       logger.debug(`[SIP][200-INVITE][ignored] no pending invite, callId=${callId}`);
          //     }
          //   }
          //   return;
          // }

          // if (method === 'BYE' || method === 'CANCEL') {
          //   const st = this.calls.get(callId);
          //   if (st?.pendingInvite || st?.seen200) {
          //     const ext = this.pickExtension(sourceIp ?? '', headers, text);
          //     this.emitCid({ type: 'on-hook', callId, extension: ext ?? undefined });
          //     this.calls.delete(callId);
          //   } else {
          //     logger.debug(`[SIP][${method}][ignored] no call state, callId=${callId}`);
          //   }
          //   return;
          // }

          // if (method === 'ACK') {
          //   const st = this.calls.get(callId);
          //   if (st?.pendingInvite && !st?.seen200) {
          //     const ext = this.pickExtension(sourceIp ?? '', headers, text);
          //     this.updateCall(callId, { extension: ext, seen200: true, pendingInvite: false });
          //     this.emitCid({ type: 'off-hook', callId, extension: ext ?? undefined });
          //   } else {
          //     logger.debug(`[SIP][ACK][ignored] no pending invite, callId=${callId}`);
          //   }
          //   return;
          // }
        } catch (e: any) {
          logger.debug(`[SIP][packet][parse-fail] ${e.message}`);
        }
      }) as PacketHandlerA | PacketHandlerB;

      (this.cap as any).on('packet', this.handler as any);
    } catch (e: any) {
      logger.error(`[Switch][Adapter] cap.open 실패 - Npcap 설치 및 캡처 권한 확인: ${e.message}`);
      throw e;
    }

    this._updateStatus({ isOpen: true, deviceName: device, deviceType: 'switch' });
    logger.info(`[Switch][Adapter] ${device}에서 캡처 시작, 필터: ${filter}`);
  }

  async close(): Promise<void> {
    if (!this.cap) {
      this._updateStatus({ isOpen: false, deviceName: undefined, deviceType: undefined });
      return;
    }
    try {
      if (this.handler) (this.cap as any).removeListener('packet', this.handler as any);
      (this.cap as any).close();
    } catch (e: any) {
      logger.error(`[Switch][Adapter] 캡처 종료 에러: ${e.message}`);
    } finally {
      this.cap = null;
      this.handler = undefined;
      this._updateStatus({ isOpen: false, deviceName: undefined, deviceType: undefined });
      this.endpointMap.clear();
      this.calls.clear();
      logger.info('[Switch][Adapter] 캡처 종료');
    }
  }

  getStatus(): CidStatus {
    return { ...this.status };
  }

  private _updateStatus(status: CidStatus) {
    this.status = { ...this.status, ...status };
    this.emit('status', this.getStatus());
  }

  private emitCid(evt: CidEvent) {
    this.emit('cid', evt);
  }

  // ─────────────────────────────
  // Helpers
  // ─────────────────────────────

  /** 관심 소스(IP) 여부 판단: 디스커버리면 전체 허용,
   *  목록 모드면 등록된 전화기 IP이거나, 착신 내선이 우리가 관리하는 내선이면 허용 */
  private isInterestingSource(
    discoveryMode: boolean,
    sourceIp?: string,
    headers?: SipHeaders,
    fullText?: string
  ): boolean {
    if (discoveryMode) return true;
    if (sourceIp && this.ipPhones.some((p) => p.ipAddress === sourceIp)) return true;
    if (headers && fullText) {
      const toUser =
        this.tryPickUserFromHeaderUri(h(headers, 'to') || h(headers, 't') || getHeaderVal(fullText, ['To', 't']) || '') ?? '';
      const reqUser = this.tryPickUserFromRequestUri(fullText) ?? '';
      const ext = toUser || reqUser;
      if (ext && this.ipPhones.some((p) => p.extension === ext)) return true;
    }
    return false;
  }

  /** endpointMap 학습: REGISTER/200 등에서 extension 추출 → sourceIp 매핑 */
  private learnEndpointIfPossible(sourceIp: string, text: string, headers: SipHeaders) {
    const ext =
      this.tryPickUserFromRequestUri(text) ||
      this.tryPickUserFromHeaderUri(h(headers, 'to') || h(headers, 't') || getHeaderVal(text, ['To', 't'])) ||
      this.tryPickUserFromHeaderUri(h(headers, 'contact') || getHeaderVal(text, ['Contact'])) ||
      this.tryPickUserFromHeaderUri(h(headers, 'from') || h(headers, 'f') || getHeaderVal(text, ['From', 'f']));
    if (ext) this.endpointMap.set(sourceIp, { extension: ext, last: Date.now() });
  }

  private makeCallIdFallback(text: string, ip: string): string {
    let h = 0;
    const s = `${ip}|${text.slice(0, 256)}`;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h) + s.charCodeAt(i);
      h |= 0;
    }
    return `fallback-${ip}-${Math.abs(h)}`;
  }

  private updateCall(callId: string, patch: Partial<CallState>) {
    const prev = (this.calls.get(callId) || { last: 0 }) as CallState;
    const next = { ...prev, ...patch, last: Date.now() };
    this.calls.set(callId, next);
  }

  /** 발신 번호 추출: PAI → RPID → P-Preferred → From(display) → From(URI) → (최후) Request-URI
   *  단, DID/착신(=To/Request-URI/Contact user)와 동일하면 제외, 숫자 7자리 미만 제외 */
  private pickCallerNumber(headers: SipHeaders, rawUnfolded: string): string | undefined {
    // 착신(제외 대상) 추출: To/t, Request-URI, Contact
    const toUserRaw =
      this.tryPickUserFromHeaderUri(h(headers, 'to') || h(headers, 't') || getHeaderVal(rawUnfolded, ['To', 't']) || '');
    const reqUserRaw = this.tryPickUserFromRequestUri(rawUnfolded);
    const contactUserRaw =
      this.tryPickUserFromHeaderUri(h(headers, 'contact') || getHeaderVal(rawUnfolded, ['Contact']) || '');

    const dids = new Set(
      [toUserRaw, reqUserRaw, contactUserRaw]
        .map(v => this.normalizeDigits(v))
        .filter(v => v.length > 0)
    );

    const isValid = (n?: string | null) => {
      const nd = this.normalizeDigits(n);
      if (!nd) return false;
      if (dids.has(nd)) return false;
      if (nd.replace(/\D/g, '').length < 7) return false;
      return true;
    };

    // 1) P-Asserted-Identity (폴백 regex 포함)
    let paiSrc =
      h(headers, 'p-asserted-identity') ||
      getHeaderVal(rawUnfolded, ['P-Asserted-Identity']);
    let pai = this.tryPickUserFromHeaderUri(paiSrc || '') ||
      (paiSrc ? (paiSrc.match(/sip:([^@>;]+)@/i)?.[1] ?? null) : null);
    if (isValid(pai)) return this.normalizeDigits(pai!);

    // 2) Remote-Party-ID
    let rpidSrc =
      h(headers, 'remote-party-id') ||
      getHeaderVal(rawUnfolded, ['Remote-Party-ID']);
    let rpid = this.tryPickUserFromHeaderUri(rpidSrc || '') ||
      (rpidSrc ? (rpidSrc.match(/sip:([^@>;]+)@/i)?.[1] ?? null) : null);
    if (isValid(rpid)) return this.normalizeDigits(rpid!);

    // 3) P-Preferred-Identity
    let ppiSrc =
      h(headers, 'p-preferred-identity') ||
      getHeaderVal(rawUnfolded, ['P-Preferred-Identity']);
    let ppi = this.tryPickUserFromHeaderUri(ppiSrc || '') ||
      (ppiSrc ? (ppiSrc.match(/sip:([^@>;]+)@/i)?.[1] ?? null) : null);
    if (isValid(ppi)) return this.normalizeDigits(ppi!);

    // 4) From (display number 우선) – compact 'f' 지원 + 폴백 regex
    const fromSrc =
      h(headers, 'from') || h(headers, 'f') || getHeaderVal(rawUnfolded, ['From', 'f']) || '';
    const fromDisplay = this.tryPickPlainDigits(fromSrc);
    if (isValid(fromDisplay)) return this.normalizeDigits(fromDisplay!);

    const fromUser = this.tryPickUserFromHeaderUri(fromSrc) ||
      (fromSrc ? (fromSrc.match(/sip:([^@>;]+)@/i)?.[1] ?? null) : null);
    if (isValid(fromUser)) return this.normalizeDigits(fromUser!);

    // 5) (최후) Request-URI
    if (isValid(reqUserRaw)) return this.normalizeDigits(reqUserRaw!);

    return undefined;
  }

  /** 내선 추출: endpointMap(sourceIp) → To/Request-URI user 순 */
  private pickExtension(sourceIp: string, headers: SipHeaders, rawUnfolded: string): string | null {
    const cached = this.endpointMap.get(sourceIp)?.extension;
    if (cached) return cached;

    const toUser =
      this.tryPickUserFromRequestUri(rawUnfolded) ||
      this.tryPickUserFromHeaderUri(h(headers, 'to') || h(headers, 't') || getHeaderVal(rawUnfolded, ['To', 't']));
    return toUser || null;
  }

  /** 헤더에서 sip:<user>@ 형태의 user 추출 */
  private tryPickUserFromHeaderUri(hv?: string): string | null {
    if (!hv) return null;
    const m = hv.match(/<\s*sip:([^>@;]+)@[^>]+>/i) || hv.match(/\bsip:([^@>;]+)@/i);
    return m?.[1] ?? null;
  }

  /** Request-Line/URI에서 user 추출: ACK/INVITE sip:user@host SIP/2.0 */
  private tryPickUserFromRequestUri(text: string): string | null {
    const m = text.match(/^(INVITE|ACK|BYE|CANCEL)\s+sip:([^@\s>]+)@/im);
    if (m && m[2]) return m[2];
    return null;
  }

  /** 따옴표(display name) 안 숫자만 추출 */
  private tryPickPlainDigits(hv: string): string | null {
    const m = hv.match(/"(\+?\d{6,})"/);
    return m?.[1] ?? null;
  }

  /** 간단 정규화: 공백/대시 제거, 앞+ 유지 (null/undefined 안전) */
  private normalizeDigits(n: string | null | undefined): string {
    return (n ?? '').replace(/[\s-]/g, '');
  }

  private findDevice(ipOrDev: string): string {
    if (!CapMod) return ipOrDev;

    try {
      const device = CapMod.findDevice(ipOrDev);
      if (device) {
        logger.info(`[Switch][Adapter] Cap.findDevice 장비 검색: ${device}`);
        return device;
      }
    } catch (e: any) {
      logger.warn(`[Switch][Adapter] Cap.findDevice(${ipOrDev}) 실패: ${e.message}.`);
    }

    try {
      const list = CapMod.deviceList();
      logger.debug('[Switch][Adapter] Device List: ', list);
      const match = list.find((dev: any) =>
        (dev.addresses ?? []).some((a: any) => a.addr === ipOrDev)
      );
      if (match) {
        const deviceName = match.name ?? match.description;
        if (deviceName) {
          logger.info(`[Switch][Adapter] Cap.deviceList 장비 찾음: ${deviceName}`);
          return deviceName;
        }
      }
    } catch (e: any) {
      logger.warn(`[Switch][Adapter] Cap.deviceList() 찾기 실패: ${e.message}`);
    }

    logger.warn(`[Switch][Adapter] "${ipOrDev}"에 맞는 장비를 찾지 못했습니다. 식별자를 직접 사용합니다.`);
    return ipOrDev;
  }
}

export { SwitchCidAdapter };
export default SwitchCidAdapter;