import type { DatabaseSync } from 'node:sqlite';
import type { Customer, CustomerListRow, Page } from '@erp/shared';

export interface CustomerInput {
  name: string;
  nameNorm: string;
  shortName?: string | null;
  typeId?: number | null;
  address?: string | null;
  contact?: string | null;
  isKey?: boolean;
  remark?: string | null;
  logoPath?: string | null;
  sortOrder?: number;
}

export function insertCustomer(db: DatabaseSync, c: CustomerInput): number {
  const sortOrder =
    c.sortOrder ??
    ((db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM customer').get() as { n: number }).n);
  const r = db
    .prepare(
      'INSERT INTO customer (name, name_norm, short_name, type_id, address, contact, is_key, remark, logo_path, sort_order) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      c.name,
      c.nameNorm,
      c.shortName ?? null,
      c.typeId ?? null,
      c.address ?? null,
      c.contact ?? null,
      c.isKey ? 1 : 0,
      c.remark ?? null,
      c.logoPath ?? null,
      sortOrder,
    );
  return Number(r.lastInsertRowid);
}

/** 客户卡片拖动排序（V1.4）：按给定顺序重写 sort_order */
export function reorderCustomers(db: DatabaseSync, ids: number[]): void {
  const stmt = db.prepare('UPDATE customer SET sort_order = ? WHERE id = ?');
  ids.forEach((id, i) => stmt.run(i + 1, id));
}

export function updateCustomer(
  db: DatabaseSync,
  id: number,
  patch: Partial<CustomerInput> & { nameNorm?: string },
): boolean {
  const map: Record<string, string> = {
    name: 'name',
    nameNorm: 'name_norm',
    shortName: 'short_name',
    typeId: 'type_id',
    address: 'address',
    contact: 'contact',
    remark: 'remark',
    logoPath: 'logo_path',
  };
  const fields: string[] = [];
  const args: (string | number | null)[] = [];
  for (const [k, col] of Object.entries(map)) {
    const v = (patch as Record<string, unknown>)[k];
    if (v !== undefined) {
      fields.push(`${col} = ?`);
      args.push(
        v === null || v === ''
          ? k === 'name' || k === 'nameNorm'
            ? (v as string)
            : null
          : (v as string | number | null),
      );
    }
  }
  if (patch.isKey !== undefined) {
    fields.push('is_key = ?');
    args.push(patch.isKey ? 1 : 0);
  }
  if (fields.length === 0) return false;
  fields.push("updated_at = datetime('now','localtime')");
  args.push(id);
  return db.prepare(`UPDATE customer SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`).run(...args)
    .changes > 0;
}

const CUSTOMER_COLS = `c.id, c.name, c.name_norm AS nameNorm, c.short_name AS shortName, c.type_id AS typeId,
  c.address, c.contact, c.is_key AS isKey, c.remark, c.logo_path AS logoPath, c.sort_order AS sortOrder,
  c.deleted_at AS deletedAt, c.created_at AS createdAt, c.updated_at AS updatedAt`;

export function getCustomer(db: DatabaseSync, id: number): Customer | null {
  const r = db
    .prepare(`SELECT ${CUSTOMER_COLS} FROM customer c WHERE c.id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  if (!r) return null;
  return {
    ...r,
    isKey: !!r.isKey,
    contact: (r.contact as string | null) ?? null,
    shortName: (r.shortName as string | null) ?? null,
    logoPath: (r.logoPath as string | null) ?? null,
    deletedAt: (r.deletedAt as string | null) ?? null,
  } as Customer;
}

/** 软删除：仅设置 deleted_at（PRD 4.2.4） */
export function softDeleteCustomer(db: DatabaseSync, id: number, now: string): boolean {
  return (
    db
      .prepare(
        "UPDATE customer SET deleted_at = ?, updated_at = datetime('now','localtime') WHERE id = ? AND deleted_at IS NULL",
      )
      .run(now, id).changes > 0
  );
}

/** 未删除客户的归一化名称集合（判重 + 导入匹配用） */
export function activeNameNorms(db: DatabaseSync): Set<string> {
  const rows = db
    .prepare('SELECT name_norm FROM customer WHERE deleted_at IS NULL')
    .all() as { name_norm: string }[];
  return new Set(rows.map((r) => r.name_norm));
}

export function findActiveCustomerIdByNorm(db: DatabaseSync, norm: string): number | null {
  const r = db
    .prepare('SELECT id FROM customer WHERE name_norm = ? AND deleted_at IS NULL')
    .get(norm) as { id: number } | undefined;
  return r ? r.id : null;
}

/** 订单下拉选项：仅未删除客户 */
export function listCustomerOptions(db: DatabaseSync): { id: number; name: string }[] {
  return db
    .prepare('SELECT id, name FROM customer WHERE deleted_at IS NULL ORDER BY name')
    .all() as { id: number; name: string }[];
}

export interface CustomerFilter {
  search?: string;
  typeId?: number | null;
  isKey?: boolean | null;
  page: number;
  pageSize: number;
}

export function listCustomers(
  db: DatabaseSync,
  filter: CustomerFilter,
): Page<CustomerListRow> {
  const where: string[] = ['c.deleted_at IS NULL'];
  const args: (string | number | null)[] = [];
  if (filter.search) {
    where.push("(c.name LIKE ? ESCAPE '\\' OR c.short_name LIKE ? ESCAPE '\\')");
    const like = `%${escapeLike(filter.search)}%`;
    args.push(like, like);
  }
  if (filter.typeId != null) {
    where.push('c.type_id = ?');
    args.push(filter.typeId);
  }
  if (filter.isKey != null) {
    where.push(filter.isKey ? 'c.is_key = 1' : 'c.is_key = 0');
  }
  const whereSql = where.join(' AND ');
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM customer c WHERE ${whereSql}`).get(...args) as { c: number }
  ).c;
  const rows = db
    .prepare(
      `SELECT ${CUSTOMER_COLS}, d.name AS typeName,
        (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS orderCount,
        (SELECT COUNT(*) FROM orders o LEFT JOIN order_status s ON o.status_id = s.id
          WHERE o.customer_id = c.id AND (s.is_terminal = 0 OR o.status_id IS NULL)) AS activeOrderCount,
        (SELECT COUNT(*) FROM customer_wechat_group w WHERE w.customer_id = c.id) AS wechatGroupCount
       FROM customer c LEFT JOIN dict_item d ON d.id = c.type_id
       WHERE ${whereSql}
       ORDER BY c.sort_order, c.id
       LIMIT ? OFFSET ?`,
    )
    .all(...args, filter.pageSize, (filter.page - 1) * filter.pageSize)
    .map((r) => ({
      ...r,
      isKey: !!r.isKey,
      sortOrder: Number(r.sortOrder ?? 0),
      typeName: (r.typeName as string | null) ?? null,
      shortName: (r.shortName as string | null) ?? null,
      logoPath: (r.logoPath as string | null) ?? null,
      deletedAt: (r.deletedAt as string | null) ?? null,
    })) as CustomerListRow[];
  return { rows, total };
}

export function customerOrderCounts(
  db: DatabaseSync,
  id: number,
): { orderCount: number; activeOrderCount: number } {
  const r = db
    .prepare(
      'SELECT (SELECT COUNT(*) FROM orders WHERE customer_id = ?) AS orderCount, ' +
        '(SELECT COUNT(*) FROM orders o LEFT JOIN order_status s ON o.status_id = s.id ' +
        ' WHERE o.customer_id = ? AND (s.is_terminal = 0 OR o.status_id IS NULL)) AS activeOrderCount',
    )
    .get(id, id) as { orderCount: number; activeOrderCount: number };
  return r;
}

export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (ch) => '\\' + ch);
}
