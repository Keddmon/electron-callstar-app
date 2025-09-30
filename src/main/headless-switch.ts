// src/main/headless-switch.ts
/**
 * 헤드리스 스위치 캡처 테스트 하네스 (디버그 확장)
 * - BrowserWindow/IPC/렌더러 없이, 메인 프로세스에서 바로 캡처 실행
 * - 주요 SIP 메소드/응답 로깅: REGISTER/INVITE/CANCEL/BYE/ACK/200/180/486/487...
 *
 * 사용 예)
 *  1) 목록만 보기:      npm run dev:headless -- --list
 *  2) 인덱스로 열기:    npm run dev:headless -- --capture=7
 *  3) IP로 열기:        npm run dev:headless -- --capture=172.30.1.66
 *  4) 피어 지정(필터 자동): npm run dev:headless -- --capture=7 --peer=172.30.1.150
 *  5) 수동 필터 지정:   npm run dev:headless -- --filter="host 172.30.1.150 and (udp portrange 5060-5085 or tcp portrange 5060-5085)"
 */

// npm run dev:headless -- --capture=7 --filter="udp portrange 5060-5085 or tcp portrange 5060-5085"
// # 또는
// npm run dev:headless -- --capture=7 --peer=172.30.1.150
// # 또는 KT도 포함(더 확실)
// npm run dev:headless -- --capture=7 --filter="(host 172.30.1.150 or host 175.207.119.198 or host 175.207.119.202) and (udp portrange 5060-5085 or tcp portrange 5060-5085)"

// PowerShell
// # NIC 인덱스 7 (Realtek)
// npm run dev:headless -- --capture=7 --filter="udp portrange 5060-5085 or tcp portrange 5060-5085"

// # 전화기/KT 서버 모두 묶어서 (더 확실)
// npm run dev:headless -- --capture=7 --filter="(host 172.30.1.150 or host 175.207.119.198 or host 175.207.119.202) and (udp portrange 5060-5085 or tcp portrange 5060-5085)"


import { app } from 'electron';
import os from 'os';

// ---- cap 안전 로딩 ----
let CapCtor: any;
let capRoot: any;
try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    capRoot = require('cap');
    CapCtor = capRoot.Cap ?? capRoot;
} catch (e) {
    console.error('[headless] cap native module load failed. Rebuild for Electron: npx electron-rebuild -f -w cap');
    process.exit(1);
}

const decoders = capRoot.decoders || capRoot?.default?.decoders;
const PROTOCOL = decoders?.PROTOCOL;

// ---- 간단 로거 ----
const log = {
    info: (...a: any[]) => console.log('[headless][INFO]', ...a),
    warn: (...a: any[]) => console.warn('[headless][WARN]', ...a),
    error: (...a: any[]) => console.error('[headless][ERROR]', ...a),
    debug: (...a: any[]) => console.debug('[headless][DEBUG]', ...a),
};

// ---- SIP 파싱 유틸 ----
const normalizeSipText = (raw: string) =>
    raw.replace(/\r\n[ \t]+/g, ' '); // 헤더 폴딩 제거

const safeParseHeaders = (s: string): Record<string, string[]> => {
    const headers: Record<string, string[]> = {};
    for (const line of s.split(/\r?\n/)) {
        const m = /^([^:\s]+)\s*:\s*(.+)$/.exec(line);
        if (m) (headers[m[1].toLowerCase()] ||= []).push(m[2].trim());
    }
    return headers;
};
const one = (v?: string[] | string) => (Array.isArray(v) ? v[0] : v);
const extractNumber = (v?: string | null) => {
    if (!v) return null;
    const m =
        /<sip:([\+\d][\d\-]{4,})/i.exec(v) ||
        /tel:([\+\d][\d\-]{4,})/i.exec(v) ||
        /sip:([\d\-]{6,})/i.exec(v);
    return m ? m[1] : null;
};
const pickCallerNumber = (h: Record<string, string[]>) =>
    extractNumber(one(h['p-asserted-identity'])) ||
    extractNumber(one(h['remote-party-id'])) ||
    extractNumber(one(h['from']));
const formatKR = (n?: string | null) => {
    if (!n) return null;
    const digits = n.replace(/[^\d]/g, '');
    if (!digits) return null;
    const local = digits.startsWith('82') ? digits.replace(/^82/, '0') : digits;
    return local.replace(/^(\d{2,3})(\d{3,4})(\d{4}).*$/, '$1-$2-$3');
};
const firstLine = (t: string) => t.split(/\r?\n/, 1)[0] ?? '';

