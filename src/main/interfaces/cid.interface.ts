import { EventEmitter } from 'events';
import { CidPortInfo } from '../types/cid';
export interface CidStatus {
  isOpen: boolean;
  callstarPort?: string;
  deviceName?: string;
  deviceType?: 'callstar' | 'switch' | undefined;
}

export interface CidAdapter extends EventEmitter {
  open(opts?: any): Promise<void> | void;
  close(): void;
  getStatus(): CidStatus;
  listPorts?(): Promise<CidPortInfo[]>;

  // TEST
  incoming(payload: string): void;
}
