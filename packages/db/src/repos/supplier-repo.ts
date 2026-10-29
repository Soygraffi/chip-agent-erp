import type { DatabaseSync } from 'node:sqlite';
import type { Page, Supplier, SupplierListRow, SupplierMaterialRow, SupplierOrderRow } from '@erp/shared';
import { escapeLike } from './customer-repo.js';

export interface SupplierInput {
  name: string;
  nameNorm: string;
  shortName?: string | null;
  contact?: string | null;
  phone?: string | null;
  address?: string | null;
  remark?: string | null;
}

const COLS = `s.id, s.name, s.name_norm AS nameNorm, s.short_name AS shortName, s.contact, s.phone,
  s.address, s.remark, s.deleted_at AS deletedAt, s.created_at AS createdAt, s.updated_at AS updatedAt`;

function mapSupplier(r: Record<string, unknown>): Supplier {
  return {
    ...r,
    shortName: (r.shortName as string | null) ?? null,
    contact: (r.contact as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
    address: (r.address as string | null) ?? null,
    remark: (r.remark as string | null) ?? null,
    deletedAt: (r.deletedAt as string | null) ?? null,
  } as Supplier;
}

export function insertSupplier(db: DatabaseSync, s: SupplierInput): number {
  const r = db
    .prepare(
      'INSERT INTO supplier (name, name_norm, short_name, contact, phone, address, remark) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      s.name,
      s.nameNorm,
      s.shortName ?? null,
      s.contact ?? null,
      s.phone ?? null,
      s.address ?? null,
      s.remark ?? null,
    );
  return Number(r.lastInsertRowid);
}

export function updateSupplier(
  db: DatabaseSync,
  id: number,
  patch: Partial<SupplierInput> & { nameNorm?: string },
): boolean {
  const map: Record<string, string> = {
    name: 'name',
    nameNorm: 'name_norm',
    shortName: 'short_name',
    contact: 'contact',
    phone: 'phone',
    address: 'address',
    remark: 'remark',
  };
  const fields: string[] = [];
  const args: (string | number | null)[] = [];
  for (const [k, col] of Object.entries(map)) {
    const v = (patch as Record<string, unknown>)[k];
    if (v !== undefined) {
      fields.push(`${col} = ?`);
      args.push((v as string | null) ?? null);
    }
  }
  if (fields.length === 0) return false;
  fields.push("updated_at = datetime('now','localtime')");
  args.push(id);
  return db.prepare(`UPDATE supplier SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`).run(...args)
    .changes > 0;
}

export function getSupplier(db: DatabaseSync, id: number): Supplier | null {
  const r = db.prepare(`SELECT ${COLS} FROM supplier s WHERE s.id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  return r ? mapSupplier(r) : null;
}

export function findSupplierByNorm(db: DatabaseSync, norm: string): Supplier | null {
  const r = db
    .prepare(`SELECT ${COLS} FROM supplier s WHERE s.name_norm = ? AND s.deleted_at IS NULL`)
    .get(norm) as Record<string, unknown> | undefined;
  return r ? mapSupplier(r) : null;
}

export function softDeleteSupplier(db: DatabaseSync, id: number, now: string): boolean {
  return (
    db
      .prepare(
        "UPDATE supplier SET deleted_at = ?, updated_at = datetime('now','localtime') WHERE id = ? AND deleted_at IS NULL",
      )
      .run(now, id).changes > 0
  );
}

export interface SupplierFilter {
  search?: string;
  page: number;
  pageSize: number;
}

export function listSuppliers(db: DatabaseSync, f: SupplierFilter): Page<SupplierListRow> {
  const where: string[] = ['s.deleted_at IS NULL'];
  const args: (string | number | null)[] = [];
  if (f.search) {
    where.push(
      "(s.name LIKE ? ESCAPE '\\' OR s.short_name LIKE ? ESCAPE '\\' OR s.contact LIKE ? ESCAPE '\\')",
    );
    const like = `%${escapeLike(f.search)}%`;
    args.push(like, like, like);
  }
  const whereSql = where.join(' AND ');
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM supplier s WHERE ${whereSql}`).get(...args) as { c: number }
  ).c;
  const rows = db
    .prepare(
      `SELECT ${COLS},
        (SELECT COUNT(*) FROM material m WHERE m.supplier_id = s.id AND m.is_active = 1) AS materialCount
       FROM supplier s WHERE ${whereSql}
       ORDER BY s.name
       LIMIT ? OFFSET ?`,
    )
    .all(...args, f.pageSize, (f.page - 1) * f.pageSize)
    .map((r) => ({ ...mapSupplier(r), materialCount: Number(r.materialCount ?? 0) })) as SupplierListRow[];
  return { rows, total };
}

export function listSupplierOptions(db: DatabaseSync): { id: number; name: string }[] {
  return db
    .prepare('SELECT id, name FROM supplier WHERE deleted_at IS NULL ORDER BY name')
    .all() as { id: number; name: string }[];
}

export function supplierMaterialCount(db: DatabaseSync, id: number): number {
  const r = db.prepare('SELECT COUNT(*) AS c FROM material WHERE supplier_id = ?').get(id) as { c: number };
  return r.c;
}

/** 供应商涉及的订单（V1.7）：按订单聚合该供应商供货物料的条数与金额 */
export function listOrdersBySupplier(db: DatabaseSync, supplierId: number): SupplierOrderRow[] {
  return db
    .prepare(
      `SELECT o.id AS orderId, o.order_no AS orderNo, c.name AS customerName,
              o.order_date AS orderDate,
              COALESCE(s.name, '未填写') AS statusName, COALESCE(s.color, '#BFBFBF') AS statusColor,
              COUNT(i.id) AS itemCount, ROUND(COALESCE(SUM(i.subtotal), 0), 2) AS amount
       FROM order_item i
       JOIN material m ON m.id = i.material_id
       JOIN orders o ON o.id = i.order_id
       JOIN customer c ON c.id = o.customer_id
       LEFT JOIN order_status s ON s.id = o.status_id
       WHERE m.supplier_id = ?
       GROUP BY o.id
       ORDER BY o.order_date DESC, o.id DESC`,
    )
    .all(supplierId) as unknown as SupplierOrderRow[];
}

/** 供应商供货物料（V1.7） */
export function listMaterialsBySupplier(db: DatabaseSync, supplierId: number): SupplierMaterialRow[] {
  return (
    db
      .prepare(
        `SELECT m.id, m.code, m.name, m.spec, m.brand,
                m.purchase_price AS purchasePrice, m.sale_price AS salePrice, m.is_active AS isActive,
                (SELECT COUNT(DISTINCT i.order_id) FROM order_item i WHERE i.material_id = m.id) AS orderCount
         FROM material m WHERE m.supplier_id = ?
         ORDER BY m.code`,
      )
      .all(supplierId) as Record<string, unknown>[]
  ).map(
    (r) =>
      ({
        ...r,
        spec: (r.spec as string | null) ?? null,
        brand: (r.brand as string | null) ?? null,
        purchasePrice: (r.purchasePrice as number | null) ?? null,
        salePrice: (r.salePrice as number | null) ?? null,
        isActive: !!r.isActive,
        orderCount: Number(r.orderCount ?? 0),
      }) as SupplierMaterialRow,
  );
}
