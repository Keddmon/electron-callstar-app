/**
 * CID 타입 정의
 * --
 */
import { ParsedPacket } from '../interfaces/cid.interface';

/** CID 포트 정보 */
export type CidPortInfo = {
    path: string;
    friendlyName?: string;
    isLikelyCid: boolean;
};

/** CID 프로토콜 이벤트 */
export type CidEvent =
    | { type: 'device-info'; device: string }

    | { type: 'incoming'; phoneNumber: string }
    | { type: 'masked'; reason: 'PRIVATE' | 'PUBLIC' | 'UNKNOWN' }

    | { type: 'dial-out'; phoneNumber: string }
    | { type: 'dial-complete'; }
    | { type: 'force-end'; }

    | { type: 'on-hook', }
    | { type: 'off-hook', }