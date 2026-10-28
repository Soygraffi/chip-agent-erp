import type { DatabaseSync } from 'node:sqlite';
import type { Customer, CustomerListRow, Page } from '@erp/shared';
import { bizError, isValidDateStr, todayStr } from '@erp/shared';
import {
  activeNameNorms,
  customerOrderCounts,
  findActiveCustomerIdByNorm,
  getCustomer,
  insertCustomer,
  listCustomers,
  listCustomerOptions,
  softDeleteCustomer,
  updateCustomer,
} from '../repos/customer-repo.js';
import { normalizeName } from '@erp/domain';

export interface CustomerCreateInput {
  name: string;
  shortName?: string | null;
  typeId?: number | null;
  contact: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  salesOwner?: string | null;
  cooperationStart?: string | null;
  isKey?: boolean;
  remark?: string | null;
}

export type CustomerUpdateInput = Partial<CustomerCreateInput>;

function validate(input: CustomerCreateInput): string | null {
  if (!input.name || !input.name.trim()) return '客户全称不能为空';
  if (!input.contact || !input.contact.trim()) return '联系人不能为空';
  if (!input.phone || !input.phone.trim()) return '联系电话不能为空';
  if (
    input.cooperationStart != null &&
    input.cooperationStart !== '' &&
    !isValidDateStr(input.cooperationStart)
  )
    return '合作起始日期格式不正确';
  return null;
}

export const customerService = {
  create(db: DatabaseSync, input: CustomerCreateInput): number {
    const err = validate(input);
    if (err) throw bizError('VALIDATION', err);
    const name = input.name.trim();
    const norm = normalizeName(name);
    if (findActiveCustomerIdByNorm(db, norm) != null) throw bizError('CUSTOMER_DUPLICATE');
    return insertCustomer(db, { ...input, name, nameNorm: norm });
  },

  update(db: DatabaseSync, id: number, input: CustomerUpdateInput): void {
    const existing = getCustomer(db, id);
    if (!existing) throw bizError('CUSTOMER_NOT_FOUND');
    const merged: CustomerCreateInput = {
      name: existing.name,
      contact: existing.contact,
      phone: existing.phone,
      ...input,
    };
    const err = validate(merged);
    if (err) throw bizError('VALIDATION', err);
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
};
