import EventEmitter from 'events';
import { SerialPort } from 'serialport';

import { logger } from '../logs';
import { FrameBuffer, parsePacket, makePacket } from '../utils';

import { BAUD_RATE, DATA_BITS, STOP_BITS, OPCODE } from '../constants/callstar.constant';
import { CidAdapter, CidStatus } from '../interfaces/cid.interface';
import type { CidEvent } from '../types/cid';

const LIKELY_CID_IDENTIFIERS = ['cp210x', 'silicon labs'];

export class CallstarCidAdapter extends EventEmitter implements CidAdapter {
  private port?: SerialPort;
  private fb = new FrameBuffer();
  private status: CidStatus = {
    isOpen: false,
    portPath: undefined,
  };

  /**
   * 포트 열기
   * @param path 포트 경로
   * --
   */
  async open(path: string) {
    logger.info(`[CallstarCidAdapter] 포트 여는 중...`, path);
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
        this.port!.open(err => (err ? reject(err) : resolve()));
      });

      this.port.on('data', (chunk: Buffer) => this.onData(chunk));

      this.port.on('error', (e: Error) => {
        logger.error('[Callstar][Adapter] Error: ', e);
        this.emit('error', e);
      });

      this.port.on('close', () => {
        logger.warn('[Callstar][Adapter] Port closed');
        this._updateStatus({ isOpen: false, portPath: undefined });
      });

      logger.info(`[Callstar][Adapter] Port opened: ${path}`);
      this._updateStatus({ isOpen: true, portPath: path });
    } catch (e) {
      logger.error(`[Callstar][Adapter] Port open Error: `, e);
      this.port = undefined;
      this._updateStatus({ isOpen: false, portPath: undefined });
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
        logger.info(`[Callstar][Adapter] Closing port: ${this.status.portPath}`);
        await new Promise<void>((resolve) => this.port!.close(() => resolve));
      }
      this.port = undefined;
      this.fb.clear();
      this._updateStatus({ isOpen: false, portPath: undefined });
    } catch (e) {
      logger.error(`[Callstar][Adapter] Port closing Error: `, e);
      throw e;
    }
  }

  /**
   * 상태 확인
   * @returns portPath, isOpen
   * --
   */
  getStatus(): CidStatus {
    return { ...this.status };
  }

  /**
   * 현재 CID 상태 업데이트
   * @param status CID 상태
   * --
   */
  private _updateStatus(status: CidStatus) {
    this.status = { ...this.status, ...status };
    this.emit('status', this.getStatus());
  }

  /**
   * 수신 데이터 처리
   * @param chunk CID 패킷
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
   * @param p CID 패킷
   * --
   */
  private emitCid(p: any) {
    let cidData: Partial<CidEvent> | null = null;

    switch (p.opcode) {
      case OPCODE.INCOMING: {
        const payload = p.payload;
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
        cidData = { type: 'device-info', payload: p.payload }
        break;

      case OPCODE.DIAL_OUT:
        cidData = { type: 'dial-out', payload: p.payload }
        break;

      case OPCODE.DIAL_COMPLETE:
        cidData = { type: 'dial-complete' }
        break;

      case OPCODE.FORCE_END:
        cidData = { type: 'force-end' }
        break;

      case OPCODE.OFF_HOOK:
        cidData = { type: 'off-hook' }
        break;

      case OPCODE.ON_HOOK:
        cidData = { type: 'on-hook' }
        break;
    }

    if (cidData) {
      logger.debug(`[Callstar][Adapter][emitCid]`, cidData);
      this.emit('cid', cidData);
    }
  }

  /**
   * 포트 목록
   * @returns port list
   */
  async listPorts() {
    const ports = await SerialPort.list();

    return ports
      .map((p, idx) => {
        const text = `${p.manufacturer ?? ''} ${p.pnpId ?? ''}`.toLowerCase();
        const isLikelyCid = LIKELY_CID_IDENTIFIERS.some((id) => text.includes(id));

        return {
          id: String(idx),
          path: p.path,
          friendlyName: (p as any).friendlyName,
          isLikelyCid,
        };
      })
      .sort((a, b) => Number(b.isLikelyCid) - Number(a.isLikelyCid));
  }

  /** TEST */
  incoming(phoneNumber: string) {
    const packet = makePacket(OPCODE.INCOMING, phoneNumber);
    const chunk = Buffer.from(packet, 'utf-8');
    this.onData(chunk);
  }
}