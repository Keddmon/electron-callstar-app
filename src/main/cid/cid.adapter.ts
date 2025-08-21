/**
 * cid-adapter.ts
 * ---
 * 포트 오픈/닫기, 자동탐지, 재연결, 이벤트 바인딩
 */
import EventEmitter from 'events';
import { SerialPort } from 'serialport';
import { BAUD_RATE, MASK_PAYLOAD } from './cid.constants';
import { FrameBuffer } from './frame-buffer';
import { makePacket, parsePacket } from './packet-parser';
import type { CidAdapterStatus, CidHighLevelEvent, ParsedPacket } from './cid.types';

type CidPortInfo = {
    path: string;
    manaufacturer?: string;
    serialNumber?: string;
    pnpId?: string;
    locationId?: string;
    vendorId?: string;
    productId?: string;
    friendlyName?: string;
    isLikelyCid: boolean;
};

type OpenOptions = { path: string, baudRate?: number };

export class CidAdapter extends EventEmitter {
    private port?: SerialPort;
    private fb = new FrameBuffer();
    private status: CidAdapterStatus = { isOpen: false, portPath: undefined, lastEventAt: undefined, lastPacket: null };

    async open(opts: OpenOptions) {
        await this.close(); // 이미 열려있다면 정리
        const { path, baudRate = BAUD_RATE } = opts;

        this.port = new SerialPort({ path, baudRate, dataBits: 8, stopBits: 1, parity: 'none', autoOpen: false });
        await new Promise<void>((resolve, reject) => {
            this.port!.open(err => (err ? reject(err) : resolve()));
        });

        this.port.on('data', (chunk: Buffer) => this.onData(chunk));
        this.port.on('error', (e: Error) => this.emit('error', e));
        this.port.on('close', () => {
            this.status.isOpen = false;
            this.emit('status', this.getStatus());
        });

        this.status = { ...this.status, isOpen: true, portPath: path };
        this.emit('status', this.getStatus());
    }

    async close() {
        if (this.port?.isOpen) {
            await new Promise<void>((resolve) => this.port!.close(() => resolve()));
        }
        this.port = undefined;
        this.fb.clear();
        this.status.isOpen = false;
        this.emit('status', this.getStatus());
    }

    getStatus(): CidAdapterStatus {
        return { ...this.status };
    }

    /**
     * 저수준 쓰기
     * --
     */
    writeRaw(frame: string) {
        if (!this.port || !this.port.isOpen) throw new Error('[cid][cid-adapter] Serial port not open');
        this.port.write(frame);
    }

    /**
     * 고수준 명령
     * ---
     */
    requestDeviceInfo(channel = '1') {
        this.writeRaw(makePacket(channel, 'P', ''));
    }

    dial(phoneNumber: string = '1234567890', channel = '1') {
        // 주의: 일부 PABX 환경에서는 9, prefix 필요. 필요시 payload 앞에 붙이도록 확장
        this.writeRaw(makePacket(channel, 'O', phoneNumber));
    }

    forceEnd(channel = '1') {
        this.writeRaw(makePacket(channel, 'F', ''));
    }
    
    // 2025 08 20 월요일: 테스트 명령어 추가
    incoming(phoneNumber: string = '1234567890', channel = '1') {
        this.writeRaw(makePacket(channel, 'I', phoneNumber));
    }

    dialComplete(channel = '1') {
        this.writeRaw(makePacket(channel, 'K'))
    }

    /**
     * 수신 데이터 처리
     * ---
     */
    private onData(chunk: Buffer) {
        this.fb.push(chunk);
        const frames = this.fb.drainFrames();
        for (const raw of frames) {
            const parsed = parsePacket(raw);
            if (!parsed) continue;
            this.status.lastEventAt = Date.now();
            this.status.lastPacket = parsed;
            this.emit('packet', parsed);
            this.emitHighLevel(parsed);
        }
        this.emit('status', this.getStatus());
    }

    private emitHighLevel(p: ParsedPacket) {
        let evt: CidHighLevelEvent | null = null;
        switch (p.opcode) {
            case 'I': {
                // 수신: payload가 번호 또는 특수문자(P/C/O)
                const mask = p.payload;
                if (mask === MASK_PAYLOAD.PRIVATE) {
                    evt = { type: 'masked', channel: p.channel, reason: 'PRIVATE' };
                } else if (mask === MASK_PAYLOAD.PUBLIC) {
                    evt = { type: 'masked', channel: p.channel, reason: 'PUBLIC' };
                } else if (mask === MASK_PAYLOAD.UNKNOWN) {
                    evt = { type: 'masked', channel: p.channel, reason: 'UNKNOWN' };
                } else {
                    evt = { type: 'incoming', channel: p.channel, phoneNumber: mask };
                }
                break;
            }
            case 'P':
                evt = { type: 'device-info', channel: p.channel, payload: p.payload };
                break;

            case 'O':
                evt = { type: 'dial-out', channel: p.channel, phoneNumber: p.payload };
                break;
            case 'K':
                evt = { type: 'dial-complete', channel: p.channel, phoneNumber: p.payload };
                break;
            case 'F':
                evt = { type: 'force-end', channel: p.channel };
                break;

            case 'S':
                evt = { type: 'off-hook', channel: p.channel };
                break;
            case 'E':
                evt = { type: 'on-hook', channel: p.channel };
                break;
            default:
                // 필요시 로깅만
                break;
        }
        if (evt) this.emit('event', evt);
        this.emit('raw', { type: 'raw', packet: p } as CidHighLevelEvent);
    }

    /**
     * 포트 탐지
     * ---
     */
    async listPorts(): Promise<CidPortInfo[]> {
        const ports = await SerialPort.list();

        return ports.map((p) => {
            const vendorId = (p.vendorId || '').toLowerCase();
            const productId = (p.productId || '').toLowerCase();
            // const text = `${p.manufacturer ?? ''} ${p.friendlyName ?? ''} ${p.pnpId ?? ''}`.toLowerCase();
            const text = `${p.manufacturer ?? ''} ${p.pnpId ?? ''}`.toLowerCase();

            const isCp210x =
                vendorId === '10c4' ||
                text.includes('cp210x') ||
                text.includes('silicon labs');

            return {
                path: p.path,
                manaufacturer: p.manufacturer,
                serialNumber: p.serialNumber,
                pnpId: p.pnpId,
                locationId: p.locationId as any,
                vendorId: p.vendorId,
                productId: p.productId,
                friendlyName: (p as any).friendlyName,
                isLikelyCid: isCp210x,
            };
        }).sort((a, b) => Number(b.isLikelyCid) - Number(a.isLikelyCid));
    }
}