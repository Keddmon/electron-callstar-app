import { app } from 'electron';
import path from 'path';
import { promises as fs } from 'fs';
import { logger } from '../logs';

export type Settings = {
  cid: {
    deviceType?: 'callstar' | 'switch';
    lastPortPath?: string;
    autoReconnect?: boolean;
    switchIp?: string;
    lanCardIndex?: number;
  };
  sip: {
    captureIp?: string;
    filter?: string;
  };
  ipPhone: {
    phoneNumber?: string;
    ipAddress?: string;
    macAddress?: string;
    autoDetect?: boolean;
  };
  app: {
    startOnLogin?: boolean
  };
  window?: {
    width?: number;
    height?: number;
    x?: number;
    y?: number;
  };
};

const DEFAULTS: Settings = {
  cid: {
    deviceType: 'callstar',
    autoReconnect: true,
  },
  sip: {},
  ipPhone: {
    autoDetect: false,
  },
  app: {
    startOnLogin: false,
  },
  window: {
    width: 1200,
    height: 800
  },
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
      logger.warn(`[Settings] load failed, using defaults: `, e);
      this.cache = { ...DEFAULTS };
      await this.save();
    }
  }

  private async save() {
    if (this.saving) await this.saving;
    this.saving = (async () => {
      try {
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });
        await fs.writeFile(this.filePath, JSON.stringify(this.cache, null, 2), 'utf-8');
      } catch (e) {
        logger.error(`[Settings] save failed: `, e);
      }
    })();
    await this.saving;
    this.saving = null;
  }

  get(): Settings { return JSON.parse(JSON.stringify(this.cache)); }

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
      sip: { ...this.cache.sip, ...(p.sip ?? {}) },
      ipPhone: { ...this.cache.ipPhone, ...(p.ipPhone ?? {}) },
      app: { ...this.cache.app, ...(p.app ?? {}) },
      window: { ...this.cache.window, ...(p.window ?? {}) },
    };
    await this.save();
    return this.get();
  }
}

export const settingsStore = new SettingsStore();