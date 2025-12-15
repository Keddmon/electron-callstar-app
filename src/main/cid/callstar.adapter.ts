/** PACKAGE */
import EventEmitter from 'events';
import { SerialPort } from 'serialport';
/** UTILS */
import { logger } from '../logs';
import { FrameBuffer, parsePacket, makePacket } from '../utils';
/** CONSTANTS & INTERFACES & TYPES */
import {
  BAUD_RATE,
  DATA_BITS,
  STOP_BITS,
  OPCODE,
} from '../constants/callstar.constant';
import { CidAdapter, CidStatus } from '../interfaces/cid.interface';
import type { CidEvent } from '../types/cid';

export class CallstarCidAdapter extends EventEmitter implements CidAdapter {
  private port?: SerialPort;
  private fb = new FrameBuffer();
  private status: CidStatus = {
    isOpen: false,
    callstarPort: undefined,
    cidType: undefined,
  };

  // 레이스 가드
  private opening = false;
  private closing = false;

  /**
   * Callstar CID: 포트 열기
   * --
   */
  async open(path?: string) {
    const target = (path ?? this.status.callstarPort)?.trim();
    if (!target) {
      throw new Error(
        '[Callstar][Adapter] open(path): 유효한 포트 경로가 필요합니다.'
      );
    }
    if (this.opening) {
      logger.warn('[Callstar][Adapter] open()이 실행 중입니다.');
      return;
    }
    if (this.port?.isOpen && this.status.callstarPort === target) {
      logger.info('[Callstar][Adapter] 이미 같은 포트에서 열려있습니다.');
      this._updateStatus({
        isOpen: true,
        callstarPort: target,
        cidType: 'callstar',
      });
      return;
    }

    this.opening = true;
    logger.info(`[Callstar][Adapter] 포트 여는 중...`, path);

    await this.close();

    try {
      this.port = new SerialPort({
        path: target,
        baudRate: BAUD_RATE,
        dataBits: DATA_BITS,
        stopBits: STOP_BITS,
        parity: 'none',
        autoOpen: false,
      });

      await new Promise<void>((resolve, reject) => {
        this.port!.open((err) => (err ? reject(err) : resolve()));
      });

      try {
        await this.port!.flush();
        await this.port!.drain?.();
      } catch (e: any) {
        logger.debug('[Callstar][Adapter] flush/drain 스킵: ', e?.message);
      }

      const onData = (chunk: Buffer) => this.onData(chunk);
      const onError = (e: Error) => {
        logger.error('[Callstar][Adapter] Error: ', e);
        this.emit('error', e);
        this._updateStatus({ ...this.status });
      };
      const onClose = () => {
        logger.warn('[Callstar][Adapter] 포트 닫힘');
        this._updateStatus({
          isOpen: false,
          callstarPort: undefined,
          cidType: undefined,
        });
        this.teardownPort();
      };

      this.port.on('data', onData);
      this.port.on('error', onError);
      this.port.on('close', onClose);

      logger.info(`[Callstar][Adapter] 포트 열림: ${target}`);
      this._updateStatus({
        isOpen: true,
        callstarPort: target,
        cidType: 'callstar',
      });
    } catch (e: any) {
      logger.error(`[Callstar][Adapter] 포트 열기 에러: `, e?.message);
      this.teardownPort();
      this._updateStatus({
        isOpen: false,
        callstarPort: undefined,
        cidType: undefined,
      });
      throw e;
    } finally {
      this.opening = false;
    }
  }

  /**
   * Callstar CID: 포트 닫기
   * --
   */
  async close() {
    if (this.closing) {
      logger.warn('[Callstar][Adapter] close()이 실행 중입니다.');
      return;
    }
    this.closing = true;

    try {
      if (this.port?.isOpen) {
        logger.info(
          `[Callstar][Adapter] Closing port: ${this.status.callstarPort}`
        );
        await new Promise<void>((resolve, reject) => {
          this.port!.close((err) => (err ? reject(err) : resolve()));
        });
      }
    } catch (e: any) {
      logger.error(`[Callstar][Adapter] 포트 닫는 중 에러 발생F: `, e);
      throw e;
    } finally {
      this.teardownPort();
      this.fb.clear();
      this._updateStatus({
        isOpen: false,
        callstarPort: undefined,
        cidType: undefined,
      });
      this.closing = false;
    }
  }

  /**
   * 포트 리스너 삭제
   * --
   */
  private teardownPort() {
    try {
      if (this.port) {
        this.port.removeAllListeners('data');
        this.port.removeAllListeners('error');
        this.port.removeAllListeners('close');
      }
    } catch {}
    this.port = undefined;
  }

  /**
   * 현재 CID 상태 가져오기
   * --
   */
  getStatus(): CidStatus {
    return { ...this.status };
  }

  /**
   * 현재 CID 상태 업데이트
   * --
   */
  private _updateStatus(status: CidStatus) {
    this.status = { ...this.status, ...status };
    this.emit('status', this.getStatus());
  }

  /**
   * 수신 데이터 처리
   * --
   */
  private onData(chunk: Buffer) {
    try {
      this.fb.push(chunk);
      const frames = this.fb.drainFrame();
      for (const raw of frames) {
        try {
          const parsed = parsePacket(raw);
          if (!parsed) continue;
          this.emitCid(parsed);
        } catch (e: any) {
          logger.debug('[Callstar][Adapter] 패킷 분석 실패: ', e?.message);
        }
      }
    } catch (e: any) {
      logger.debug('[Callstar][Adapter] onData() 에러: ', e?.message);
    }
  }

  /**
   * 이벤트 송신(Emit)
   * --
   */
  private emitCid(p: any) {
    let cidData: Partial<CidEvent> | null = null;

    switch (p.opcode) {
      case OPCODE.INCOMING: {
        const payload = p.payload;
        logger.debug('[Callstar][Adapter] payload: ', payload);
        if (payload === OPCODE.PRIVATE) {
          cidData = { type: 'masked', payload: 'PRIVATE' };
        } else if (payload === OPCODE.PUBLIC) {
          cidData = { type: 'masked', payload: 'PUBLIC' };
        } else if (payload === OPCODE.UNKNOWN) {
          cidData = { type: 'masked', payload: 'UNKNOWN' };
        } else {
          cidData = { type: 'incoming', payload: payload };
        }
        break;
      }
      // 추후 확장 시, 주석 해제
      // case OPCODE.DEVICE_INFO:
      //   cidData = { type: 'device-info', payload: p.payload };
      //   break;
      // case OPCODE.DIAL_OUT:
      //   cidData = { type: 'dial-out', payload: p.payload };
      //   break;
      // case OPCODE.DIAL_COMPLETE:
      //   cidData = { type: 'dial-complete' };
      //   break;
      // case OPCODE.FORCE_END:
      //   cidData = { type: 'force-end' };
      //   break;
      // case OPCODE.OFF_HOOK:
      //   cidData = { type: 'off-hook' };
      //   break;
      // case OPCODE.ON_HOOK:
      //   cidData = { type: 'on-hook' };
      //   break;
    }

    if (cidData) {
      logger.debug(`[Callstar][Adapter]`, cidData);
      this.emit('cid', cidData);
    }
  }
}
