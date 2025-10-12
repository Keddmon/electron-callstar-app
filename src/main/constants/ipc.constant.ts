/**
 * IPC 채널 상수 정의
 * --
 */
export const IPC = {
  CID: {
    OPEN: 'cid:open',
    CLOSE: 'cid:close',
    STATUS: 'cid:status',
    EVENT: 'cid:event',
    SWITCH_CID: 'cid:switchCid',
    LIST_PORTS: 'cid:listPorts',
    LIST_SWITCHES: 'cid:listSwitches',
    INCOMING: 'cid:incoming',
  },
  SETTINGS: {
    GET: 'settings:get',
    SET: 'settings:set',
    PATCH: 'settings:patch',
  },
  NAV: {
    STATE: 'nav:state',
  },
} as const;
