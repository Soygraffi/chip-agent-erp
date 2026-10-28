import { describe, it } from 'node:test';
import { expect } from '../test-utils.ts';
import { migrate, SCHEMA_VERSION, currentSchemaVersion } from '@erp/db';
import { createTestDb } from './helpers.ts';

describe('数据库迁移与种子', () => {
  it('迁移后 schema_version 为最新版本', () => {
    const db = createTestDb();
    expect(currentSchemaVersion(db)).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(2);
  });

  it('迁移幂等：重复执行不报错、种子不重复', () => {
    const db = createTestDb();
    migrate(db); // 第二次执行
    const statuses = db.prepare('SELECT COUNT(*) AS c FROM order_status').get() as { c: number };
    const templates = db.prepare('SELECT COUNT(*) AS c FROM node_template').get() as { c: number };
    expect(statuses.c).toBe(5);
    expect(templates.c).toBe(10);
  });

  it('全部 12 张表存在', () => {
    const db = createTestDb();
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];
    const names = rows.map((r) => r.name).sort();
    expect(names).toEqual(
      [
        'currency_rate',
        'customer',
        'dict_item',
        'node_attachment',
        'node_follow_up',
        'node_template',
        'order_item',
        'order_node',
        'order_status',
        'orders',
        'schema_meta',
        'setting',
      ].sort(),
    );
  });

  it('种子数据：5 个内置状态语义正确（终态/结果/默认完成）', () => {
    const db = createTestDb();
    const rows = db
      .prepare(
        'SELECT name, is_terminal AS t, terminal_result AS r, is_default_completed AS d FROM order_status ORDER BY sort_order',
      )
      .all() as { name: string; t: number; r: string | null; d: number }[];
    expect(rows).toEqual([
      { name: '待确认', t: 0, r: null, d: 0 },
      { name: '进行中', t: 0, r: null, d: 0 },
      { name: '已发货', t: 0, r: null, d: 0 },
      { name: '已完结', t: 1, r: 'completed', d: 1 },
      { name: '已取消', t: 1, r: 'cancelled', d: 0 },
    ]);
  });

  it('种子数据：10 个节点模板带语义码、顺序正确', () => {
    const db = createTestDb();
    const rows = db
      .prepare('SELECT name, code, sort_order AS s FROM node_template ORDER BY sort_order')
      .all() as { name: string; code: string; s: number }[];
    expect(rows.map((r) => r.code)).toEqual([
      'demand',
      'quote',
      'confirm',
      'purchase',
      'stock',
      'arrival',
      'ship',
      'sign',
      'invoice',
      'payment',
    ]);
    expect(rows[5].name).toBe('到货入库');
    expect(rows[6].name).toBe('发货中');
  });

  it('种子数据：币种与汇率、编号规则默认设置', () => {
    const db = createTestDb();
    const rates = db
      .prepare(
        "SELECT d.name, cr.rate FROM currency_rate cr JOIN dict_item d ON d.id = cr.currency_id WHERE d.category='currency' ORDER BY d.sort_order",
      )
      .all() as { name: string; rate: number }[];
    expect(rates).toEqual([
      { name: '人民币 CNY', rate: 1 },
      { name: '美元 USD', rate: 7.2 },
    ]);
    const s = db.prepare('SELECT value FROM setting WHERE key = ?').get('order_no_prefix') as {
      value: string;
    };
    expect(s.value).toBe('XS');
  });
});
