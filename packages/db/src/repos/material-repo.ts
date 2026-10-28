import type { DatabaseSync } from 'node:sqlite';
import type { Material, MaterialListRow, Page } from '@erp/shared';
import { escapeLike } from './customer-repo.js';

export interface MaterialInput {
  code: string;
  codeNorm: string;
  name: string;
  spec?: string | null;
  brand?: string | null;
  purchasePrice?: number | null;
  purchaseTaxIncluded?: boolean;
  salePrice?: number | null;
  priceTaxIncluded?: boolean;
  taxRate?: number;
  remark?: string | null;
  isActive?: boolean;
  supplierId?: number | null;
}

const COLS = `m.id, m.code, m.code_norm AS codeNorm, m.name, m.spec, m.brand,
  m.purchase_price AS purchasePrice, m.purchase_tax_included AS purchaseTaxIncluded,
  m.sale_price AS salePrice, m.price_tax_included AS priceTaxIncluded, m.tax_rate AS taxRate,
  m.remark, m.is_active AS isActive, m.supplier_id AS supplierId, m.created_at AS createdAt, m.updated_at AS updatedAt`;

function mapMaterial(r: Record<string, unknown>): Material {
  return {
    ...r,
    spec: (r.spec as string | null) ?? null,
    brand: (r.brand as string | null) ?? null,
    purchasePrice: (r.purchasePrice as number | null) ?? null,
    purchaseTaxIncluded: r.purchaseTaxIncluded == null ? true : !!r.purchaseTaxIncluded,
    salePrice: (r.salePrice as number | null) ?? null,
    remark: (r.remark as string | null) ?? null,
    priceTaxIncluded: !!r.priceTaxIncluded,
    isActive: !!r.isActive,
    supplierId: (r.supplierId as number | null) ?? null,
  } as Material;
}

export function insertMaterial(db: DatabaseSync, m: MaterialInput): number {
  const r = db
    .prepare(
      'INSERT INTO material (code, code_norm, name, spec, brand, purchase_price, purchase_tax_included, ' +
        'sale_price, price_tax_included, tax_rate, remark, is_active, supplier_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      m.code,
      m.codeNorm,
      m.name,
      m.spec ?? null,
      m.brand ?? null,
      m.purchasePrice ?? null,
      m.purchaseTaxIncluded === false ? 0 : 1,
      m.salePrice ?? null,
      m.priceTaxIncluded === false ? 0 : 1,
      m.taxRate ?? 13,
      m.remark ?? null,
      m.isActive === false ? 0 : 1,
      m.supplierId ?? null,
    );
  return Number(r.lastInsertRowid);
}

export function updateMaterial(
  db: DatabaseSync,
  id: number,
  patch: Partial<MaterialInput>,
): boolean {
  const map: Record<string, string> = {
    code: 'code',
    codeNorm: 'code_norm',
    name: 'name',
    spec: 'spec',
    brand: 'brand',
    supplierId: 'supplier_id',
    purchasePrice: 'purchase_price',
    salePrice: 'sale_price',
    remark: 'remark',
  };
  const fields: string[] = [];
  const args: (string | number | null)[] = [];
  for (const [k, col] of Object.entries(map)) {
    const v = (patch as Record<string, unknown>)[k];
    if (v !== undefined) {
      fields.push(`${col} = ?`);
      args.push((v as string | number | null) ?? null);
    }
  }
  if (patch.priceTaxIncluded !== undefined) {
    fields.push('price_tax_included = ?');
    args.push(patch.priceTaxIncluded ? 1 : 0);
  }
  if (patch.purchaseTaxIncluded !== undefined) {
    fields.push('purchase_tax_included = ?');
    args.push(patch.purchaseTaxIncluded ? 1 : 0);
  }
  if (patch.taxRate !== undefined) {
    fields.push('tax_rate = ?');
    args.push(patch.taxRate ?? 13);
  }
  if (patch.isActive !== undefined) {
    fields.push('is_active = ?');
    args.push(patch.isActive ? 1 : 0);
  }
  if (fields.length === 0) return false;
  fields.push("updated_at = datetime('now','localtime')");
  args.push(id);
  return db.prepare(`UPDATE material SET ${fields.join(', ')} WHERE id = ?`).run(...args).changes > 0;
}

