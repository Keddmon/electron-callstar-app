export interface ParsedPacket {
    channel: string;
    opcode: string;
    payload: string;
    raw: string;
    receivedAt: number;
}

export type CidHighLevelEvent =
    | { type: 'device-info'; channel: string; payload: string }

    | { type: 'incoming'; channel: string; phoneNumber: string }
    | { type: 'masked'; channel: string; reason: 'PRIVATE' | 'PUBLIC' | 'UNKNOWN' }

    | { type: 'dial-out'; channel: string; }
    | { type: 'dial-complete'; channel: string; }
    | { type: 'force-end'; channel: string; }

    | { type: 'on-hook', channel: string; }
    | { type: 'off-hook', channel: string; }

    | { type: 'raw', packet: ParsedPacket };

export interface CidAdapterStatus {
    isOpen: boolean;
    portPath?: string;
    lastEventAt?: number;
    lastPacket?: ParsedPacket | null;
}