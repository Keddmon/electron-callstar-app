export * from './settings.d copy2';

/** CID 포트 정보 */
export type CidPortInfo = {
  path: string;
  friendlyName?: string;
  isLikelyCid?: boolean;
};

/** CID 프로토콜 이벤트 */
export type CidEvent =
  | {
      type: 'incoming';
      payload: string | null;
      callId?: string;
      channel?: string;
      extension?: string;
    }
  | {
      type: 'masked';
      payload: 'PRIVATE' | 'PUBLIC' | 'UNKNOWN';
      callId?: string;
      channel?: string;
      extension?: string;
    }
  | { type: 'answered'; callId?: string; channel?: string; extension?: string }
  | {
      type: 'end';
      reason?: 'bye' | 'cancel' | 'failed' | 'timeout';
      callId?: string;
      channel?: string;
      extension?: string;
    }
  | { type: 'device-info'; payload: string | null; extension?: string }
  | { type: 'dial-out'; payload: string; callId?: string; extension?: string }
  | { type: 'dial-complete'; callId?: string; extension?: string }
  | { type: 'force-end'; callId?: string; extension?: string }
  | { type: 'on-hook'; callId?: string; extension?: string }
  | { type: 'off-hook'; callId?: string; extension?: string };
