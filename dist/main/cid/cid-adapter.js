"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CidAdapter = void 0;
/**
 * cid-adapter.ts
 * ---
 * 포트 오픈/닫기, 자동탐지, 재연결, 이벤트 바인딩
 */
const events_1 = __importDefault(require("events"));
const serialport_1 = require("serialport");
const opcode_map_1 = require("./opcode-map");
const frame_buffer_1 = require("./frame-buffer");
const packet_parser_1 = require("./packet-parser");
class CidAdapter extends events_1.default {
    constructor() {
        super(...arguments);
        this.fb = new frame_buffer_1.FrameBuffer();
        this.status = { isOpen: false, portPath: undefined, lastEventAt: undefined, lastPacket: null };
    }
    async open(opts) {
        await this.close(); // 이미 열려있다면 정리
        const { path, baudRate = opcode_map_1.BAUD_RATE } = opts;
        this.port = new serialport_1.SerialPort({ path, baudRate, dataBits: 8, stopBits: 1, parity: 'none', autoOpen: false });
        await new Promise((resolve, reject) => {
            this.port.open(err => (err ? reject(err) : resolve()));
        });
        this.port.on('data', (chunk) => this.onData(chunk));
        this.port.on('error', (e) => this.emit('error', e));
        this.port.on('close', () => {
            this.status.isOpen = false;
            this.emit('status', this.getStatus());
        });
        this.status = { ...this.status, isOpen: true, portPath: path };
        this.emit('status', this.getStatus());
    }
    async close() {
        if (this.port?.isOpen) {
            await new Promise((resolve) => this.port.close(() => resolve()));
        }
        this.port = undefined;
        this.fb.clear();
        this.status.isOpen = false;
        this.emit('status', this.getStatus());
    }
    getStatus() {
        return { ...this.status };
    }
    /**
     * 저수준 쓰기
     * --
     */
    writeRaw(frame) {
        if (!this.port || !this.port.isOpen)
            throw new Error('[cid][cid-adapter] Serial port not open');
        this.port.write(frame);
    }
    /**
     * 고수준 명령
     * ---
     */
    requestDeviceInfo(channel = '1') {
        this.writeRaw((0, packet_parser_1.makePacket)(channel, 'P', ''));
    }
    dial(phoneNumber, channel = '1') {
        // 주의: 일부 PABX 환경에서는 9, prefix 필요. 필요시 payload 앞에 붙이도록 확장
        this.writeRaw((0, packet_parser_1.makePacket)(channel, 'O', phoneNumber));
    }
    forceEnd(channel = '1') {
        this.writeRaw((0, packet_parser_1.makePacket)(channel, 'F', ''));
    }
    /**
     * 수신 데이터 처리
     * ---
     */
    onData(chunk) {
        this.fb.push(chunk);
        const frames = this.fb.drainFrames();
        for (const raw of frames) {
            const parsed = (0, packet_parser_1.parsePacket)(raw);
            if (!parsed)
                continue;
            this.status.lastEventAt = Date.now();
            this.status.lastPacket = parsed;
            this.emit('packet', parsed);
            this.emitHighLevel(parsed);
        }
        this.emit('status', this.getStatus());
    }
    emitHighLevel(p) {
        let evt = null;
        switch (p.opcode) {
            case 'I': {
                // 수신: payload가 번호 또는 특수문자(P/C/O)
                const mask = p.payload;
                if (mask === opcode_map_1.MASK_PAYLOAD.PRIVATE) {
                    evt = { type: 'masked', channel: p.channel, reason: 'PRIVATE' };
                }
                else if (mask === opcode_map_1.MASK_PAYLOAD.PUBLIC) {
                    evt = { type: 'masked', channel: p.channel, reason: 'PUBLIC' };
                }
                else if (mask === opcode_map_1.MASK_PAYLOAD.UNKNOWN) {
                    evt = { type: 'masked', channel: p.channel, reason: 'UNKNOWN' };
                }
                else {
                    evt = { type: 'incoming', channel: p.channel, phoneNumber: mask };
                }
                break;
            }
            case 'P':
                evt = { type: 'device-info', channel: p.channel, payload: p.payload };
                break;
            case 'O':
                evt = { type: 'dial-out', channel: p.channel };
                break;
            case 'K':
                evt = { type: 'dial-complete', channel: p.channel };
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
        if (evt)
            this.emit('event', evt);
        this.emit('raw', { type: 'raw', packet: p });
    }
}
exports.CidAdapter = CidAdapter;
//# sourceMappingURL=cid-adapter.js.map