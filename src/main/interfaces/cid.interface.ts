import { EventEmitter } from 'events';
export interface CidStatus {
  isOpen: boolean;
  cidType?: 'callstar' | 'switch' | undefined;
  callstarPort?: string;
  captureDevice?: string;
}

export interface CidAdapter extends EventEmitter {
  open(opts?: any): Promise<void> | void;
  close(): void;
  getStatus(): CidStatus;

  // TEST
  incoming(payload: string): void;
}