export function getMaterial(db: DatabaseSync, id: number): Material | null {
  const r = db.prepare(`SELECT ${COLS} FROM material m WHERE m.id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  return r ? mapMaterial(r) : null;
}

export function findMaterialByNorm(db: DatabaseSync, norm: string): Material | null {
  const r = db.prepare(`SELECT ${COLS} FROM material m WHERE m.code_norm = ?`).get(norm) as
    | Record<string, unknown>
    | undefined;
  return r ? mapMaterial(r) : null;
}

export function deleteMaterial(db: DatabaseSync, id: number): boolean {
  return db.prepare('DELETE FROM material WHERE id = ?').run(id).changes > 0;
}

export interface MaterialFilter {
  search?: string;
  isActive?: boolean | null;
  page: number;
  pageSize: number;
}

export function listMaterials(db: DatabaseSync, f: MaterialFilter): Page<MaterialListRow> {
  const where: string[] = ['1=1'];
  const args: (string | number | null)[] = [];
  if (f.search) {
    where.push(
      "(m.code LIKE ? ESCAPE '\\' OR m.name LIKE ? ESCAPE '\\' OR m.spec LIKE ? ESCAPE '\\' OR m.brand LIKE ? ESCAPE '\\')",
    );
    const like = `%${escapeLike(f.search)}%`;
    args.push(like, like, like, like);
  }
  if (f.isActive != null) {
    where.push('m.is_active = ?');
    args.push(f.isActive ? 1 : 0);
  }
  const whereSql = where.join(' AND ');
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM material m WHERE ${whereSql}`).get(...args) as { c: number }
  ).c;
  const rows = db
    .prepare(
      `SELECT ${COLS},
        (SELECT COUNT(*) FROM order_item i WHERE i.material_id = m.id) AS orderItemCount,
        (SELECT COUNT(DISTINCT i.order_id) FROM order_item i WHERE i.material_id = m.id) AS orderCount,
        (SELECT MAX(o.order_date) FROM order_item i JOIN orders o ON o.id = i.order_id
          WHERE i.material_id = m.id) AS lastOrderDate,
        sup.name AS supplierName
       FROM material m LEFT JOIN supplier sup ON sup.id = m.supplier_id WHERE ${whereSql}
       ORDER BY m.code
       LIMIT ? OFFSET ?`,
    )
    .all(...args, f.pageSize, (f.page - 1) * f.pageSize)
    .map((r) => ({
      ...mapMaterial(r),
      orderItemCount: Number(r.orderItemCount ?? 0),
      orderCount: Number(r.orderCount ?? 0),
      lastOrderDate: (r.lastOrderDate as string | null) ?? null,
    })) as MaterialListRow[];
  return { rows, total };
}

export interface MaterialOption {
  id: number;
  code: string;
  name: string;
  spec: string | null;
  brand: string | null;
  supplierId: number | null;
  purchasePrice: number | null;
  purchaseTaxIncluded: boolean;
  salePrice: number | null;
  priceTaxIncluded: boolean;
  taxRate: number;
}

/** 订单明细的物料选择器数据源（仅启用物料） */
export function listMaterialOptions(db: DatabaseSync): MaterialOption[] {
  return (
    db
      .prepare(
        `SELECT id, code, name, spec, brand, supplier_id AS supplierId,
                purchase_price AS purchasePrice, purchase_tax_included AS purchaseTaxIncluded,
                sale_price AS salePrice, price_tax_included AS priceTaxIncluded, tax_rate AS taxRate
         FROM material WHERE is_active = 1 ORDER BY code`,
      )
      .all() as Record<string, unknown>[]
  ).map(
    (r) =>
      ({
        ...r,
        spec: (r.spec as string | null) ?? null,
        brand: (r.brand as string | null) ?? null,
        supplierId: (r.supplierId as number | null) ?? null,
        purchasePrice: (r.purchasePrice as number | null) ?? null,
        purchaseTaxIncluded: r.purchaseTaxIncluded == null ? true : !!r.purchaseTaxIncluded,
        salePrice: (r.salePrice as number | null) ?? null,
        priceTaxIncluded: !!r.priceTaxIncluded,
      }) as MaterialOption,
  );
}

export interface MaterialOrderRow {
  orderId: number;
  orderNo: string;
  customerName: string;
  orderDate: string | null;
  qty: number;
  unitPrice: number | null;
  subtotal: number | null;
}

/** 物料 → 关联订单（物料管理页的“与其他表格互动”） */
export function listOrdersByMaterial(db: DatabaseSync, materialId: number): MaterialOrderRow[] {
  return db
    .prepare(
      `SELECT o.id AS orderId, o.order_no AS orderNo, c.name AS customerName,
              o.order_date AS orderDate, i.qty, i.unit_price AS unitPrice, i.subtotal
       FROM order_item i
       JOIN orders o ON o.id = i.order_id
       JOIN customer c ON c.id = o.customer_id
       WHERE i.material_id = ?
       ORDER BY o.order_date DESC, o.id DESC`,
    )
    .all(materialId) as unknown as MaterialOrderRow[];
}

export function materialUsageCount(db: DatabaseSync, materialId: number): number {
  const r = db
    .prepare('SELECT COUNT(*) AS c FROM order_item WHERE material_id = ?')
    .get(materialId) as { c: number };
  return r.c;
}
