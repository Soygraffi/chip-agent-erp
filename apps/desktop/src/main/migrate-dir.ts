import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { openDatabase, migrate, currentSchemaVersion } from '@erp/db';
import { initApp, saveDataDirConfig, type AppContext } from './bootstrap';
import { bizError } from '@erp/shared';

/**
 * 数据目录迁移（PRD 4.6.4）：暂停写入 → 复制整目录 → 校验 → 切换连接 → 旧目录保留
 */
export function migrateDataDir(ctxRef: { ctx: AppContext }, newDir: string): AppContext {
  const old = ctxRef.ctx;
  const target = resolve(newDir);
  if (target === resolve(old.dataDir)) return old;

  // 1. checkpoint 并复制数据库
  old.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  mkdirSync(target, { recursive: true });
  const dbName = 'erp.db';
  copyFileSync(join(old.dataDir, dbName), join(target, dbName));
  for (const suffix of ['-wal', '-shm']) {
    const p = join(old.dataDir, dbName + suffix);
    if (existsSync(p)) copyFileSync(p, join(target, dbName + suffix));
  }
  // 2. 复制附件目录
  const oldAtt = join(old.dataDir, 'attachments');
  if (existsSync(oldAtt)) cpSync(oldAtt, join(target, 'attachments'), { recursive: true });
  else mkdirSync(join(target, 'attachments'), { recursive: true });
  mkdirSync(join(target, 'backups'), { recursive: true });

  // 3. 校验新库完整性
  const verify = openDatabase(join(target, dbName));
  try {
    const row = verify.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    if (row.integrity_check !== 'ok') {
      verify.close();
      throw bizError('IO_ERROR', '新数据目录的数据库校验失败，已保留原目录');
    }
    migrate(verify);
  } finally {
    try {
      verify.close();
    } catch {
      /* ignore */
    }
  }

  // 4. 切换连接（旧目录保留作回退）
  old.db.close();
  const db = openDatabase(join(target, dbName));
  migrate(db);
  const next: AppContext = {
    db,
    dataDir: target,
    attachmentsDir: join(target, 'attachments'),
    backupsDir: join(target, 'backups'),
    configPath: old.configPath,
  };
  ctxRef.ctx = next;
  saveDataDirConfig(old.configPath, target);
  return next;
}

/** 备份默认目录：设置 backup_dir 为空时用 <数据目录>\backups（PRD 4.6.4） */
export function effectiveBackupsDir(ctx: AppContext): string {
  const configured = ctx.db
    .prepare("SELECT value FROM setting WHERE key = 'backup_dir'")
    .get() as { value: string } | undefined;
  if (configured && configured.value && configured.value.trim() !== '') {
    const dir = configured.value.trim();
    mkdirSync(dir, { recursive: true });
    return dir;
  }
  return ctx.backupsDir;
}

export function dataDirSize(dir: string): number {
  let total = 0;
  const walk = (d: string): void => {
    for (const e of statSyncSafe(d)) {
      const p = join(d, e);
      try {
        const s = statSync(p);
        if (s.isDirectory()) walk(p);
        else total += s.size;
      } catch {
        /* ignore */
      }
    }
  };
  if (existsSync(dir)) walk(dir);
  return total;
}

import { readdirSync } from 'node:fs';
function statSyncSafe(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

export function removeFile(path: string): void {
  rmSync(path, { force: true });
}

export function writeBuffer(path: string, buf: Buffer): void {
  writeFileSync(path, buf);
}

export { currentSchemaVersion };
