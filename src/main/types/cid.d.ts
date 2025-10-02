/** CID 종류 */
export type CallstarOpenOpts = { kind: 'callstar'; path: string; };
export type SwitchOpenOpts = { kind: 'switch', device: string; sipPort?: number; bpf?: string };

/** CID 포트 정보 */
export type CidPortInfo = {
  path: string;
  friendlyName?: string;
  isLikelyCid?: boolean;
};

/** CID 프로토콜 이벤트 */
export type CidEvent =
  | { type: 'incoming'; payload: string | null, callId?: string; channel?: string }
  | { type: 'masked'; payload: 'PRIVATE' | 'PUBLIC' | 'UNKNOWN'; callId?: string, channel?: string }
  | { type: 'answered'; callId?: string, channel?: string }
  | { type: 'end'; reason?: 'bye' | 'cancel' | 'failed' | 'timeout'; callId?: string; channel?: string }

  | { type: 'device-info'; payload: string | null }
  | { type: 'dial-out'; payload: string; callId?: string }
  | { type: 'dial-complete'; callId?: string }
  | { type: 'force-end'; callId?: string }
  | { type: 'on-hook'; callId?: string; }
  | { type: 'off-hook'; callId?: string; };