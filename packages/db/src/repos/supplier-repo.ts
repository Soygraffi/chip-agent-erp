import type { DatabaseSync } from 'node:sqlite';
import type { Page, Supplier, SupplierListRow } from '@erp/shared';
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
