import type { DatabaseSync } from 'node:sqlite';
import { migrate, openDatabase } from '@erp/db';

/** 内存测试库：迁移 + 种子就绪 */
export function createTestDb(): DatabaseSync {
  const db = openDatabase(':memory:');
  migrate(db);
  return db;
}

export function statusByName(db: DatabaseSync, name: string): number {
  const r = db.prepare('SELECT id FROM order_status WHERE name = ?').get(name) as { id: number };
  return r.id;
}

export function dictIdByName(
  db: DatabaseSync,
  category: string,
  name: string,
): number {
  const r = db
    .prepare('SELECT id FROM dict_item WHERE category = ? AND name = ?')
    .get(category, name) as { id: number };
  return r.id;
}

export function templateIdByCode(db: DatabaseSync, code: string): number {
  const r = db.prepare('SELECT id FROM node_template WHERE code = ?').get(code) as { id: number };
  return r.id;
}

export interface CustomerSeed {
  name?: string;
  typeId?: number | null;
  isKey?: boolean;
  deletedAt?: string | null;
}

export function seedCustomer(db: DatabaseSync, s: CustomerSeed = {}): number {
  const name = s.name ?? '华强半导体';
  const r = db
    .prepare(
      'INSERT INTO customer (name, name_norm, type_id, is_key, deleted_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(
      name,
      name.trim().normalize('NFKC').toLowerCase(),
      s.typeId ?? null,
      s.isKey ? 1 : 0,
      s.deletedAt ?? null,
    );
  return Number(r.lastInsertRowid);
}

export function seedWechatGroup(db: DatabaseSync, customerId: number, name = '商务交流群'): number {
  const r = db
    .prepare('INSERT INTO customer_wechat_group (customer_id, name) VALUES (?, ?)')
    .run(customerId, name);
  return Number(r.lastInsertRowid);
}

export function seedWechatMember(
  db: DatabaseSync,
  groupId: number,
  m: { wechatId?: string; realName?: string | null; position?: string | null } = {},
): number {
  const r = db
    .prepare(
      'INSERT INTO wechat_member (group_id, wechat_id, real_name, position) VALUES (?, ?, ?, ?)',
    )
    .run(groupId, m.wechatId ?? 'wx_zhangsan', m.realName ?? '张三', m.position ?? '采购经理');
  return Number(r.lastInsertRowid);
}

export interface OrderSeed {
  orderNo?: string;
  customerId?: number;
  orderDate?: string | null;
  typeId?: number | null;
  statusId?: number | null;
  expectedDeliveryDate?: string | null;
  totalAmount?: number | null;
  amountManual?: boolean;
  isKey?: boolean;
}

let orderNoSeq = 0;

export function seedOrder(db: DatabaseSync, s: OrderSeed = {}): number {
  orderNoSeq += 1;
  const r = db
    .prepare(
      'INSERT INTO orders (order_no, customer_id, order_date, type_id, status_id, expected_delivery_date, ' +
        'total_amount, amount_manual, is_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      s.orderNo ?? `T${String(orderNoSeq).padStart(6, '0')}`,
      s.customerId ?? 1,
      s.orderDate === undefined ? '2026-10-28' : s.orderDate,
      s.typeId ?? null,
      s.statusId === undefined ? 1 : s.statusId,
      s.expectedDeliveryDate ?? null,
      s.totalAmount ?? null,
      s.amountManual ? 1 : 0,
      s.isKey ? 1 : 0,
    );
  return Number(r.lastInsertRowid);
}

export function seedNode(
  db: DatabaseSync,
  orderId: number,
  s: { templateId?: number | null; name?: string; status?: string; planTime?: string | null; sortOrder?: number },
): number {
  const r = db
    .prepare(
      'INSERT INTO order_node (order_id, template_id, name, status, plan_time, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(
      orderId,
      s.templateId ?? null,
      s.name ?? '节点',
      s.status ?? 'pending',
      s.planTime ?? null,
      s.sortOrder ?? 0,
    );
  return Number(r.lastInsertRowid);
}

export interface MaterialSeed {
  code?: string;
  name?: string;
  spec?: string | null;
  brand?: string | null;
  purchasePrice?: number | null;
  salePrice?: number | null;
  priceTaxIncluded?: boolean;
  taxRate?: number;
  isActive?: boolean;
}

export function seedMaterial(db: DatabaseSync, m: MaterialSeed = {}): number {
  const code = m.code ?? 'RDDZX03001';
  const r = db
    .prepare(
      'INSERT INTO material (code, code_norm, name, spec, brand, purchase_price, sale_price, ' +
        'price_tax_included, tax_rate, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      code,
      code.trim().normalize('NFKC').toLowerCase(),
      m.name ?? 'ARM处理器',
      m.spec ?? 'GD32F407ZGT6',
      m.brand ?? '兆易创新',
      m.purchasePrice ?? 12.5,
      m.salePrice ?? 29.24,
      m.priceTaxIncluded === false ? 0 : 1,
      m.taxRate ?? 13,
      m.isActive === false ? 0 : 1,
    );
  return Number(r.lastInsertRowid);
}
