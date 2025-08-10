"use strict";
/**
 * opcode-map.ts
 * ---
 * opcode -> 비즈 이벤트 맵핑(I/S/E/F/P/K)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BAUD_RATE = exports.MASK_PAYLOAD = exports.FRAME_BODY_LEN = exports.ETX = exports.STX = void 0;
exports.STX = '\x02';
exports.ETX = '\x03';
exports.FRAME_BODY_LEN = 21;
exports.MASK_PAYLOAD = {
    PRIVATE: 'P', // 발신번호표시 금지
    PUBLIC: 'C', // 공중전화
    UNKNOWN: 'O', // 발신번호 수집불가
};
exports.BAUD_RATE = 19200;
//# sourceMappingURL=opcode-map.js.map