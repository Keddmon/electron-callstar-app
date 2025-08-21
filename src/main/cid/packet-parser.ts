/**
 * packet-parser.ts
 * ---
 * 문자열 -> { channel, opcode, payload }
 */
import { STX, ETX, FRAME_BODY_LEN } from './cid.constants';
import type { ParsedPacket } from './cid.types';

/**
 * CID 패킷 만들기
 * ---
 * STX + (본문 21자) + ETX
 */
export function makePacket(channel: string, opcode: string, payload = ''): string {
    let body = `${channel}${opcode}${payload}`;
    if (body.length > FRAME_BODY_LEN) {
        body = body.slice(0, FRAME_BODY_LEN);
    } else {
        body = body.padEnd(FRAME_BODY_LEN, ' ');
    }

    console.log(`[cid][packet-parser] ${STX}${body}${ETX}`);

    return `${STX}${body}${ETX}`;
}

/**
 * 프레임 파싱
 * ---
 * STX/ETX로 감싼 완전한 프레임 파싱
 */
export function parsePacket(raw: string): ParsedPacket | null {
    if (!raw.startsWith(STX) || !raw.endsWith(ETX)) return null;
    const body = raw.slice(1, -1); // 21 chars
    if (body.length !== FRAME_BODY_LEN) return null;

    const channel = body[0];
    const opcode = body[1];
    const payload = body.slice(2).trim();

    console.log(`[cid][packet-parser] ${channel}${opcode}${payload}`);

    return {
        channel,
        opcode,
        payload,
        raw,
        receivedAt: Date.now(),
    };
}