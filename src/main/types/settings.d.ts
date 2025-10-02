type Settings = {
  cid: {
    deviceType?: 'callstar' | 'switch';
    lastPortPath?: string;
    autoReconnect?: boolean;
    switchIp?: string;
    lanCardIndex?: number;
  };
  sip: {
    captureIp?: string;
    filter?: string;
  };
  ipPhone: {
    phoneNumber?: string;
    ipAddress?: string;
    macAddress?: string;
    autoDetect?: boolean;
  };
  app: {
    startOnLogin?: boolean
  };
  window?: {
    width?: number;
    height?: number;
    x?: number;
    y?: number;
  };
};

export {
  Settings,
};