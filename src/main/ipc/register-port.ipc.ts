import { ipcMain } from "electron";
import { SerialPort } from "serialport";
import { IPC } from "../constants/ipc.constant";
import { logger } from "../logs";

const LIKELY_CID_IDENTIFIERS = ['cp210x', 'silicon labs'];

export function registerPortIpc() {
    ipcMain.handle(IPC.CID.LIST_PORTS, async () => {
        try {
            const ports = await SerialPort.list();

            return ports.map((p) => {
                const text = `${p.manufacturer ?? ''} ${p.pnpId ?? ''}`.toLowerCase();
                const isLikelyCid = LIKELY_CID_IDENTIFIERS.some((id) =>
                    text.includes(id)
                );

                return {
                    path: p.path,
                    friendlyName: (p as any).friendlyName,
                    isLikelyCid,
                };
            }).sort((a, b) => Number(b.isLikelyCid) - Number(a.isLikelyCid));
        } catch (e: any) {
            logger.error(`[IPC][Port] 포트 목록 조회 실패: ${e.message}`);
            return [];
        }
    });
}