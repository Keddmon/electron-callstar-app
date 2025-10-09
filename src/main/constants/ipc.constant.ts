/**
 * IPC 채널 상수 정의
 * --
 */
export const IPC = {
  CID: {
    OPEN: 'cid:open',
    CLOSE: 'cid:close',
    STATUS: 'cid:status',
    LIST_PORTS: 'cid:listPorts',
    EVENT: 'cid:event',
    INCOMING: 'cid:incoming',
  },
  CAPTURE: {
    LIST_DEVICES: 'capture:listDevices',
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