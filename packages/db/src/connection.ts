import { DatabaseSync } from 'node:sqlite';

/**
 * 打开数据库连接（node:sqlite 内置模块，Node ≥22.13 / Electron ≥36 均可用）
 * 替代 better-sqlite3（本机无 VS Build Tools，无法编译原生模块）——见 docs/ADR-001
 */
export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');
  return db;
}

/** 事务包装：回调抛错即回滚 */
export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  }
}
