/**
 * IPC 채널명 상수
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

        OFF_HOOK: 'cid:offHook',
        ON_HOOK: 'cid:onHook',

        EVENT: 'cid:event',

        /** 재연결 채널 */
        SET_AR: 'cid:autoReconnect:set',
        GET_AR: 'cid:autoReconnect:get',
    },
    SETTINGS: {
        GET: 'settings:get',
        SET: 'settings:set',
        PATCH: 'settings:patch',
    },
    NET: {
        LIST_INTERFACES: 'net:listInterfaces',
        ARP_TABLE: 'net:arpTable',
    },
} as const;