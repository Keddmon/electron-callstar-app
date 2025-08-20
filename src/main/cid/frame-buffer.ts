/**
 * frame-buffer.ts
 * ---
 * STX/ETX 프레이밍 (22바이트, space pad trim)
 */
import { STX, ETX } from './opcode-map';

/**
 * 시리얼 스트림에서 오는 chunk를 이어붙여
 * STX..ETX 완전 프레임 단위로 잘라서 반환
 */
export class FrameBuffer {
    private buffer = '';

    push(chunk: Buffer | string) {
        this.buffer += chunk.toString('utf8');
    }

    // 완전한 프레임들을 모두 꺼냄
    drainFrames(): string[] {
        const frames: string[] = [];

        for (; ;) {
            const start = this.buffer.indexOf(STX);
            const end = this.buffer.indexOf(ETX, start + 1);

            if (start < 0 || end < 0) {
                // STX 없거나 ETX가 아직 안옴 -> 대기
                if (start > 0) {
                    // 앞쪽 쓰레기 제거
                    this.buffer = this.buffer.slice(start);
                }
                break;
            }

            console.log(`[cid][frame-buffer] buffer: `, this.buffer);

            const frame = this.buffer.slice(start, end + 1);
            frames.push(frame);
            this.buffer = this.buffer.slice(end + 1);
        }

        console.log(`[cid][frame-buffer] frames: ${frames}`);

        return frames;
    }

    clear() {
        this.buffer = '';
    }
}