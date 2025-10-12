/**
 * CID 설정 저장 및 불러오기 (로컬 저장: settings.json)
 * --
 */

import { app } from 'electron';
import path from 'path';
import { promises as fs } from 'fs';
import { logger } from '../logs';
import { Settings } from '../types/settings.d';
import { deepMerge } from '../utils';

/**
 * 기본 설정
 * --
 */
const DEFAULTS: Settings = {
  cid: {
    deviceType: 'callstar',
  },
  ipPhones: [],
  app: {
    startOnLogin: false,
  },
  window: {
    width: 1200,
    height: 800,
  },
};

class SettingsStore {
  private filePath: string;
  private cache: Settings = DEFAULTS;
  private saving: Promise<void> | null = null;

  constructor(filename = 'settings.json') {
    this.filePath = path.join(app.getPath('userData'), filename);
  }

  /**
   * 초기화 및 불러오기
   * --
   */
  async init() {
    await this.load();
  }

  /**
   * 설정 불러오기
   * --
   */
  private async load() {
    try {
      await fs.access(this.filePath);
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      this.cache = deepMerge(DEFAULTS, parsed);
    } catch (e) {
      logger.warn(`[Settings] load failed, using defaults: `, e);
      this.cache = JSON.parse(JSON.stringify(DEFAULTS));
      await this.save();
    }
  }

  /**
   * 설정 저장
   * --
   */
  private async save() {
    if (this.saving) await this.saving;
    this.saving = (async () => {
      try {
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });
        await fs.writeFile(
          this.filePath,
          JSON.stringify(this.cache, null, 2),
          'utf-8'
        );
      } catch (e) {
        logger.error(`[Settings] save failed: `, e);
      }
    })();
    await this.saving;
    this.saving = null;
  }

  /**
   * 설정 정보 불러오기
   * --
   */
  get(): Settings {
    return JSON.parse(JSON.stringify(this.cache));
  }

  /**
   * 설정하기
   * --
   */
  async set(next: Settings) {
    this.cache = deepMerge(DEFAULTS, next);
    await this.save();
    return this.get();
  }

  /**
   * 설정 새로고침
   * --
   */
  async patch(p: Partial<Settings>) {
    this.cache = deepMerge(this.cache, p);
    await this.save();
    return this.get();
  }
}

export const settingsStore = new SettingsStore();
