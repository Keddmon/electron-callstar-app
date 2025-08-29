/**
 * IPC 채널 상수 정의
 * --
 */
export const IPC = {
    CID: {
        /** CID 기기 연결 및 상태 채널 */
        OPEN: 'cid:open',
        CLOSE: 'cid:close',
        STATUS: 'cid:status',

        LIST_PORTS: 'cid:listPorts',

        /** CID 프로토콜 채널 */
        DEVICE_INFO: 'cid:deviceInfo',

        INCOMING: 'cid:incoming',

        DIAL_OUT: 'cid:dialOut',
        DIAL_COMPLETE: 'cid:dialComplete',
        FORCE_END: 'cid:forceEnd',

        ON_HOOK: 'cid:onHook',
        OFF_HOOK: 'cid:offHook',
        
        EVENT: 'cid:event',
    },
} as const;