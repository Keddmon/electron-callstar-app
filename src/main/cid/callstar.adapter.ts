import EventEmitter from 'events';
import { SerialPort } from 'serialport';
import { logger } from '../logs';
import { FrameBuffer, parsePacket, makePacket } from '../utils';
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
    deviceType: undefined,
  };

  // 레이스 가드
  private opening = false;
  private closing = false;

  /**
   * 포트 열기
   * --
   */
  async open(path?: string) {
    const target = (path ?? this.status.callstarPort)?.trim();
    if (!target) {
      throw new Error('[Callstar][Adapter] open(path): 유효한 포트 경로가 필요합니다.');
    }
    if (this.opening) {
      logger.warn('[Callstar][Adapter] open()이 실행 중입니다.');
      return;
    }
    if (this.port?.isOpen && this.status.callstarPort === target) {
      logger.info('[Callstar][Adapter] 이미 같은 포트에서 열려있습니다.');
      this._updateStatus({ isOpen: true, callstarPort: target, deviceType: 'callstar' });
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
        logger.debug('[Callstar][Adapter] flush/drain 스킵: ', (e as Error)?.message);
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
          deviceType: undefined,
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
        deviceType: 'callstar',
      });

      // this.port.on('data', (chunk: Buffer) => this.onData(chunk));

      // this.port.on('error', (e: Error) => {
      //   logger.error('[Callstar][Adapter] Error: ', e);
      //   this.emit('error', e);
      // });

      // this.port.on('close', () => {
      //   logger.warn('[Callstar][Adapter] Port closed');
      //   this._updateStatus({
      //     isOpen: false,
      //     callstarPort: undefined,
      //     deviceType: undefined,
      //   });
      // });

      // logger.info(`[Callstar][Adapter] Port opened: ${path}`);
      // this._updateStatus({
      //   isOpen: true,
      //   callstarPort: path,
      //   deviceType: 'callstar',
      // });
    } catch (e) {
      // logger.error(`[Callstar][Adapter] 포트 열기 에러: `, e);
      // this.port = undefined;
      // this._updateStatus({
      //   isOpen: false,
      //   callstarPort: undefined,
      //   deviceType: undefined,
      // });
      // throw e;
      logger.error(`[Callstar][Adapter] 포트 열기 에러: `, e);
      this.teardownPort();
      this._updateStatus({
        isOpen: false,
        callstarPort: undefined,
        deviceType: undefined,
      });
      throw e;
    } finally {
      this.opening = false;
    }
  }

  /**
   * 포트 닫기
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
      // this.port = undefined;
      // this.fb.clear();
      // this._updateStatus({
      //   isOpen: false,
      //   callstarPort: undefined,
      //   deviceType: undefined,
      // });
    } catch (e) {
      logger.error(`[Callstar][Adapter] Port closing Error: `, e);
      throw e;
    } finally {
      this.teardownPort();
      this.fb.clear();
      this._updateStatus({
        isOpen: false,
        callstarPort: undefined,
        deviceType: undefined,
      });
      this.closing = false;
    }
  }

  private teardownPort() {
    try {
      if (this.port) {
        this.port.removeAllListeners('data');
        this.port.removeAllListeners('error');
        this.port.removeAllListeners('close');
      }
    } catch { }
    this.port = undefined;
  }

  /**
   * 상태 확인
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
  // private onData(chunk: Buffer) {
  //   this.fb.push(chunk);
  //   const frames = this.fb.drainFrame();
  //   for (const raw of frames) {
  //     const parsed = parsePacket(raw);
  //     if (!parsed) continue;

  //     this.emitCid(parsed);
  //   }
  // }
  private onData(chunk: Buffer) {
    try {
      this.fb.push(chunk);
      const frames = this.fb.drainFrame();
      for (const raw of frames) {
        try {
          const parsed = parsePacket(raw);
          if (!parsed) continue;
          this.emitCid(parsed);
        } catch (e) {
          logger.debug('[Callstar][Adapter] frame parse failed:', (e as Error)?.message);
        }
      }
    } catch (e) {
      logger.debug('[Callstar][Adapter] onData error:', (e as Error)?.message);
    }
  }

  /**
   * 패킷 분석 후 Emit
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
      case OPCODE.DEVICE_INFO:
        cidData = { type: 'device-info', payload: p.payload };
        break;
      case OPCODE.DIAL_OUT:
        cidData = { type: 'dial-out', payload: p.payload };
        break;
      case OPCODE.DIAL_COMPLETE:
        cidData = { type: 'dial-complete' };
        break;
      case OPCODE.FORCE_END:
        cidData = { type: 'force-end' };
        break;
      case OPCODE.OFF_HOOK:
        cidData = { type: 'off-hook' };
        break;
      case OPCODE.ON_HOOK:
        cidData = { type: 'on-hook' };
        break;
    }

    if (cidData) {
      logger.debug(`[Callstar][Adapter]`, cidData);
      this.emit('cid', cidData);
    }
  }

  /** TEST */
  incoming(payload: string) {
    const packet = makePacket(OPCODE.INCOMING, payload);
    const chunk = Buffer.from(packet, 'utf-8');
    this.onData(chunk);
  }
}
