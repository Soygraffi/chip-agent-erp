import { describe, it } from 'node:test';
import { expect } from '../test-utils.ts';
import { migrate, SCHEMA_VERSION, currentSchemaVersion, MIGRATIONS, openDatabase } from '@erp/db';
import { createTestDb } from './helpers.ts';

describe('数据库迁移与种子', () => {
  it('迁移后 schema_version 为最新版本', () => {
    const db = createTestDb();
    expect(currentSchemaVersion(db)).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(10);
  });

  it('迁移幂等：重复执行不报错、种子不重复', () => {
    const db = createTestDb();
    migrate(db); // 第二次执行
    const statuses = db.prepare('SELECT COUNT(*) AS c FROM order_status').get() as { c: number };
    const templates = db.prepare('SELECT COUNT(*) AS c FROM node_template').get() as { c: number };
    expect(statuses.c).toBe(5);
    expect(templates.c).toBe(10);
  });

  it('全部 18 张表存在', () => {
    const db = createTestDb();
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];
    const names = rows.map((r) => r.name).sort();
    expect(names).toEqual(
      [
        'currency_rate',
        'customer',
        'customer_wechat_group',
        'dict_item',
        'material',
        'supplier',
        'node_attachment',
        'node_follow_up',
        'node_template',
        'order_attachment',
        'order_item',
        'order_node',
        'order_status',
        'order_wechat_group',
        'orders',
        'schema_meta',
        'setting',
        'wechat_member',
      ].sort(),
    );
  });

  it('V1.2 迁移：旧库数据保留、客户联系方式字段被移除、订单日期/状态可空', () => {
    // 只执行 v1/v2，模拟旧版数据库
    const db = openDatabase(':memory:');
    db.exec('CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT)');
    for (const m of MIGRATIONS.filter((x) => x.version <= 2)) {
      db.exec(m.sql);
      db.prepare(
        "INSERT INTO schema_meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      ).run(String(m.version));
    }
    db.prepare(
      "INSERT INTO customer (name, name_norm, contact, phone, is_key) VALUES ('旧客户', '旧客户', '张三', '138', 1)",
    ).run();
    db.prepare(
      "INSERT INTO orders (order_no, customer_id, order_date, status_id, total_amount) VALUES ('OLD-1', 1, '2026-01-02', 1, 88)",
    ).run();
    db.prepare(
      "INSERT INTO order_node (order_id, name, status, owner) VALUES (1, '旧节点', 'pending', '老王')",
    ).run();

    migrate(db); // 执行 v3

    const cust = db.prepare('SELECT name, is_key FROM customer').get() as { name: string; is_key: number };
    expect(cust.name).toBe('旧客户');
    expect(cust.is_key).toBe(1);
    const order = db.prepare('SELECT order_no, order_date, total_amount FROM orders').get() as {
      order_no: string;
      order_date: string;
      total_amount: number;
    };
    expect(order).toEqual({ order_no: 'OLD-1', order_date: '2026-01-02', total_amount: 88 });
    // 新字段允许为空
    db.prepare(
      "INSERT INTO orders (order_no, customer_id) VALUES ('NULLABLE-1', 1)",
    ).run();
    const nullable = db.prepare("SELECT order_date, status_id FROM orders WHERE order_no = 'NULLABLE-1'").get() as {
      order_date: string | null;
      status_id: number | null;
    };
    expect(nullable.order_date).toBeNull();
    expect(nullable.status_id).toBeNull();
    // 旧字段列已不存在（contact 在 V1.5 作为可选联系人重新加入）
    const cols = db.prepare("SELECT name FROM pragma_table_info('customer')").all() as { name: string }[];
    expect(cols.some((c) => c.name === 'phone')).toBe(false);
    expect(cols.some((c) => c.name === 'email')).toBe(false);
    db.close();
  });

  it('V1.3 迁移：物料表、明细价格口径字段、客户 logo 列', () => {
    const db = createTestDb();
    const materialCols = (db.prepare("SELECT name FROM pragma_table_info('material')").all() as { name: string }[]).map(
      (c) => c.name,
    );
    for (const c of ['code', 'code_norm', 'name', 'spec', 'brand', 'purchase_price', 'sale_price', 'price_tax_included', 'tax_rate', 'is_active']) {
      expect(materialCols).toContain(c);
    }
    const itemCols = (db.prepare("SELECT name FROM pragma_table_info('order_item')").all() as { name: string }[]).map(
      (c) => c.name,
    );
    for (const c of ['material_id', 'material_code', 'material_name', 'purchase_price', 'price_tax_included', 'tax_rate']) {
      expect(itemCols).toContain(c);
    }
    const custCols = (db.prepare("SELECT name FROM pragma_table_info('customer')").all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(custCols).toContain('logo_path');
    // 设置里有报价单抬头默认值（V1.7.2 起内置公司名称）
    const setting = db.prepare("SELECT value FROM setting WHERE key = 'company_name'").get() as { value: string };
    expect(setting.value).toBe('湖北长江光电子信息产业供应链有限公司');
    db.close();
  });

  it('V1.5 迁移：客户联系人、群成员任职公司', () => {
    const db = createTestDb();
    const custCols = (db.prepare("SELECT name FROM pragma_table_info('customer')").all() as { name: string }[]).map((c) => c.name);
    expect(custCols).toContain('contact');
    const memberCols = (db.prepare("SELECT name FROM pragma_table_info('wechat_member')").all() as { name: string }[]).map((c) => c.name);
    expect(memberCols).toContain('company');
    db.close();
  });

  it('V1.6.5 迁移：节点模板改名为「供应商备货」（含已有订单节点）', () => {
    const db = openDatabase(':memory:');
    db.exec('CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT)');
    for (const m of MIGRATIONS.filter((x) => x.version <= 8)) {
      db.exec(m.sql);
      db.prepare(
        "INSERT INTO schema_meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      ).run(String(m.version));
    }
    db.prepare("UPDATE node_template SET name = '供应商备货/排产' WHERE code = 'stock'").run();
    db.prepare("INSERT INTO customer (name, name_norm) VALUES ('客户', '客户')").run();
    db.prepare("INSERT INTO orders (order_no, customer_id, status_id) VALUES ('R-1', 1, 1)").run();
    db.prepare(
      "INSERT INTO order_node (order_id, name, status) VALUES (1, '供应商备货/排产', 'pending')",
    ).run();
    migrate(db);
    const t = db.prepare("SELECT name FROM node_template WHERE code = 'stock'").get() as { name: string };
    expect(t.name).toBe('供应商备货');
    const n = db.prepare("SELECT name FROM order_node WHERE order_id = 1").get() as { name: string };
    expect(n.name).toBe('供应商备货');
    db.close();
  });

  it('V1.6.1 迁移：历史订单明细回填物料库', () => {
    const db = openDatabase(':memory:');
    db.exec('CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT)');
    for (const m of MIGRATIONS.filter((x) => x.version <= 7)) {
      db.exec(m.sql);
      db.prepare(
        "INSERT INTO schema_meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      ).run(String(m.version));
    }
    db.prepare("INSERT INTO customer (name, name_norm) VALUES ('旧客户', '旧客户')").run();
    db.prepare(
      "INSERT INTO orders (order_no, customer_id, status_id) VALUES ('OLD-1', 1, 1)",
    ).run();
    db.prepare(
      "INSERT INTO order_item (order_id, chip_model, brand, qty, unit_price, subtotal) VALUES (1, 'GD32F407ZGT6', '兆易创新', 5, 29.24, 146.2)",
    ).run();
    migrate(db);
    const material = db.prepare("SELECT name, spec, brand FROM material WHERE code_norm = 'gd32f407zgt6'").get() as
      | { name: string; spec: string; brand: string }
      | undefined;
    expect(material?.name).toBe('GD32F407ZGT6');
    expect(material?.brand).toBe('兆易创新');
    const item = db.prepare("SELECT material_id, material_code FROM order_item WHERE id = 1").get() as {
      material_id: number | null;
      material_code: string | null;
    };
    expect(typeof item.material_id).toBe('number');
    expect(item.material_code).toBe('GD32F407ZGT6');
    db.close();
  });

  it('V1.6 迁移：供应商表、物料供应商列、菜单顺序设置', () => {
    const db = createTestDb();
    expect(!!db.prepare("SELECT name FROM sqlite_master WHERE name='supplier'").get()).toBe(true);
    expect(
      (db.prepare("SELECT name FROM pragma_table_info('material')").all() as { name: string }[]).some(
        (c) => c.name === 'supplier_id',
      ),
    ).toBe(true);
    const menu = db.prepare("SELECT value FROM setting WHERE key='menu_order'").get() as { value: string };
    expect(menu.value).toBe('');
    db.close();
  });

  it('V1.4 迁移：客户排序字段、进货价独立含税标记', () => {
    const db = createTestDb();
    const custCols = (db.prepare("SELECT name FROM pragma_table_info('customer')").all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(custCols).toContain('sort_order');
    expect(
      (db.prepare("SELECT name FROM pragma_table_info('material')").all() as { name: string }[]).some(
        (c) => c.name === 'purchase_tax_included',
      ),
    ).toBe(true);
    expect(
      (db.prepare("SELECT name FROM pragma_table_info('order_item')").all() as { name: string }[]).some(
        (c) => c.name === 'purchase_tax_included',
      ),
    ).toBe(true);
    db.close();
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
