import type { DatabaseSync } from 'node:sqlite';
import type { Order, OrderItem, OrderListRow, OrderNode, Page } from '@erp/shared';
import { bizError, isValidDateStr, round2 } from '@erp/shared';
import {
  attachmentPathsByOrder,
  deleteOrder,
  getAllOrderNos,
  getCustomer,
  getOrder,
  getOrderNoConfig,
  getRate,
  getStatus,
  insertOrder,
  listItems,
  listNodesByOrder,
  listOrders,
  listTemplates,
  replaceItems,
  updateOrder,
  type ItemInput,
  type OrderFilter,
  type OrderInput,
} from '../repos/index.js';
import { withTransaction } from '../connection.js';
import {
  autoTotal,
  effectiveTotal,
  itemSubtotal,
  nextOrderNo,
} from '@erp/domain';

export interface OrderCreateInput {
  customerId: number;
  orderDate: string;
  typeId: number | null;
  statusId: number;
  expectedDeliveryDate?: string | null;
  actualDeliveryDate?: string | null;
  currencyId?: number | null;
  totalAmount?: number | null;
  amountManual?: boolean;
  paymentMethodId?: number | null;
  owner?: string | null;
  isKey?: boolean;
  remark?: string | null;
  orderNo?: string | null; // 空则自动生成
  items: ItemInput[];
}

export interface OrderDetail extends Order {
  items: OrderItem[];
  nodes: OrderNode[];
}

