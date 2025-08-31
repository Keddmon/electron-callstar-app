/**
 * 바이트 프레임 → ParsedPacket 변환
 * --
 */
import { STX, ETX, FRAME_BODY_LEN, Opcode } from './cid.constants';
import type { ParsedPacket } from '../interfaces/cid.interface';
import logger from '../logs/logger';

/**
 * CID 패킷 만들기
 * --
 * STX + (본문 20자) + ETX
 */
export function makePacket(channel: string, opcode: Opcode, payload = ''): string {
    let body = `${channel}${opcode}${payload}`;

    console.log('[makePacket] channel: ', channel);
    console.log('[makePacket] opcode: ', opcode);
    console.log('[makePacket] payload: ', payload);
    console.log('[makePacket] body: ', body);

    if (body.length > FRAME_BODY_LEN) {
        logger.warn(`[Packet] Payload for opcode '${opcode}' is too long. Truncating.`, {
            originalLength: body.length,
            maxLength: FRAME_BODY_LEN,
        });
        body = body.slice(0, FRAME_BODY_LEN);
    } else {
        body = body.padEnd(FRAME_BODY_LEN, ' ');
    }

    const packet = `${STX}${body}${ETX}`;
    logger.debug(`[Packet] Made packet: ${packet}`);

    console.log('[Packet] Packet: ', packet);

    return packet;
}

/**
 * 프레임 파싱
 * --
 * STX/ETX로 감싼 완전한 프레임 파싱
 */
export function parsePacket(raw: string): ParsedPacket | null {
    if (!raw.startsWith(STX)) {
        logger.debug('[Packet] Parse failed: Missing STX.', { raw });
        return null;
    }
    if (!raw.endsWith(ETX)) {
        logger.debug('[Packet] Parse failed: Missing ETX.', { raw });
        return null;
    }

    const body = raw.slice(1, -1);
    if (body.length !== FRAME_BODY_LEN) {
        logger.debug('[Packet] Parse failed: Incorrect body length.', {
            expected: FRAME_BODY_LEN,
            actual: body.length,
            raw,
        });
        return null;
    }

    const channel = body[0];
    const opcode = body[1];
    const payload = body.slice(2).trim();

    console.log('==============================');
    console.log('[Packet] Raw: ', raw);
    console.log('[Packet] Body: ', body);
    console.log('[Packet] Channel: ', channel);
    console.log('[Packet] Opcode: ', opcode);
    console.log('[Packet] payload: ', payload);
    console.log('==============================');
    logger.debug('[Packet] Parsed packet.', { channel, opcode, payload });

    return {
        channel,
        opcode,
        payload,
        raw,
        receivedAt: Date.now(),
    };
}