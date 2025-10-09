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

// Callstar CID 기기 추출
const LIKELY_CID_IDENTIFIERS = ['cp210x', 'silicon labs'];

export class CallstarCidAdapter extends EventEmitter implements CidAdapter {
  private port?: SerialPort;
  private fb = new FrameBuffer();
  private status: CidStatus = {
    isOpen: false,
    callstarPort: undefined,
    deviceType: undefined,
  };

  /**
   * 포트 열기
   * --
   */
  async open(path: string) {
    logger.info(`[Callstar][Adapter] 포트 여는 중...`, path);
    await this.close();

    try {
      this.port = new SerialPort({
        path,
        baudRate: BAUD_RATE,
        dataBits: DATA_BITS,
        stopBits: STOP_BITS,
        parity: 'none',
        autoOpen: false,
      });
      await new Promise<void>((resolve, reject) => {
        this.port!.open((err) => (err ? reject(err) : resolve()));
      });

      this.port.on('data', (chunk: Buffer) => this.onData(chunk));

      this.port.on('error', (e: Error) => {
        logger.error('[Callstar][Adapter] Error: ', e);
        this.emit('error', e);
      });

      this.port.on('close', () => {
        logger.warn('[Callstar][Adapter] Port closed');
        this._updateStatus({
          isOpen: false,
          callstarPort: undefined,
          deviceType: undefined,
        });
      });

      logger.info(`[Callstar][Adapter] Port opened: ${path}`);
      this._updateStatus({
        isOpen: true,
        callstarPort: path,
        deviceType: 'callstar',
      });
    } catch (e) {
      logger.error(`[Callstar][Adapter] Port open Error: `, e);
      this.port = undefined;
      this._updateStatus({
        isOpen: false,
        callstarPort: undefined,
        deviceType: undefined,
      });
      throw e;
    }
  }

  /**
   * 포트 닫기
   * --
   */
  async close() {
    try {
      if (this.port?.isOpen) {
        logger.info(
          `[Callstar][Adapter] Closing port: ${this.status.callstarPort}`
        );
        await new Promise<void>((resolve, reject) => {
          this.port!.close((err) => (err ? reject(err) : resolve()));
        });
      }
      this.port = undefined;
      this.fb.clear();
      this._updateStatus({
        isOpen: false,
        callstarPort: undefined,
        deviceType: undefined,
      });
    } catch (e) {
      logger.error(`[Callstar][Adapter] Port closing Error: `, e);
      throw e;
    }
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
  private onData(chunk: Buffer) {
    this.fb.push(chunk);
    const frames = this.fb.drainFrame();
    for (const raw of frames) {
      const parsed = parsePacket(raw);
      if (!parsed) continue;

      this.emitCid(parsed);
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

  /**
   * 포트 목록
   * --
   */
  static async listPorts() {
    const ports = await SerialPort.list();

    return ports
      .map((p) => {
        const text = `${p.manufacturer ?? ''} ${p.pnpId ?? ''}`.toLowerCase();
        const isLikelyCid = LIKELY_CID_IDENTIFIERS.some((id) =>
          text.includes(id)
        );

        return {
          path: p.path,
          friendlyName: (p as any).friendlyName,
          isLikelyCid,
        };
      })
      .sort((a, b) => Number(b.isLikelyCid) - Number(a.isLikelyCid));
  }

  /** TEST */
  incoming(payload: string) {
    const packet = makePacket(OPCODE.INCOMING, payload);
    const chunk = Buffer.from(packet, 'utf-8');
    this.onData(chunk);
  }
}