/** 新建订单时按启用模板顺序生成节点（PRD 4.4.1） */
export function generateTemplateNodes(
  db: DatabaseSync,
  orderId: number,
  owner: string | null,
): number[] {
  const templates = listTemplates(db, true);
  const stmt = db.prepare(
    'INSERT INTO order_node (order_id, template_id, name, status, owner, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const ids: number[] = [];
  templates.forEach((t, i) => {
    const r = stmt.run(orderId, t.id, t.name, 'pending', owner, i + 1);
    ids.push(Number(r.lastInsertRowid));
  });
  return ids;
}

export const orderService = {
  create(db: DatabaseSync, input: OrderCreateInput): number {
    const customer = getCustomer(db, input.customerId);
    if (!customer) throw bizError('CUSTOMER_NOT_FOUND');
    if (customer.deletedAt) throw bizError('CUSTOMER_DELETED');
    if (!isValidDateStr(input.orderDate)) throw bizError('VALIDATION', '订单日期格式不正确');
    if (input.expectedDeliveryDate && !isValidDateStr(input.expectedDeliveryDate))
      throw bizError('VALIDATION', '预计交货日期格式不正确');
    if (!getStatus(db, input.statusId)) throw bizError('VALIDATION', '订单状态不存在');
    if (input.items.length > 50) throw bizError('VALIDATION', '单订单最多 50 条物料明细');
    for (const it of input.items) {
      if (!it.chipModel || !it.chipModel.trim()) throw bizError('VALIDATION', '芯片型号不能为空');
      if (!Number.isInteger(it.qty) || it.qty < 0)
        throw bizError('VALIDATION', '需求数量必须为非负整数');
    }

    const existingNos = getAllOrderNos(db);
    let orderNo: string;
    if (input.orderNo && input.orderNo.trim()) {
      orderNo = input.orderNo.trim();
      if (existingNos.includes(orderNo)) throw bizError('ORDER_NO_DUPLICATE');
    } else {
      orderNo = nextOrderNo(getOrderNoConfig(db), new Date(), existingNos);
    }

    const items: ItemInput[] = input.items.map((it) => ({
      ...it,
      chipModel: it.chipModel.trim(),
      subtotal: itemSubtotal(it),
    }));
    const auto = autoTotal(items);
    const amountManual = !!input.amountManual;
    const totalAmount = effectiveTotal(amountManual, input.totalAmount, auto);
    const exchangeRate = input.currencyId != null ? (getRate(db, input.currencyId)?.rate ?? 1) : null;

    return withTransaction(db, () => {
      const orderId = insertOrder(db, {
        orderNo,
        customerId: input.customerId,
        orderDate: input.orderDate,
        typeId: input.typeId ?? null,
        statusId: input.statusId,
        expectedDeliveryDate: input.expectedDeliveryDate ?? null,
        actualDeliveryDate: input.actualDeliveryDate ?? null,
        currencyId: input.currencyId ?? null,
        exchangeRate,
        totalAmount,
        amountManual,
        paymentMethodId: input.paymentMethodId ?? null,
        owner: input.owner ?? null,
        isKey: !!input.isKey,
        remark: input.remark ?? null,
      });
      if (items.length > 0) replaceItems(db, orderId, items);
      generateTemplateNodes(db, orderId, input.owner ?? null);
      return orderId;
    });
  },

  update(db: DatabaseSync, id: number, input: Partial<OrderCreateInput>): void {
    const existing = getOrder(db, id);
    if (!existing) throw bizError('ORDER_NOT_FOUND');
    const patch: Partial<OrderInput> = {};

    if (input.customerId !== undefined) {
      const customer = getCustomer(db, input.customerId);
      if (!customer || customer.deletedAt) throw bizError('CUSTOMER_NOT_FOUND');
      patch.customerId = input.customerId;
    }
    if (input.orderDate !== undefined) {
      if (!isValidDateStr(input.orderDate)) throw bizError('VALIDATION', '订单日期格式不正确');
      patch.orderDate = input.orderDate;
    }
    if (input.expectedDeliveryDate !== undefined) {
      if (input.expectedDeliveryDate && !isValidDateStr(input.expectedDeliveryDate))
        throw bizError('VALIDATION', '预计交货日期格式不正确');
      patch.expectedDeliveryDate = input.expectedDeliveryDate ?? null;
    }
    if (input.actualDeliveryDate !== undefined) patch.actualDeliveryDate = input.actualDeliveryDate ?? null;
    if (input.statusId !== undefined) {
      if (!getStatus(db, input.statusId)) throw bizError('VALIDATION', '订单状态不存在');
      patch.statusId = input.statusId;
    }
    if (input.typeId !== undefined) patch.typeId = input.typeId;
    if (input.paymentMethodId !== undefined) patch.paymentMethodId = input.paymentMethodId;
    if (input.currencyId !== undefined) {
      patch.currencyId = input.currencyId ?? null;
      patch.exchangeRate = input.currencyId != null ? (getRate(db, input.currencyId)?.rate ?? 1) : null;
    }
    if (input.owner !== undefined) patch.owner = input.owner;
    if (input.isKey !== undefined) patch.isKey = input.isKey;
    if (input.remark !== undefined) patch.remark = input.remark;
    if (input.orderNo !== undefined && input.orderNo && input.orderNo.trim()) {
      const no = input.orderNo.trim();
      const dup = db
        .prepare('SELECT id FROM orders WHERE order_no = ? AND id != ?')
        .get(no, id) as { id: number } | undefined;
      if (dup) throw bizError('ORDER_NO_DUPLICATE');
      patch.orderNo = no;
    }

    withTransaction(db, () => {
      if (input.items !== undefined) {
        if (input.items.length > 50) throw bizError('VALIDATION', '单订单最多 50 条物料明细');
        const items: ItemInput[] = input.items.map((it, i) => ({
          ...it,
          chipModel: it.chipModel.trim(),
          subtotal: itemSubtotal(it),
          sortOrder: i + 1,
        }));
        const auto = autoTotal(items);
        const amountManual = input.amountManual !== undefined ? input.amountManual : existing.amountManual;
        const manualValue = input.totalAmount !== undefined ? input.totalAmount : existing.totalAmount;
        patch.totalAmount = round2(effectiveTotal(amountManual, manualValue, auto));
        patch.amountManual = amountManual;
        replaceItems(db, id, items);
      } else if (input.amountManual !== undefined || input.totalAmount !== undefined) {
        // 只改金额（手改/恢复）而不重提明细：按现有明细重算自动值
        const existingAuto = autoTotal(listItems(db, id));
        const amountManual = input.amountManual !== undefined ? input.amountManual : existing.amountManual;
        const manualValue = input.totalAmount !== undefined ? input.totalAmount : existing.totalAmount;
        patch.totalAmount = round2(effectiveTotal(amountManual, manualValue, existingAuto));
        patch.amountManual = amountManual;
      }
      updateOrder(db, id, patch);
    });
  },

  /** 一键恢复自动汇总（PRD 4.3.1） */
  restoreAutoAmount(db: DatabaseSync, id: number): void {
    const existing = getOrder(db, id);
    if (!existing) throw bizError('ORDER_NOT_FOUND');
    const auto = autoTotal(listItems(db, id));
    updateOrder(db, id, { totalAmount: auto, amountManual: false });
  },

  /** 删除订单：级联明细/节点/跟进/附件记录；返回附件文件路径由上层清理 */
  delete(db: DatabaseSync, id: number): { attachmentPaths: string[] } {
    if (!getOrder(db, id)) throw bizError('ORDER_NOT_FOUND');
    const paths = attachmentPathsByOrder(db, id);
    withTransaction(db, () => {
      deleteOrder(db, id);
    });
    return { attachmentPaths: paths };
  },

  get(db: DatabaseSync, id: number): OrderDetail {
    const o = getOrder(db, id);
    if (!o) throw bizError('ORDER_NOT_FOUND');
    return { ...o, items: listItems(db, id), nodes: listNodesByOrder(db, id) };
  },

  list(db: DatabaseSync, filter: OrderFilter): Page<OrderListRow> {
    return listOrders(db, filter);
  },

  /** 订单详情用：状态是否终态（自动完结联动判断） */
  isTerminal(db: DatabaseSync, id: number): boolean {
    const o = getOrder(db, id);
    if (!o) throw bizError('ORDER_NOT_FOUND');
    return !!getStatus(db, o.statusId)?.isTerminal;
  },
};
