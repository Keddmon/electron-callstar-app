/**
 * cid-adapter.ts
 * --
 * 포트 오픈/닫기, 자동탐지, 재연결, 이벤트 바인딩
 */
import EventEmitter from 'events';
import { SerialPort } from 'serialport';
import logger from '../logs/logger';
import { BAUD_RATE, OPCODE } from './cid.constants';
import type { CidEvent, CidPortInfo } from '../types/cid';
import { CidAdapterStatus, ParsedPacket } from '../interfaces/cid.interface';
import { FrameBuffer } from './frame-buffer';
import { makePacket, parsePacket } from './packet-parser';

type OpenOptions = { path: string, baudRate?: number };

const LIKELY_CID_IDENTIFIERS = ['cp210x', 'silicon labs'];

export class CidAdapter extends EventEmitter {
    private port?: SerialPort;
    private fb = new FrameBuffer();
    private status: CidAdapterStatus = {
        isOpen: false,
        portPath: undefined,
        lastEventAt: undefined,
        lastPacket: null
    };

    /**
     * 포트 열기
     * --
     */
    async open(opts: OpenOptions) {
        logger.info('[Adapter] Opening port...', opts);
        await this.close(); // 이미 열려있다면 정리
        const { path, baudRate = BAUD_RATE } = opts;

        try {
            this.port = new SerialPort({
                path,
                baudRate,
                dataBits: 8,
                stopBits: 1,
                parity: 'none',
                autoOpen: false,        // 추후 확인 필요
            });
            await new Promise<void>((resolve, reject) => {
                this.port!.open(err => (err ? reject(err) : resolve()));
            });

            this.port.on('data', (chunk: Buffer) => this.onData(chunk));
            this.port.on('error', (e: Error) => {
                logger.error('[Adapter] Port error', e);
                this.emit('error', e);
            });
            this.port.on('close', () => {
                logger.warn('[Adapter] Port closed');
                this._updateStatus({ isOpen: false });
            });

            logger.info(`[Adapter} Port opened successfully: ${path}`);
            this._updateStatus({ isOpen: true, portPath: path });
        } catch (error) {
            logger.error(`[Adapter] Failed to open port ${path}`, error);
            this.port = undefined;
            this._updateStatus({ isOpen: false, portPath: undefined });
            throw error;
        }
    }

    /**
     * 포트 닫기
     * --
     */
    async close() {
        if (this.port?.isOpen) {
            logger.info(`[Adapter] Closing port: ${this.status.portPath}`);
            await new Promise<void>((resolve) => this.port!.close(() => resolve()));
        }
        this.port = undefined;
        this.fb.clear();
        this._updateStatus({ isOpen: false, portPath: undefined, lastEventAt: undefined, lastPacket: null });
    }

    /**
     * 현재 상태
     * --
     */
    getStatus(): CidAdapterStatus {
        return { ...this.status };
    }

    /**
     * 현재 상태 업데이트
     * --
     */
    private _updateStatus(newStatus: Partial<CidAdapterStatus>) {
        this.status = { ...this.status, ...newStatus };
        this.emit('status', this.getStatus());
    }

    /**
     * 저수준 쓰기
     * --
     */
    private writeRaw(frame: string) {
        if (!this.port || !this.port.isOpen) {
            logger.warn('[Adapter] Attempted to write, but port is not open', { frame });
            return;
        }
        this.port.write(frame);
    }

    // PC ↔ 장치
    requestDeviceInfo(channel = '1') {
        this.writeRaw(makePacket(channel, OPCODE.DEVICE_INFO, ''));
        console.log(`[Adapter] ${OPCODE.DEVICE_INFO}`);
    }

    // PC → 장치
    dialOut(channel = '1', phoneNumber: string) {
        this.writeRaw(makePacket(channel, OPCODE.DIAL_OUT, phoneNumber));
        console.log(`[Adapter] ${OPCODE.DIAL_OUT}`);
    }

    // PC → 장치
    forceEnd(channel = '1') {
        this.writeRaw(makePacket(channel, OPCODE.FORCED_END));
        console.log(`[Adapter] ${OPCODE.FORCED_END}`);
    }

