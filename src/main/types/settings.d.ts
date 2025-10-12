/**
 * Switch CID 설정을 위한 개별 인터넷 전화기 정보
 */
export interface IpPhone {
  ipAddress: string;
  extension: string;
  description?: string;
  macAddress?: string;
}

export interface Settings {
  cid: {
    cidType: 'callstar' | 'switch' | undefined;
    callstarPort?: string;
    captureDevice?: string;
  };

  ipPhones: IpPhone[];

  window?: {
    width?: number;
    height?: number;
    x?: number;
    y?: number;
  };
}
