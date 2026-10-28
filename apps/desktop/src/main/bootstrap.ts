import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { migrate, openDatabase } from '@erp/db';

export interface AppContext {
  db: DatabaseSync;
  dataDir: string;
  attachmentsDir: string;
  backupsDir: string;
  configPath: string;
}

export const APP_DIR_NAME = 'ChipAgentERP';

/** 默认用户数据目录：%APPDATA%\ChipAgentERP（PRD 4.6.4） */
export function defaultUserDataDir(): string {
  const base = process.env['APPDATA'] || join(homedir(), 'AppData', 'Roaming');
  return join(base, APP_DIR_NAME);
}

/**
 * 应用初始化（不依赖 electron，可在 ELECTRON_RUN_AS_NODE 下冒烟测试）
 * 数据目录解析顺序：参数 > config.json 中的 dataDir > {userDataDir}\data
 */
export function initApp(userDataDir: string, dataDirOverride?: string): AppContext {
  const configPath = join(userDataDir, 'config.json');
  let dataDir = dataDirOverride;
  if (!dataDir) {
    try {
      const cfg = JSON.parse(readFileSync(configPath, 'utf8')) as { dataDir?: string };
      if (cfg.dataDir && typeof cfg.dataDir === 'string' && cfg.dataDir.trim() !== '')
        dataDir = cfg.dataDir;
    } catch {
      /* 无配置则用默认 */
    }
  }
  dataDir = dataDir || join(userDataDir, 'data');
  const attachmentsDir = join(dataDir, 'attachments');
  const backupsDir = join(dataDir, 'backups');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(attachmentsDir, { recursive: true });
  mkdirSync(backupsDir, { recursive: true });
  const db = openDatabase(join(dataDir, 'erp.db'));
  migrate(db);
  return { db, dataDir, attachmentsDir, backupsDir, configPath };
}

/** 修改数据目录后持久化配置（PRD 4.6.4：旧目录保留，仅切换指向） */
export function saveDataDirConfig(configPath: string, dataDir: string): void {
  writeFileSync(configPath, JSON.stringify({ dataDir }, null, 2), 'utf8');
}

export function readDataDirConfig(configPath: string): string | null {
  try {
    const cfg = JSON.parse(readFileSync(configPath, 'utf8')) as { dataDir?: string };
    return cfg.dataDir && typeof cfg.dataDir === 'string' ? cfg.dataDir : null;
  } catch {
    return null;
  }
}
