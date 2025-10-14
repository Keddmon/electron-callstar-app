// // src/types/cap.d.ts
// declare module 'cap' {
//   // device list entry (기본적인 형태만 선언)
//   export interface CapDeviceAddress {
//     addr?: string;
//     netmask?: string;
//     broadaddr?: string;
//     addrType?: string;
//   }

//   export interface CapDevice {
//     name?: string;
//     description?: string;
//     addresses?: CapDeviceAddress[];
//   }

//   export class Cap {
//     constructor();
//     open(
//       device: string,
//       filter: string,
//       bufSize: number,
//       buffer: Buffer
//     ): string;
//     setMinBytes?: (n: number) => void;
//     close(): void;
//     on(
//       event: 'packet',
//       listener: (buffer: Buffer, linkType: string) => void
//     ): this;
//     removeListener(event: string, listener: (...args: any[]) => void): this;

//     static findDevice(ipOrDev: string): string | undefined;
//     static deviceList(): CapDevice[];
//   }

//   export function findDevice(ipOrDev: string): string | undefined;
//   export function deviceList(): CapDevice[];

//   export const decoders: {
//     PROTOCOL: {
//       ETHERNET: {
//         IPV4: number;
//       };
//     };
//     Ethernet: (buffer: Buffer) => any;
//   };

//   const _default: {
//     Cap: typeof Cap;
//     findDevice: typeof Cap.findDevice;
//     deviceList: typeof Cap.deviceList;
//     decoders: typeof decoders;
//   };
//   export default _default;
// }
