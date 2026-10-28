import { isValidDateStr } from '@erp/shared';
import { normalizeName } from './normalizer.js';

export interface ImportDicts {
  customerTypeNames: Set<string>;
  orderTypeNames: Set<string>;
  statusNames: Set<string>;
  currencyNames: Set<string>;
}

export interface CustomerImportRow {
  row: number;
  name?: string | null;
  type?: string | null;
  contact?: string | null;
  phone?: string | null;
}

export interface OrderImportRow {
  row: number;
  orderNo?: string | null;
  customerName?: string | null;
  orderDate?: string | null;
  type?: string | null;
  status?: string | null;
  currency?: string | null;
  amount?: string | number | null;
  expectedDeliveryDate?: string | null;
  owner?: string | null;
  remark?: string | null;
  isKey?: string | boolean | null;
}

const strip = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null;

/**
 * 客户导入行校验（PRD 4.5.1）
 * 返回错误文案；null 表示通过。seenNames 为“库中未删除客户 + 本文件已通过行”的归一化名称集合。
 */
export function validateCustomerRow(
  row: CustomerImportRow,
  dicts: ImportDicts,
  seenNames: Set<string>,
): string | null {
  const name = strip(row.name);
  if (!name) return '客户全称不能为空';
  const type = strip(row.type);
  if (!type) return '客户类型不能为空';
  if (!dicts.customerTypeNames.has(type)) return `客户类型“${type}”不存在`;
  const contact = strip(row.contact);
  if (!contact) return '联系人不能为空';
  const phone = strip(row.phone);
  if (!phone) return '联系电话不能为空';
  const norm = normalizeName(name);
  if (seenNames.has(norm)) return `客户名称已存在（重复：${name}）`;
  seenNames.add(norm);
  return null;
}

/**
 * 订单导入行校验（PRD 4.5.1）
 * customerNameToId 为“库中未删除客户归一化名称 → id”映射（按客户全称精确匹配，客户必须已存在）
 */
export function validateOrderRow(
  row: OrderImportRow,
  dicts: ImportDicts,
  customerNameToId: Map<string, number>,
  seenOrderNos: Set<string>,
): { error: string | null; customerId: number | null } {
  const customerName = strip(row.customerName);
  if (!customerName) return { error: '客户全称不能为空', customerId: null };
  const customerId = customerNameToId.get(normalizeName(customerName));
  if (customerId == null) return { error: `客户“${customerName}”不存在，请先导入客户`, customerId: null };

  const orderDate = strip(row.orderDate);
  if (!orderDate) return { error: '订单日期不能为空', customerId: null };
  if (!isValidDateStr(orderDate)) return { error: `订单日期格式不正确（应为 YYYY-MM-DD）：${orderDate}`, customerId: null };

  const type = strip(row.type);
  if (!type) return { error: '订单类型不能为空', customerId: null };
  if (!dicts.orderTypeNames.has(type)) return { error: `订单类型“${type}”不存在`, customerId: null };

  const status = strip(row.status);
  if (!status) return { error: '订单状态不能为空', customerId: null };
  if (!dicts.statusNames.has(status)) return { error: `订单状态“${status}”不存在`, customerId: null };

  const currency = strip(row.currency);
  if (currency && !dicts.currencyNames.has(currency))
    return { error: `币种“${currency}”不存在`, customerId: null };

  const expected = strip(row.expectedDeliveryDate);
  if (expected && !isValidDateStr(expected))
    return { error: `预计交货日期格式不正确（应为 YYYY-MM-DD）：${expected}`, customerId: null };

  const orderNo = strip(row.orderNo);
  if (orderNo) {
    if (seenOrderNos.has(orderNo)) return { error: `订单编号已存在（重复：${orderNo}）`, customerId: null };
    seenOrderNos.add(orderNo);
  }

  const amount = row.amount;
  if (amount != null && String(amount).trim() !== '') {
    const n = typeof amount === 'number' ? amount : Number(String(amount).trim());
    if (!Number.isFinite(n)) return { error: `金额不是有效数字：${String(amount)}`, customerId: null };
  }

  return { error: null, customerId };
}

/** 解析“是否重点跟进”布尔列：是/否/true/false/1/0 */
export function parseBool(v: string | boolean | null | undefined): boolean {
  if (typeof v === 'boolean') return v;
  if (v == null) return false;
  const s = v.trim().toLowerCase();
  return ['是', 'true', '1', 'yes', 'y'].includes(s);
}
