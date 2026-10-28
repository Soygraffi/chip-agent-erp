import type { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from './migrations.js';

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

/** schema_version 驱动的迁移器：顺序执行未应用脚本，整体事务，失败回滚 */
export function migrate(db: DatabaseSync): void {
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT)',
  );
  db.exec('BEGIN');
  try {
    const row = db
      .prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'")
      .get() as { value?: string } | undefined;
    let current = Number(row?.value ?? 0);
    for (const m of MIGRATIONS) {
      if (m.version <= current) continue;
      db.exec(m.sql);
      db.prepare(
        "INSERT INTO schema_meta (key, value) VALUES ('schema_version', ?) " +
          'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      ).run(String(m.version));
    }
    db.exec('COMMIT');
  } catch (e) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  }
}

export function currentSchemaVersion(db: DatabaseSync): number {
  const row = db
    .prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'")
    .get() as { value?: string } | undefined;
  return Number(row?.value ?? 0);
}