    // 장치 → PC
    incoming(channel = '1', phoneNumber: string) {
        const packet = makePacket(channel, OPCODE.INCOMING, phoneNumber);
        const chunk = Buffer.from(packet, 'utf-8');
        this.onData(chunk);
    }

    // 장치 → PC
    dialComplete(channel = '1') {
        const packet = makePacket(channel, OPCODE.DIAL_COMPLETE);
        const chunk = Buffer.from(packet, 'utf-8');
        this.onData(chunk);
    }

    // 장치 → PC
    offHook(channel = '1') {
        const packet = makePacket(channel, OPCODE.OFF_HOOK);
        const chunk = Buffer.from(packet, 'utf-8');
        this.onData(chunk);
    }

    // 장치 → PC
    onHook(channel = '1') {
        const packet = makePacket(channel, OPCODE.ON_HOOK);
        const chunk = Buffer.from(packet, 'utf-8');
        this.onData(chunk);
    }

    /**
     * 수신 데이터 처리
     * --
     */
    private onData(chunk: Buffer) {
        this.fb.push(chunk);
        const frames = this.fb.drainFrames();
        for (const raw of frames) {
            const parsed = parsePacket(raw);
            if (!parsed) continue;

            this._updateStatus({ lastEventAt: Date.now(), lastPacket: parsed });
            this.emit('packet', parsed);
            this.emitHighLevel(parsed);
        }
    }

    /**
     * 프로토콜 분기 처리
     * --
     */
    private emitHighLevel(p: ParsedPacket) {
        let evt: CidEvent | null = null;
        switch (p.opcode) {
            case OPCODE.INCOMING: {
                // 수신: payload가 번호 또는 특수문자(P/C/O)
                const mask = p.payload;
                if (mask === OPCODE.PRIVATE) {
                    evt = { type: 'masked', channel: p.channel, reason: 'PRIVATE' };
                } else if (mask === OPCODE.PUBLIC) {
                    evt = { type: 'masked', channel: p.channel, reason: 'PUBLIC' };
                } else if (mask === OPCODE.UNKNOWN) {
                    evt = { type: 'masked', channel: p.channel, reason: 'UNKNOWN' };
                } else {
                    evt = { type: 'incoming', channel: p.channel, phoneNumber: mask };
                }
                break;
            }
            case OPCODE.DEVICE_INFO:
                evt = { type: 'device-info', channel: p.channel, payload: p.payload };
                break;

            case OPCODE.DIAL_OUT:
                evt = { type: 'dial-out', channel: p.channel, phoneNumber: p.payload };
                break;
            case OPCODE.DIAL_COMPLETE:
                evt = { type: 'dial-complete', channel: p.channel };
                break;
            case OPCODE.FORCED_END:
                evt = { type: 'force-end', channel: p.channel };
                break;

            case OPCODE.OFF_HOOK:
                evt = { type: 'off-hook', channel: p.channel };
                break;
            case OPCODE.ON_HOOK:
                evt = { type: 'on-hook', channel: p.channel };
                break;
            default:
                logger.debug(`[Adapter] Unknown opcode received: ${p.opcode}`);
                break;
        }
        if (evt) {
            logger.debug('[Adapter] Emitting high-level event', evt);
            this.emit('event', evt);
        }
        this.emit('raw', { type: 'raw', packet: p } as CidEvent);
    }

    /**
     * 연결된 포트 탐지
     * --
     */
    async listPorts(): Promise<CidPortInfo[]> {
        const ports = await SerialPort.list();

        return ports.map((p) => {
            const text = `${p.manufacturer ?? ''} ${p.pnpId ?? ''}`.toLowerCase();
            const isLikelyCid = LIKELY_CID_IDENTIFIERS.some(id => text.includes(id));

            return {
                path: p.path,
                manufacturer: p.manufacturer,
                serialNumber: p.serialNumber,
                pnpId: p.pnpId,
                locationId: p.locationId as any,
                vendorId: p.vendorId,
                productId: p.productId,
                friendlyName: (p as any).friendlyName,
                isLikelyCid,
            };
        }).sort((a, b) => Number(b.isLikelyCid) - Number(a.isLikelyCid));
    }
}