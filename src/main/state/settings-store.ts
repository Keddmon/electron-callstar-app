import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
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
};

const DEFAULTS: Settings = {
    cid: { baudRate: 19200, autoReconnect: true },
    ipPhone: { autoDetect: false },
    app: { startOnLogin: false },
};

export class SettingsStore {
    private filePath: string;
    private cache: Settings = DEFAULTS;

    constructor(filename = 'settings.json') {
        this.filePath = path.join(app.getPath('userData'), filename);
        this.load();
    }

    private load() {
        try {
            if (fs.existsSync(this.filePath)) {
                const raw = fs.readFileSync(this.filePath, 'utf-8');
                const parsed = JSON.parse(raw);
                this.cache = { ...DEFAULTS, ...parsed };
            } else {
                this.save();
            }
        } catch (e) {
            logger.error('[settings] load failed: ', e);
            this.cache = { ...DEFAULTS };
            this.save();
        }
    }

    private save() {
        try {
            fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
            fs.writeFileSync(this.filePath, JSON.stringify(this.cache, null, 2), 'utf-8');
        } catch (e) {
            logger.error('[settings] save failed: ', e);
        }
    }

    get(): Settings {
        return JSON.parse(JSON.stringify(this.cache));
    }

    set(next: Settings) {
        this.cache = { ...DEFAULTS, ...next };
        this.save();
        return this.get();
    }

    patch(p: Partial<Settings>) {
        this.cache = {
            ...this.cache,
            ...p,
            cid: { ...this.cache.cid, ...(p.cid ?? {}) },
            ipPhone: { ...this.cache.ipPhone, ...(p.ipPhone ?? {}) },
            app: { ...this.cache.app, ...(p.app ?? {}) },
        };
        this.save();
        return this.get();
    }
}

export const settingsStore = new SettingsStore();