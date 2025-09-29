import { STX, ETX } from '../constants/callstar.constant';
import { logger } from '../logs';

export class FrameBuffer {
  private buffer = '';

  push(chunk: Buffer | string) {
    this.buffer += chunk.toString('utf8');
  }

  drainFrame(): string[] {
    const frames: string[] = [];

    for (; ;) {
      const start = this.buffer.indexOf(STX);
      const end = this.buffer.indexOf(ETX, start + 1);

      if (start < 0 || end < 0) {
        if (start > 0) {
          this.buffer = this.buffer.slice(start);
        }
        break;
      }
      logger.info(`[FrameBuffer] buffer: `, this.buffer);

      const frame = this.buffer.slice(start, end + 1);
      frames.push(frame);
      this.buffer = this.buffer.slice(end + 1);
    }
    logger.info(`[FrameBuffer] frames: ${frames}`);

    return frames;
  }

  clear() {
    this.buffer = '';
  }
}