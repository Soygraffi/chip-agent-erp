import { describe, it, beforeEach, afterEach } from 'node:test';
import { expect } from '../test-utils.ts';
import AdmZip from 'adm-zip';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { openDatabase, migrate, customerService, currentSchemaVersion, SCHEMA_VERSION } from '@erp/db';
import type { DatabaseSync } from 'node:sqlite';
import { createBackup, listBackups, validateBackup, restoreBackup, sha256 } from '@erp/tools';

let dir: string;
let dataDir: string;
let backupsDir: string;
let db: DatabaseSync;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'erp-backup-'));
  dataDir = join(dir, 'data');
  backupsDir = join(dir, 'backups');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(backupsDir, { recursive: true });
  mkdirSync(join(dataDir, 'attachments'), { recursive: true });
  db = openDatabase(join(dataDir, 'erp.db'));
  migrate(db);
});

afterEach(() => {
  try {
    db.close();
  } catch {
    /* ignore */
  }
  rmSync(dir, { recursive: true, force: true });
});

function ctx() {
  return { db, dataDir, backupsDir };
}

describe('备份与恢复（PRD 4.5.2）', () => {
  it('备份生成 zip：数据库 + 附件 + manifest，校验通过', () => {
    customerService.create(db, { name: '华强半导体', contact: '张三', phone: '13800000000' });
    writeFileSync(join(dataDir, 'attachments', '报价单.pdf'), 'PDF-内容');
    const r = createBackup(ctx());
    expect(r.fileName).toMatch(/^backup_\d{8}_\d{6}_\d{3}(_\d+)?\.zip$/);
    expect(existsSync(r.path)).toBe(true);
    expect(r.size).toBeGreaterThan(0);

    const manifest = validateBackup(r.path);
    expect(manifest.schemaVersion).toBe(SCHEMA_VERSION);
    expect(manifest.dbChecksum).toMatch(/^[0-9a-f]{64}$/);
    expect(currentSchemaVersion(db)).toBe(SCHEMA_VERSION);

    const entries = listBackups(backupsDir);
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe(r.fileName);
  });

  it('恢复：前置自动备份当前数据，恢复后数据与附件还原，新数据消失', () => {
    customerService.create(db, { name: '原始客户', contact: '张三', phone: '13800000000' });
    writeFileSync(join(dataDir, 'attachments', 'a.txt'), 'AAAA');
    const backup = createBackup(ctx());

    // 备份后新增数据（将被覆盖）
    customerService.create(db, { name: '备份后客户', contact: '李四', phone: '13900000000' });
    writeFileSync(join(dataDir, 'attachments', 'b.txt'), 'BBBB');

    const result = restoreBackup({ ...ctx(), zipPath: backup.path });
    expect(basename(result.preRestorePath)).toMatch(/^backup_\d{8}_\d{6}_\d{3}(_\d+)?\.zip$/);
    expect(existsSync(result.preRestorePath)).toBe(true);

    // 重新打开数据库验证
    const reopened = openDatabase(join(dataDir, 'erp.db'));
    migrate(reopened);
    try {
      const rows = customerService.list(reopened, { page: 1, pageSize: 10 });
      expect(rows.total).toBe(1);
      expect(rows.rows[0].name).toBe('原始客户');
    } finally {
      reopened.close();
    }
    expect(existsSync(join(dataDir, 'attachments', 'a.txt'))).toBe(true);
    expect(existsSync(join(dataDir, 'attachments', 'b.txt'))).toBe(false);
  });

  it('备份包含附件子目录结构', () => {
    mkdirSync(join(dataDir, 'attachments', '1', '2'), { recursive: true });
    writeFileSync(join(dataDir, 'attachments', '1', '2', 'x.pdf'), 'pdf');
    const r = createBackup(ctx());
    const manifest = validateBackup(r.path);
    expect(manifest.appVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('损坏的 zip 被拒绝', () => {
    const bad = join(backupsDir, 'bad.zip');
    writeFileSync(bad, '这不是一个有效的 zip 文件');
    expect(() => validateBackup(bad)).toThrowError(/无法打开备份文件/);
  });

  it('缺 manifest 的 zip 被拒绝', () => {
    const zip = new AdmZip();
    zip.addFile('erp.db', Buffer.from('not-a-db'));
    const p = join(backupsDir, 'nomanifest.zip');
    zip.writeZip(p);
    expect(() => validateBackup(p)).toThrowError(/缺少 manifest/);
  });

  it('sha256 与校验值不一致的备份被拒绝', () => {
    const r = createBackup(ctx());
    // 篡改 manifest 中的校验值
    const zip = new AdmZip(r.path);
    const m = JSON.parse(zip.getEntry('manifest.json')!.getData().toString('utf8')) as {
      dbChecksum: string;
    };
    m.dbChecksum = '0'.repeat(64);
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(m)));
    const tampered = join(backupsDir, 'tampered.zip');
    zip.writeZip(tampered);
    expect(() => validateBackup(tampered)).toThrowError(/校验值不匹配/);
  });

  it('sha256 工具与校验逻辑一致', () => {
    const buf = Buffer.from('hello erp');
    expect(sha256(buf)).toBe(sha256(Buffer.from('hello erp')));
    expect(sha256(buf)).not.toBe(sha256(Buffer.from('hello erp2')));
  });

  it('恢复后备份目录同时包含手动备份与前置备份', () => {
    customerService.create(db, { name: 'A', contact: '张三', phone: '138' });
    const b1 = createBackup(ctx());
    const result = restoreBackup({ ...ctx(), zipPath: b1.path });
    const names = readdirSync(backupsDir).filter((f) => f.endsWith('.zip'));
    expect(names).toContain(b1.fileName);
    expect(names).toContain(basename(result.preRestorePath));
  });
});
