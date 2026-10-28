import type { DatabaseSync } from 'node:sqlite';
import type { OrderNoDateFormat } from '@erp/shared';

export function getSetting(db: DatabaseSync, key: string): string | null {
  const r = db.prepare('SELECT value FROM setting WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return r ? r.value : null;
}

export function setSetting(db: DatabaseSync, key: string, value: string): void {
  db.prepare(
    'INSERT INTO setting (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, value);
}

export function getAllSettings(db: DatabaseSync): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM setting').all() as {
    key: string;
    value: string;
  }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export interface OrderNoConfig {
  prefix: string;
  dateFormat: OrderNoDateFormat;
  seqWidth: number;
}

/** 读取编号规则配置（带默认值与合法性兜底，PRD 4.6.2） */
export function getOrderNoConfig(db: DatabaseSync): OrderNoConfig {
  const prefix = getSetting(db, 'order_no_prefix') || 'XS';
  const fmt = getSetting(db, 'order_no_date_format') || 'YYYYMMDD';
  const width = Number(getSetting(db, 'order_no_seq_width') || '4');
  const dateFormat: OrderNoDateFormat =
    fmt === 'YYMMDD' || fmt === 'YYYY-MM-DD' ? fmt : 'YYYYMMDD';
  const seqWidth = Math.min(6, Math.max(2, Number.isFinite(width) ? width : 4));
  return { prefix, dateFormat, seqWidth };
}
