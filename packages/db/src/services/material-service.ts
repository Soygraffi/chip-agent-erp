import type { DatabaseSync } from 'node:sqlite';
import type { Material, MaterialListRow, Page } from '@erp/shared';
import { bizError } from '@erp/shared';
import {
  deleteMaterial,
  findMaterialByNorm,
  getMaterial,
  insertMaterial,
  listMaterialOptions,
  listMaterials,
  listOrdersByMaterial,
  materialUsageCount,
  updateMaterial,
  type MaterialFilter,
  type MaterialInput,
} from '../repos/material-repo.js';
import { normalizeName } from '@erp/domain';

export interface MaterialCreateInput {
  code: string;
  name: string;
  spec?: string | null;
  brand?: string | null;
  purchasePrice?: number | null;
  salePrice?: number | null;
  priceTaxIncluded?: boolean;
  taxRate?: number;
  remark?: string | null;
  isActive?: boolean;
}

function validate(input: Partial<MaterialCreateInput>): void {
  if (input.code !== undefined && (!input.code || !input.code.trim()))
    throw bizError('VALIDATION', '物料编码不能为空');
  if (input.name !== undefined && (!input.name || !input.name.trim()))
    throw bizError('VALIDATION', '物料名称不能为空');
  for (const [label, v] of [
    ['进货价', input.purchasePrice],
    ['出货价', input.salePrice],
  ] as const) {
    if (v != null && (!Number.isFinite(v) || v < 0))
      throw bizError('VALIDATION', `${label}必须为非负数`);
  }
  if (input.taxRate != null && (!Number.isFinite(input.taxRate) || input.taxRate < 0 || input.taxRate > 100))
    throw bizError('VALIDATION', '税率必须在 0 ~ 100 之间');
}

export const materialService = {
  create(db: DatabaseSync, input: MaterialCreateInput): number {
    validate(input);
    const code = input.code.trim();
    const norm = normalizeName(code);
    if (findMaterialByNorm(db, norm)) throw bizError('MATERIAL_DUPLICATE');
    return insertMaterial(db, {
      code,
      codeNorm: norm,
      name: input.name.trim(),
      spec: input.spec ?? null,
      brand: input.brand ?? null,
      purchasePrice: input.purchasePrice ?? null,
      salePrice: input.salePrice ?? null,
      priceTaxIncluded: input.priceTaxIncluded !== false,
      taxRate: input.taxRate ?? 13,
      remark: input.remark ?? null,
      isActive: input.isActive !== false,
    });
  },

  update(db: DatabaseSync, id: number, input: Partial<MaterialCreateInput>): void {
    const existing = getMaterial(db, id);
    if (!existing) throw bizError('MATERIAL_NOT_FOUND');
    validate(input);
    const patch: Partial<MaterialInput> = { ...input };
    if (input.code !== undefined) {
      const code = input.code.trim();
      const norm = normalizeName(code);
      const dup = findMaterialByNorm(db, norm);
      if (dup && dup.id !== id) throw bizError('MATERIAL_DUPLICATE');
      patch.code = code;
      patch.codeNorm = norm;
    }
    if (input.name !== undefined) patch.name = input.name.trim();
    updateMaterial(db, id, patch);
  },

  /** 删除：被订单明细引用时拒绝，避免历史数据丢失 */
  delete(db: DatabaseSync, id: number): void {
    if (!getMaterial(db, id)) throw bizError('MATERIAL_NOT_FOUND');
    const used = materialUsageCount(db, id);
    if (used > 0)
      throw bizError('MATERIAL_IN_USE', `该物料已被 ${used} 条订单明细引用，不能删除（可改为停用）`);
    deleteMaterial(db, id);
  },

  get(db: DatabaseSync, id: number): Material {
    const m = getMaterial(db, id);
    if (!m) throw bizError('MATERIAL_NOT_FOUND');
    return m;
  },

  list(db: DatabaseSync, filter: MaterialFilter): Page<MaterialListRow> {
    return listMaterials(db, filter);
  },

  options(db: DatabaseSync) {
    return listMaterialOptions(db);
  },

  ordersUsing(db: DatabaseSync, materialId: number) {
    if (!getMaterial(db, materialId)) throw bizError('MATERIAL_NOT_FOUND');
    return listOrdersByMaterial(db, materialId);
  },
};
