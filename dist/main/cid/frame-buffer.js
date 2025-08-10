"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FrameBuffer = void 0;
/**
 * frame-buffer.ts
 * ---
 * STX/ETX 프레이밍 (22바이트, space pad trim)
 */
const opcode_map_1 = require("./opcode-map");
/**
 * 시리얼 스트림에서 오는 chunk를 이어붙여
 * STX..ETX 완전 프레임 단위로 잘라서 반환
 */
class FrameBuffer {
    constructor() {
        this.buffer = '';
    }
    push(chunk) {
        this.buffer += chunk.toString('utf8');
    }
    // 완전한 프레임들을 모두 꺼냄
    drainFrames() {
        const frames = [];
        for (;;) {
            const start = this.buffer.indexOf(opcode_map_1.STX);
            const end = this.buffer.indexOf(opcode_map_1.ETX, start + 1);
            if (start < 0 || end < 0) {
                // STX 없거나 ETX가 아직 안옴 -> 대기
                if (start > 0) {
                    // 앞쪽 쓰레기 제거
                    this.buffer = this.buffer.slice(start);
                }
                break;
            }
            const frame = this.buffer.slice(start, end + 1);
            frames.push(frame);
            this.buffer = this.buffer.slice(end + 1);
        }
        console.log(`[cid][frame-buffer] ${frames}`);
        return frames;
    }
    clear() {
        this.buffer = '';
    }
}
exports.FrameBuffer = FrameBuffer;
//# sourceMappingURL=frame-buffer.js.map