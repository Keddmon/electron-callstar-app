import * as os from 'os';
import { exec } from 'child_process';

export type NetIf = {
    name: string;
    address: string;
    netmask: string;
    family: string;        // IPv4/IPv6
    mac: string;
    internal: boolean;
};

export type ArpEntry = {
    ip: string;
    mac: string;
    type?: string; // windows에서 'dynamic/static' 등
};

export function listInterfaces(): NetIf[] {
    const result: NetIf[] = [];
    const nics = os.networkInterfaces();
    for (const [name, addrs] of Object.entries(nics)) {
        if (!addrs) continue;
        for (const a of addrs) {
            result.push({
                name,
                address: a.address,
                netmask: a.netmask,
                family: a.family,
                mac: a.mac,
                internal: a.internal,
            });
        }
    }
    return result;
}

export function getArpTable(): Promise<ArpEntry[]> {
    return new Promise((resolve) => {
        const isWin = process.platform === 'win32';
        const cmd = isWin ? 'arp -a' : 'arp -a';

        exec(cmd, { windowsHide: true }, (err, stdout) => {
            if (err) {
                console.error('[net] arp failed', err);
                return resolve([]);
            }
            const lines = (stdout || '').split('\n').map(s => s.trim()).filter(Boolean);
            const arr: ArpEntry[] = [];
            for (const line of lines) {
                // windows 예)  192.168.0.10       00-15-65-xx-xx-xx     동적
                // unix   예)  ? (192.168.0.10) at 00:15:65:xx:xx:xx on en0 ifscope [ethernet]
                if (isWin) {
                    const m = line.match(/^(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F:-]{11,})\s+(.+)$/);
                    if (m) {
                        arr.push({ ip: m[1], mac: m[2].replace(/-/g, ':'), type: m[3] });
                    }
                } else {
                    const m = line.match(/\((\d+\.\d+\.\d+\.\d+)\)\s+at\s+([0-9a-fA-F:]{11,})/);
                    if (m) {
                        arr.push({ ip: m[1], mac: m[2] });
                    }
                }
            }
            resolve(arr);
        });
    });
}