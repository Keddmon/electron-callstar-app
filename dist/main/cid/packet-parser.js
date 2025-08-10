"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makePacket = makePacket;
exports.parsePacket = parsePacket;
/**
 * packet-parser.ts
 * ---
 * 문자열 -> { channel, opcode, payload }
 */
const opcode_map_1 = require("./opcode-map");
/**
 * CID 패킷 만들기
 * ---
 * STX + (본문 21자) + ETX
 */
function makePacket(channel, opcode, payload = '') {
    let body = `${channel}${opcode}${payload}`;
    if (body.length > opcode_map_1.FRAME_BODY_LEN) {
        body = body.slice(0, opcode_map_1.FRAME_BODY_LEN);
    }
    else {
        body = body.padEnd(opcode_map_1.FRAME_BODY_LEN, ' ');
    }
    console.log(`[cid][packet-parser] ${opcode_map_1.STX}${body}${opcode_map_1.ETX}`);
    return `${opcode_map_1.STX}${body}${opcode_map_1.ETX}`;
}
/**
 * 프레임 파싱
 * ---
 * STX/ETX로 감싼 완전한 프레임 파싱
 */
function parsePacket(raw) {
    if (!raw.startsWith(opcode_map_1.STX) || !raw.endsWith(opcode_map_1.ETX))
        return null;
    const body = raw.slice(1, -1); // 21 chars
    if (body.length !== opcode_map_1.FRAME_BODY_LEN)
        return null;
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
//# sourceMappingURL=packet-parser.js.map