import type { DatabaseSync } from 'node:sqlite';
import type { Page, Supplier, SupplierListRow } from '@erp/shared';
import { bizError, todayStr } from '@erp/shared';
import {
  findSupplierByNorm,
  getSupplier,
  insertSupplier,
  listMaterialsBySupplier,
  listOrdersBySupplier,
  listSupplierOptions,
  listSuppliers,
  softDeleteSupplier,
  supplierMaterialCount,
  updateSupplier,
  type SupplierFilter,
} from '../repos/supplier-repo.js';
import { normalizeName } from '@erp/domain';

export interface SupplierCreateInput {
  name: string;
  shortName?: string | null;
  contact?: string | null;
  phone?: string | null;
  address?: string | null;
  remark?: string | null;
}

export const supplierService = {
  create(db: DatabaseSync, input: SupplierCreateInput): number {
    if (!input.name || !input.name.trim()) throw bizError('VALIDATION', '供应商名称不能为空');
    const name = input.name.trim();
    const norm = normalizeName(name);
    if (findSupplierByNorm(db, norm)) throw bizError('VALIDATION', '供应商名称已存在');
    return insertSupplier(db, { ...input, name, nameNorm: norm });
  },

  update(db: DatabaseSync, id: number, input: Partial<SupplierCreateInput>): void {
    if (!getSupplier(db, id)) throw bizError('NOT_FOUND', '供应商不存在');
    if (input.name !== undefined && (!input.name || !input.name.trim()))
      throw bizError('VALIDATION', '供应商名称不能为空');
    const patch: Record<string, unknown> = { ...input };
    if (input.name !== undefined) {
      const norm = normalizeName(input.name.trim());
      const dup = findSupplierByNorm(db, norm);
      if (dup && dup.id !== id) throw bizError('VALIDATION', '供应商名称已存在');
      patch.name = input.name.trim();
      patch.nameNorm = norm;
    }
    updateSupplier(db, id, patch as never);
  },

  softDelete(db: DatabaseSync, id: number, today = todayStr()): void {
    if (!getSupplier(db, id)) throw bizError('NOT_FOUND', '供应商不存在');
    if (!softDeleteSupplier(db, id, today)) throw bizError('NOT_FOUND', '供应商不存在');
  },

  get(db: DatabaseSync, id: number): Supplier {
    const s = getSupplier(db, id);
    if (!s) throw bizError('NOT_FOUND', '供应商不存在');
    return s;
  },

  list(db: DatabaseSync, filter: SupplierFilter): Page<SupplierListRow> {
    return listSuppliers(db, filter);
  },

  options(db: DatabaseSync) {
    return listSupplierOptions(db);
  },

  materialCount(db: DatabaseSync, id: number): number {
    return supplierMaterialCount(db, id);
  },

  /** 供应商涉及的订单（V1.7） */
  orders(db: DatabaseSync, id: number) {
    if (!getSupplier(db, id)) throw bizError('NOT_FOUND', '供应商不存在');
    return listOrdersBySupplier(db, id);
  },

  /** 供应商供货物料（V1.7） */
  materials(db: DatabaseSync, id: number) {
    if (!getSupplier(db, id)) throw bizError('NOT_FOUND', '供应商不存在');
    return listMaterialsBySupplier(db, id);
  },
};
