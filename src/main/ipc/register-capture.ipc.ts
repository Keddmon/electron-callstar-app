import { ipcMain } from 'electron';
import { Cap } from 'cap';
import os from 'os';

export function registerCaptureIpc() {
  ipcMain.handle('cap:listDevice', async () => {
    try {
      // @ts-ignore
      const list = (Cap as any).deviceList?.() ?? [];
      if (list.length > 0) {
        return list.map((d: any, i: number) => ({
          id: String(i),
          name: d.name,
          description: d.description,
          addresses: d.addresses,
        }));
      }
      const ifs = os.networkInterfaces();
      const arr = Object.entries(ifs || {}).flatMap(([name, addrs]) =>
        (addrs ?? []).map((a) => ({
          id: `${name}:${a.address}`,
          name,
          address: a?.address,
          family: a?.family,
        }))
      );
      return arr;
    } catch (e) {
      return [];
    }
  });
}