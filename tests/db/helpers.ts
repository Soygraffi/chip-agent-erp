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
  contact?: string;
  phone?: string;
  typeId?: number | null;
  isKey?: boolean;
  deletedAt?: string | null;
}

export function seedCustomer(db: DatabaseSync, s: CustomerSeed = {}): number {
  const name = s.name ?? '华强半导体';
  const r = db
    .prepare(
      'INSERT INTO customer (name, name_norm, type_id, contact, phone, is_key, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      name,
      name.trim().normalize('NFKC').toLowerCase(),
      s.typeId ?? null,
      s.contact ?? '张三',
      s.phone ?? '13800000000',
      s.isKey ? 1 : 0,
      s.deletedAt ?? null,
    );
  return Number(r.lastInsertRowid);
}

export interface OrderSeed {
  orderNo?: string;
  customerId?: number;
  orderDate?: string;
  typeId?: number | null;
  statusId?: number;
  expectedDeliveryDate?: string | null;
  currencyId?: number | null;
  exchangeRate?: number | null;
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
        'currency_id, exchange_rate, total_amount, amount_manual, is_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      s.orderNo ?? `T${String(orderNoSeq).padStart(6, '0')}`,
      s.customerId ?? 1,
      s.orderDate ?? '2026-10-28',
      s.typeId ?? null,
      s.statusId ?? 1,
      s.expectedDeliveryDate ?? null,
      s.currencyId ?? null,
      s.exchangeRate ?? null,
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
