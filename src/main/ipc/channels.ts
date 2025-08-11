/**
 * channels.ts
 * ---
 * IPC 채널명 상수
 */
export const IPC = {
    CID: {
        OPEN: 'cid:open',
        CLOSE: 'cid:close',
        STATUS: 'cid:status',
        DIAL: 'cid:dial',
        FORCE_END: 'cid:forceEnd',
        DEVICE_INFO: 'cid:deviceInfo',
        ON_EVENT: 'cid:onEvent',
        LIST_POTS: 'cid:listPorts',
    },
} as const;