// ---- NIC 목록 ----
function deviceList(): any[] {
    try {
        if (typeof capRoot?.deviceList === 'function') return capRoot.deviceList();
    } catch (e) {
        log.warn('deviceList() failed:', e);
    }
    return [];
}

function printDeviceList() {
    const list = deviceList();
    if (!list.length) {
        log.warn('No capture devices found. (Npcap/WinPcap 설치, 관리자 권한 확인)');
        return;
    }
    console.log('=== Capture Devices ===');
    list.forEach((d: any, idx: number) => {
        const addrs = (d.addresses || []).map((a: any) => a.addr).filter(Boolean).join(', ');
        console.log(`${idx}: ${d.name} | ${d.description || ''} | ${addrs}`);
    });
}

// ---- findDevice: 인덱스/이름/IP 모두 허용 ----
function findDevice(ipOrIdx?: string | null): string | null {
    const list = deviceList();
    if (!list.length) return null;

    if (ipOrIdx && /^\d+$/.test(ipOrIdx)) {
        const picked = list[Number(ipOrIdx)];
        if (picked?.name) return picked.name;
    }
    if (ipOrIdx) {
        const byName = list.find((d: any) => d.name === ipOrIdx || d.description === ipOrIdx);
        if (byName?.name) return byName.name;
    }
    if (ipOrIdx) {
        const byIp = list.find((d: any) => (d.addresses ?? []).some((a: any) => a.addr === ipOrIdx));
        if (byIp?.name) return byIp.name;
    }

    const ifs = os.networkInterfaces();
    const cand = Object.values(ifs).flat().find((i: any) => i && !i.internal && i.family === 'IPv4');
    if (cand?.address) {
        const match = list.find((d: any) => (d.addresses ?? []).some((a: any) => a.addr === cand.address));
        if (match?.name) return match.name;
    }
    return list[0]?.name ?? null;
}

// ---- SIP 분류/로깅 ----
type SipClass =
    | 'INVITE' | 'BYE' | 'CANCEL' | 'ACK' | 'REGISTER' | 'OPTIONS' | 'INFO' | 'NOTIFY'
    | 'TRYING_100' | 'RINGING_180' | 'OK_200' | 'BUSY_486' | 'REQ_TERM_487'
    | 'OTHER';

function classifySip(t: string): SipClass {
    const l = t.toLowerCase();
    if (/^invite\s+sip:/mi.test(l)) return 'INVITE';
    if (/^bye\s+sip:/mi.test(l)) return 'BYE';
    if (/^cancel\s+sip:/mi.test(l)) return 'CANCEL';
    if (/^ack\s+sip:/mi.test(l)) return 'ACK';
    if (/^register\s+sip:/mi.test(l)) return 'REGISTER';
    if (/^options\s+sip:/mi.test(l)) return 'OPTIONS';
    if (/^info\s+sip:/mi.test(l)) return 'INFO';
    if (/^notify\s+sip:/mi.test(l)) return 'NOTIFY';

    if (/^sip\/2\.0\s+100/mi.test(l)) return 'TRYING_100';
    if (/^sip\/2\.0\s+180/mi.test(l)) return 'RINGING_180';
    if (/^sip\/2\.0\s+200/mi.test(l)) return 'OK_200';
    if (/^sip\/2\.0\s+486/mi.test(l)) return 'BUSY_486';
    if (/^sip\/2\.0\s+487/mi.test(l)) return 'REQ_TERM_487';

    return 'OTHER';
}

function logSip(kind: SipClass, text: string) {
    const headers = safeParseHeaders(text);
    const callId = one(headers['call-id']);
    const num = formatKR(pickCallerNumber(headers));
    const line0 = firstLine(text);

    switch (kind) {
        case 'INVITE':
            console.log(`[INCOMING] number=${num ?? '(unknown)'} call-id=${callId ?? '-'} | ${line0}`);
            break;
        case 'RINGING_180':
            console.log(`[180 RINGING] call-id=${callId ?? '-'} | ${line0}`);
            break;
        case 'OK_200':
            console.log(`[200 OK] call-id=${callId ?? '-'} | ${line0}`);
            break;
        case 'CANCEL':
            console.log(`[CANCEL] call-id=${callId ?? '-'} | ${line0}`);
            break;
        case 'REQ_TERM_487':
            console.log(`[487 REQ TERMINATED] call-id=${callId ?? '-'} | ${line0}`);
            break;
        case 'BUSY_486':
            console.log(`[486 BUSY HERE] call-id=${callId ?? '-'} | ${line0}`);
            break;
        case 'BYE':
            console.log(`[BYE] call-id=${callId ?? '-'} | ${line0}`);
            break;
        case 'ACK':
            console.log(`[ACK] call-id=${callId ?? '-'} | ${line0}`);
            break;
        case 'REGISTER':
            console.log(`[REGISTER] call-id=${callId ?? '-'} | ${line0}`);
            break;
        default:
            // 관심 없는건 조용히 넘어가도 되지만, 초기 디버깅 땐 아래 주석 해제
            // console.log(`[SIP] ${line0}`);
            break;
    }
}

