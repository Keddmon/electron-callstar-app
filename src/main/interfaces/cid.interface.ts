/**
 * CID 인터페이스 정의
 * --
 */
/** 패킷 */
export interface ParsedPacket {
    channel: string;
    opcode: string;
    payload: string;
    raw: string;
    receivedAt: number;
};

/** CID 어댑터 상태 */
export interface CidAdapterStatus {
    isOpen: boolean;
    portPath?: string;
    lastEventAt?: number;
    lastPacket?: ParsedPacket | null;
};