/**
 * IPC 채널 상수 정의
 * --
 */
export const IPC = {
    /** CID 프로토콜 관련 */
    CID: {
        // CID 기기 연결 및 상태 채널
        OPEN: 'cid:open',
        CLOSE: 'cid:close',
        STATUS: 'cid:status',

        LIST_PORTS: 'cid:listPorts',

        // CID 프로토콜 채널
        DEVICE_INFO: 'cid:deviceInfo',

        INCOMING: 'cid:incoming',

        DIAL_OUT: 'cid:dialOut',
        DIAL_COMPLETE: 'cid:dialComplete',
        FORCE_END: 'cid:forceEnd',

        OFF_HOOK: 'cid:offHook',
        ON_HOOK: 'cid:onHook',

        // CID 이벤트
        EVENT: 'cid:event',

        // CID 자동 재연결
        SET_AR: 'cid:autoReconnect:set',
        GET_AR: 'cid:autoReconnect:get',
    },
    /** 포트(CID) 정보 로컬 저장 */
    SETTINGS: {
        GET: 'settings:get',
        SET: 'settings:set',
        PATCH: 'settings:patch',
    },
    /** NIC 목록/ARP 테이블 */
    NET: {
        LIST_INTERFACES: 'net:listInterfaces',
        ARP_TABLE: 'net:arpTable',
    },
} as const;