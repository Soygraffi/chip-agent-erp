import type { DatabaseSync } from 'node:sqlite';
import type { Customer, CustomerListRow, Page } from '@erp/shared';
import { bizError, todayStr } from '@erp/shared';
import {
  activeNameNorms,
  customerOrderCounts,
  findActiveCustomerIdByNorm,
  getCustomer,
  insertCustomer,
  listCustomers,
  listCustomerOptions,
  reorderCustomers,
  softDeleteCustomer,
  updateCustomer,
} from '../repos/customer-repo.js';
import { listGroups } from '../repos/wechat-repo.js';
import { normalizeName } from '@erp/domain';

export interface CustomerCreateInput {
  name: string;
  shortName?: string | null;
  typeId?: number | null;
  address?: string | null;
  isKey?: boolean;
  remark?: string | null;
  logoPath?: string | null;
}

export type CustomerUpdateInput = Partial<CustomerCreateInput>;

export const customerService = {
  create(db: DatabaseSync, input: CustomerCreateInput): number {
    if (!input.name || !input.name.trim()) throw bizError('VALIDATION', '客户全称不能为空');
    const name = input.name.trim();
    const norm = normalizeName(name);
    if (findActiveCustomerIdByNorm(db, norm) != null) throw bizError('CUSTOMER_DUPLICATE');
    return insertCustomer(db, { ...input, name, nameNorm: norm });
  },

  update(db: DatabaseSync, id: number, input: CustomerUpdateInput): void {
    const existing = getCustomer(db, id);
    if (!existing) throw bizError('CUSTOMER_NOT_FOUND');
    if (input.name !== undefined && (!input.name || !input.name.trim()))
      throw bizError('VALIDATION', '客户全称不能为空');
    const patch: Record<string, unknown> = { ...input };
    if (input.name !== undefined) {
      const norm = normalizeName(input.name.trim());
      const dupId = findActiveCustomerIdByNorm(db, norm);
      if (dupId != null && dupId !== id) throw bizError('CUSTOMER_DUPLICATE');
      patch.name = input.name.trim();
      patch.nameNorm = norm;
    }
    updateCustomer(db, id, patch as never);
  },

  /** 软删除：返回订单数供二次确认提示（PRD 4.2.4） */
  softDelete(db: DatabaseSync, id: number, today = todayStr()): { orderCount: number } {
    if (!getCustomer(db, id)) throw bizError('CUSTOMER_NOT_FOUND');
    const counts = customerOrderCounts(db, id);
    if (!softDeleteCustomer(db, id, today)) throw bizError('CUSTOMER_NOT_FOUND');
    return counts;
  },

  get(db: DatabaseSync, id: number): Customer {
    const c = getCustomer(db, id);
    if (!c) throw bizError('CUSTOMER_NOT_FOUND');
    return c;
  },

  list(
    db: DatabaseSync,
    filter: { search?: string; typeId?: number | null; isKey?: boolean | null; page: number; pageSize: number },
  ): Page<CustomerListRow> {
    return listCustomers(db, filter);
  },

  options(db: DatabaseSync): { id: number; name: string }[] {
    return listCustomerOptions(db);
  },

  /** 导入匹配：归一化名称 → 客户ID（仅未删除客户） */
  normIndex(db: DatabaseSync): Map<string, number> {
    const rows = db
      .prepare('SELECT id, name_norm FROM customer WHERE deleted_at IS NULL')
      .all() as { id: number; name_norm: string }[];
    return new Map(rows.map((r) => [r.name_norm, r.id]));
  },

  existingNorms(db: DatabaseSync): Set<string> {
    return activeNameNorms(db);
  },

  /** 客户卡片拖动排序（V1.4）：ids 必须是当前未删除客户的全集 */
  reorder(db: DatabaseSync, ids: number[]): void {
    const rows = db
      .prepare('SELECT id FROM customer WHERE deleted_at IS NULL')
      .all() as { id: number }[];
    const existing = new Set(rows.map((r) => r.id));
    if (ids.length !== existing.size || ids.some((id) => !existing.has(id))) {
      throw bizError('VALIDATION', '排序列表与当前客户不一致');
    }
    reorderCustomers(db, ids);
  },

  /** 客户的微信群 */
  wechatGroups(db: DatabaseSync, customerId: number) {
    return listGroups(db, customerId);
  },
};
