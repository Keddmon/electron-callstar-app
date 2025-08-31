import { app } from 'electron';
import * as path from 'path';
import { promises as fs } from 'fs';
import logger from '../logs/logger';

export type Settings = {
    cid: {
        lastPortPath?: string;
        baudRate?: number;          // 기본 19200
        autoReconnect?: boolean;    // 자동 재연결 사용 여부
    };
    ipPhone: {
        phoneNumber?: string;       // 대표 전화번호(화면 표시/저장용)
        ipAddress?: string;         // IP전화기 IP
        macAddress?: string;        // 선택
        autoDetect?: boolean;       // 자동 탐지 시도 여부(옵션)
    };
    app: {
        startOnLogin?: boolean;     // 필요시 사용
    };
    window?: {
        width?: number;
        height?: number;
        x?: number;
        y?: number;
    };
};

const DEFAULTS: Settings = {
    cid: { baudRate: 19200, autoReconnect: true },
    ipPhone: { autoDetect: false },
    app: { startOnLogin: false },
    window: { width: 1200, height: 800 },
};

class SettingsStore {
    private filePath: string;
    private cache: Settings = DEFAULTS;
    private saving: Promise<void> | null = null;

    constructor(filename = 'settings.json') {
        this.filePath = path.join(app.getPath('userData'), filename);
    }

    async init() {
        await this.load();
    }

    private async load() {
        try {
            await fs.access(this.filePath);
            const raw = await fs.readFile(this.filePath, 'utf-8');
            const parsed = JSON.parse(raw);
            this.cache = { ...DEFAULTS, ...parsed };
        } catch (e) {
            logger.error('[settings] load failed, using defaults:', e);
            this.cache = { ...DEFAULTS };
            await this.save();
        }
    }

    private async save() {
        if (this.saving) {
            await this.saving;
        }

        const savePromise = (async () => {
            try {
                await fs.mkdir(path.dirname(this.filePath), { recursive: true });
                await fs.writeFile(this.filePath, JSON.stringify(this.cache, null, 2), 'utf-8');
            } catch (e) {
                logger.error('[settings] save failed:', e);
            }
        })();

        this.saving = savePromise;
        await savePromise;
        this.saving = null;
    }

    get(): Settings {
        return JSON.parse(JSON.stringify(this.cache));
    }

    async set(next: Settings) {
        this.cache = { ...DEFAULTS, ...next };
        await this.save();
        return this.get();
    }

    async patch(p: Partial<Settings>) {
        this.cache = {
            ...this.cache,
            ...p,
            cid: { ...this.cache.cid, ...(p.cid ?? {}) },
            ipPhone: { ...this.cache.ipPhone, ...(p.ipPhone ?? {}) },
            app: { ...this.cache.app, ...(p.app ?? {}) },
            window: { ...this.cache.window, ...(p.window ?? {}) },
        };
        await this.save();
        return this.get();
    }
}

export const settingsStore = new SettingsStore();