// ---- 캡처 실행 ----
async function run() {
    const LIST = process.argv.includes('--list');
    const CAPTURE = (process.argv.find(a => a.startsWith('--capture='))?.split('=')[1]) ?? undefined;
    const PEER = (process.argv.find(a => a.startsWith('--peer='))?.split('=')[1]) ?? undefined;

    const DEFAULT_FILTER = 'udp portrange 5060-5085 or tcp portrange 5060-5085';
    const FILTER =
        (process.argv.find(a => a.startsWith('--filter='))?.split('=')[1])
        ?? (PEER ? `host ${PEER} and (${DEFAULT_FILTER})` : DEFAULT_FILTER);

    if (LIST) {
        printDeviceList();
        return;
    }

    const dev = findDevice(CAPTURE || null);
    if (!dev) {
        log.error('No capture device resolved. Run with --list to see devices.');
        process.exit(2);
    }

    log.info(`Opening device: ${dev} | filter: "${FILTER}"`);

    const cap = new CapCtor();
    const bufSize = 10 * 1024 * 1024;
    const buffer = Buffer.allocUnsafe(bufSize);

    try {
        cap.open(dev, FILTER, bufSize, buffer);
        if (typeof cap.setMinBytes === 'function') cap.setMinBytes(0);
    } catch (e) {
        log.error('cap.open failed. 관리자 권한, Npcap/WinPcap 설치, 필터 문법 확인 필요:', e);
        process.exit(3);
    }

    const cleanup = () => {
        try { cap.close(); } catch { }
        log.info('Capture closed. Bye.');
        app.quit();
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    cap.on('packet', (nbytes: number) => {
        try {
            if (!decoders || !PROTOCOL) return;

            // 여기! nbytes만 쓴 임시 버퍼 b
            const b = buffer.subarray(0, nbytes);

            // (1) Ethernet
            let ret = decoders.Ethernet(b);
            if (ret.info.type !== PROTOCOL.ETHERNET.IPV4) return;

            // (2) IPv4
            ret = decoders.IPV4(b, ret.offset);
            const ip = ret.info;

            // 일부 cap 버전은 키 이름이 다를 수 있어 안전 계산
            const ipHdrLen = (ip.hdrlen ?? ip.headerLength ?? 0);
            const ipTotal = (ip.totallen ?? ip.totalLength ?? (b.length - ret.offset));
            const ipPayloadOffset = ret.offset;
            const ipPayloadLen = Math.max(0, ipTotal - ipHdrLen);

            // (3) UDP/TCP
            let appOffset = 0;
            let appLen = 0;

            if (ip.protocol === PROTOCOL.IP.UDP) {
                const udp = decoders.UDP(b, ipPayloadOffset);
                appOffset = udp.offset;
                appLen = Math.max(0, (udp.info.length ?? 0) - 8); // UDP header 8 bytes
            } else if (ip.protocol === PROTOCOL.IP.TCP) {
                const tcp = decoders.TCP(b, ipPayloadOffset);
                appOffset = tcp.offset;
                const tcpHdrLen = (tcp.hdrlen ?? tcp.headerLength ?? 0);
                appLen = Math.max(0, ipPayloadLen - tcpHdrLen);
                // ⚠️ TCP 세그먼트 문제: 아래 참고
            } else {
                return;
            }

            if (appLen <= 0) return;

            const sipBuf = b.subarray(appOffset, appOffset + appLen);
            const raw = sipBuf.toString('latin1');

            if (!raw || (!raw.includes('SIP/2.0') &&
                !/^(invite|bye|cancel|ack|register|options|info|notify)\s+sip:/mi.test(raw))) {
                return;
            }

            const text = normalizeSipText(raw);
            const kind = classifySip(text);
            logSip(kind, text);
        } catch (e) {
            log.debug('packet parse fail:', e);
        }
    });

}

// Electron 앱 수명주기: 윈도우 없이 동작
if (!app.isReady()) {
    app.whenReady().then(run);
} else {
    run();
}
