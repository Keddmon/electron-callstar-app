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
  /**
   * CID 장치 관련 설정
   */
  cid: {
    deviceType: 'callstar' | 'switch';
    autoReconnect?: boolean;
    // Callstar 장치 설정
    callstarPort?: string;
    // Switch 장치 설정
    switchCaptureDevice?: string;
  };

  /**
   * Switch CID 모드에서 사용할 IP 전화기 목록
   */
  ipPhones: IpPhone[];

  /**
   * 애플리케이션 관련 설정
   */
  app: {
    startOnLogin?: boolean;
  };

  /**
   * 윈도우 상태 저장
   */
  window?: {
    width?: number;
    height?: number;
    x?: number;
    y?: number;
  };
}
