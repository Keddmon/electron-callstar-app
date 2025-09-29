/** CID 포트 정보 */
export type CidPortInfo = {
  path: string;
  friendlyName?: string;
  isLikelyCid: boolean;
};

/** CID 프로토콜 이벤트 */
export type CidEvent =
  | { type: 'incoming'; payload: string | null, callId?: string }
  | { type: 'masked'; payload: 'PRIVATE' | 'PUBLIC' | 'UNKNOWN' }
  | { type: 'device-info'; payload: string | null }
  | { type: 'dial-out'; payload: string }
  | { type: 'dial-complete'; }
  | { type: 'force-end'; }
  | { type: 'on-hook'; callId?: string; }
  | { type: 'off-hook'; callId?: string; };