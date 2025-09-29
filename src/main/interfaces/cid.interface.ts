import { EventEmitter } from 'events';
export interface CidStatus {
  isOpen: boolean;
  portPath?: string;
  device?: string;
}

export interface CidAdapter extends EventEmitter {
  open(options?: any): Promise<void> | void;
  close(): void;
  getStatus(): CidStatus;
  listPorts?(): Promise<any[]>;
}