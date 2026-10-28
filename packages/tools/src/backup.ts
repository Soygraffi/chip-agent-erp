import AdmZip from 'adm-zip';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
import { bizError, round2 } from '@erp/shared';
import { currentSchemaVersion } from '@erp/db';
import { APP_VERSION } from './version.js';

export interface BackupManifest {
  appVersion: string;
  schemaVersion: number;
  createdAt: string;
  dbChecksum: string;
}

export interface BackupEntry {
  name: string;
  size: number;
  mtime: string;
}

export function backupTimeTag(d = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

export interface BackupContext {
  db: DatabaseSyncType;
  dataDir: string;
  backupsDir: string;
}

/**
 * 一键备份（PRD 4.5.2 / data-model 五章）：
 * checkpoint 后打包 erp.db + attachments/ + manifest.json → backups\backup_*.zip
 */
export function createBackup(ctx: BackupContext): { fileName: string; path: string; size: number } {
  ctx.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  const dbPath = join(ctx.dataDir, 'erp.db');
  if (!existsSync(dbPath)) throw bizError('IO_ERROR', '数据库文件不存在');
  const dbBuf = readFileSync(dbPath);
  const manifest: BackupManifest = {
    appVersion: APP_VERSION,
    schemaVersion: currentSchemaVersion(ctx.db),
    createdAt: new Date().toISOString(),
    dbChecksum: sha256(dbBuf),
  };
  const now = new Date();
  const base = `backup_${backupTimeTag(now)}_${String(now.getMilliseconds()).padStart(3, '0')}`;
  let fileName = `${base}.zip`;
  mkdirSync(ctx.backupsDir, { recursive: true });
  // 防同秒/同毫秒文件名冲突：冲突时追加序号
  let counter = 2;
  while (existsSync(join(ctx.backupsDir, fileName))) {
    fileName = `${base}_${counter}.zip`;
    counter += 1;
  }
  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
  zip.addFile('erp.db', dbBuf);
  const attDir = join(ctx.dataDir, 'attachments');
  if (existsSync(attDir)) zip.addLocalFolder(attDir, 'attachments');
  const outPath = join(ctx.backupsDir, fileName);
  zip.writeZip(outPath);
  return { fileName, path: outPath, size: statSync(outPath).size };
}

export function listBackups(backupsDir: string): BackupEntry[] {
  if (!existsSync(backupsDir)) return [];
  return readdirSync(backupsDir)
    .filter((f) => f.endsWith('.zip'))
    .map((f) => {
      const s = statSync(join(backupsDir, f));
      return { name: f, size: s.size, mtime: s.mtime.toISOString() };
    })
    .sort((a, b) => b.mtime.localeCompare(a.mtime));
}

/** 校验备份 zip：manifest 完整 + 数据库可打开且 integrity_check 通过 */
export function validateBackup(zipPath: string): BackupManifest {
  let zip: AdmZip;
  try {
    zip = new AdmZip(zipPath);
  } catch {
    throw bizError('BACKUP_INVALID', '无法打开备份文件');
  }
  const manifestEntry = zip.getEntry('manifest.json');
  if (!manifestEntry) throw bizError('BACKUP_INVALID', '缺少 manifest.json');
  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(manifestEntry.getData().toString('utf8')) as BackupManifest;
  } catch {
    throw bizError('BACKUP_INVALID', 'manifest.json 损坏');
  }
  if (!manifest.schemaVersion || !manifest.dbChecksum)
    throw bizError('BACKUP_INVALID', 'manifest 字段不完整');
  const dbEntry = zip.getEntry('erp.db');
  if (!dbEntry) throw bizError('BACKUP_INVALID', '缺少数据库文件');

  const tmp = join(tmpdir(), `erp-validate-${Date.now()}.db`);
  try {
    writeFileSync(tmp, dbEntry.getData());
    const db = new DatabaseSync(tmp, { readOnly: true });
    try {
      const row = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
      if (row.integrity_check !== 'ok') throw bizError('BACKUP_INVALID', '数据库完整性校验失败');
      if (sha256(dbEntry.getData()) !== manifest.dbChecksum)
        throw bizError('BACKUP_INVALID', '数据库校验值不匹配');
    } finally {
      db.close();
    }
  } catch (e) {
    if (e instanceof Error && e.name === 'BizError') throw e;
    throw bizError('BACKUP_INVALID', '数据库文件无法读取');
  } finally {
    rmSync(tmp, { force: true });
  }
  return manifest;
}

export interface RestoreContext extends BackupContext {
  zipPath: string;
}

/**
 * 恢复备份（PRD 4.5.2）：前置自动备份当前数据 → 覆盖 erp.db 与 attachments/。
 * 注意：调用后必须重启应用（调用方负责）；本函数会关闭传入的数据库连接。
 */
export function restoreBackup(ctx: RestoreContext): { preRestorePath: string; manifest: BackupManifest } {
  const manifest = validateBackup(ctx.zipPath);
  // 强制前置备份（PRD 4.5.2：恢复前自动创建一次当前数据备份）
  const pre = createBackup(ctx);
  ctx.db.close();

  const zip = new AdmZip(ctx.zipPath);
  const dbPath = join(ctx.dataDir, 'erp.db');
  rmSync(dbPath, { force: true });
  rmSync(`${dbPath}-wal`, { force: true });
  rmSync(`${dbPath}-shm`, { force: true });
  const attDir = join(ctx.dataDir, 'attachments');
  rmSync(attDir, { recursive: true, force: true });

  const dbEntry = zip.getEntry('erp.db');
  if (!dbEntry) throw bizError('BACKUP_INVALID', '缺少数据库文件');
  writeFileSync(dbPath, dbEntry.getData());
  const attEntries = zip
    .getEntries()
    .filter(
      (e: { entryName: string; isDirectory: boolean }) =>
        e.entryName.startsWith('attachments/') && !e.isDirectory,
    );
  mkdirSync(attDir, { recursive: true });
  for (const e of attEntries) {
    const rel = e.entryName.slice('attachments/'.length);
    const target = join(attDir, rel);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, e.getData());
  }
  return { preRestorePath: pre.path, manifest };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${round2(bytes / 1024)} KB`;
  return `${round2(bytes / 1024 / 1024)} MB`;
}
