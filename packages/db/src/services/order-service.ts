import type { DatabaseSync } from 'node:sqlite';
import type { Order, OrderItem, OrderListRow, OrderNode, Page, WechatGroup } from '@erp/shared';
import { bizError, isValidDateStr, round2 } from '@erp/shared';
import {
  attachmentPathsByOrder,
  deleteOrder,
  getAllOrderNos,
  getCustomer,
  getOrder,
  getOrderNoConfig,
  getStatus,
  insertOrder,
  listGroupsByOrder,
  listItems,
  listNodesByOrder,
  listOrders,
  listTemplates,
  replaceItems,
  setOrderGroups,
  updateOrder,
  type ItemInput,
  type OrderFilter,
  type OrderInput,
} from '../repos/index.js';
import { withTransaction } from '../connection.js';
import { autoTotal, effectiveTotal, itemSubtotal, nextOrderNo } from '@erp/domain';

export interface OrderCreateInput {
  customerId: number;
  orderDate?: string | null;
  typeId?: number | null;
  statusId?: number | null;
  expectedDeliveryDate?: string | null;
  actualDeliveryDate?: string | null;
  totalAmount?: number | null;
  amountManual?: boolean;
  paymentMethodId?: number | null;
  isKey?: boolean;
  remark?: string | null;
  orderNo?: string | null; // 空则自动生成
  wechatGroupIds?: number[];
  items: ItemInput[];
}

export interface OrderDetail extends Order {
  items: OrderItem[];
  nodes: OrderNode[];
  wechatGroups: WechatGroup[];
}

/** 新建订单时按启用模板顺序生成节点（PRD 4.4.1） */
export function generateTemplateNodes(db: DatabaseSync, orderId: number): number[] {
  const templates = listTemplates(db, true);
  const stmt = db.prepare(
    'INSERT INTO order_node (order_id, template_id, name, status, sort_order) VALUES (?, ?, ?, ?, ?)',
  );
  const ids: number[] = [];
  templates.forEach((t, i) => {
    const r = stmt.run(orderId, t.id, t.name, 'pending', i + 1);
    ids.push(Number(r.lastInsertRowid));
  });
  return ids;
}

function validateGroupIds(db: DatabaseSync, customerId: number, groupIds: number[]): void {
  if (groupIds.length === 0) return;
  const rows = db
    .prepare(
      `SELECT id FROM customer_wechat_group WHERE customer_id = ? AND id IN (${groupIds
        .map(() => '?')
        .join(',')})`,
    )
    .all(customerId, ...groupIds) as { id: number }[];
  if (rows.length !== groupIds.length) {
    throw bizError('VALIDATION', '沟通微信群必须属于该订单的客户');
  }
}

export const orderService = {
  create(db: DatabaseSync, input: OrderCreateInput): number {
    const customer = getCustomer(db, input.customerId);
    if (!customer) throw bizError('CUSTOMER_NOT_FOUND');
    if (customer.deletedAt) throw bizError('CUSTOMER_DELETED');
    if (input.orderDate && !isValidDateStr(input.orderDate))
      throw bizError('VALIDATION', '订单日期格式不正确');
    if (input.expectedDeliveryDate && !isValidDateStr(input.expectedDeliveryDate))
      throw bizError('VALIDATION', '预计交货日期格式不正确');
    if (input.statusId != null && !getStatus(db, input.statusId))
      throw bizError('VALIDATION', '订单状态不存在');
    if (input.items.length > 50) throw bizError('VALIDATION', '单订单最多 50 条物料明细');
    for (const it of input.items) {
      if (!it.chipModel || !it.chipModel.trim()) throw bizError('VALIDATION', '芯片型号不能为空');
      if (!Number.isInteger(it.qty) || it.qty < 0)
        throw bizError('VALIDATION', '需求数量必须为非负整数');
    }
    const groupIds = input.wechatGroupIds ?? [];
    validateGroupIds(db, input.customerId, groupIds);

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

    return withTransaction(db, () => {
      const orderId = insertOrder(db, {
        orderNo,
        customerId: input.customerId,
        orderDate: input.orderDate ?? null,
        typeId: input.typeId ?? null,
        statusId: input.statusId ?? null,
        expectedDeliveryDate: input.expectedDeliveryDate ?? null,
        actualDeliveryDate: input.actualDeliveryDate ?? null,
        totalAmount,
        amountManual,
        paymentMethodId: input.paymentMethodId ?? null,
        isKey: !!input.isKey,
        remark: input.remark ?? null,
      });
      if (items.length > 0) replaceItems(db, orderId, items);
      generateTemplateNodes(db, orderId);
      if (groupIds.length > 0) setOrderGroups(db, orderId, groupIds);
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
      if (input.orderDate && !isValidDateStr(input.orderDate))
        throw bizError('VALIDATION', '订单日期格式不正确');
      patch.orderDate = input.orderDate ?? null;
    }
    if (input.expectedDeliveryDate !== undefined) {
      if (input.expectedDeliveryDate && !isValidDateStr(input.expectedDeliveryDate))
        throw bizError('VALIDATION', '预计交货日期格式不正确');
      patch.expectedDeliveryDate = input.expectedDeliveryDate ?? null;
    }
    if (input.actualDeliveryDate !== undefined) patch.actualDeliveryDate = input.actualDeliveryDate ?? null;
    if (input.statusId !== undefined) {
      if (input.statusId != null && !getStatus(db, input.statusId))
        throw bizError('VALIDATION', '订单状态不存在');
      patch.statusId = input.statusId ?? null;
    }
    if (input.typeId !== undefined) patch.typeId = input.typeId;
    if (input.paymentMethodId !== undefined) patch.paymentMethodId = input.paymentMethodId;
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
    if (input.wechatGroupIds !== undefined) {
      const cid = input.customerId ?? existing.customerId;
      validateGroupIds(db, cid, input.wechatGroupIds);
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
      if (input.wechatGroupIds !== undefined) {
        setOrderGroups(db, id, input.wechatGroupIds);
      }
    });
  },

  /** 一键恢复自动汇总（PRD 4.3.1） */
  restoreAutoAmount(db: DatabaseSync, id: number): void {
    const existing = getOrder(db, id);
    if (!existing) throw bizError('ORDER_NOT_FOUND');
    const auto = autoTotal(listItems(db, id));
    updateOrder(db, id, { totalAmount: auto, amountManual: false });
  },

  /** 删除订单：级联明细/节点/跟进/附件/微信群关联；返回附件文件路径由上层清理 */
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
    return {
      ...o,
      items: listItems(db, id),
      nodes: listNodesByOrder(db, id),
      wechatGroups: listGroupsByOrder(db, id),
    };
  },

  list(db: DatabaseSync, filter: OrderFilter): Page<OrderListRow> {
    return listOrders(db, filter);
  },

  /** 订单详情用：状态是否终态（未填写视为未结束） */
  isTerminal(db: DatabaseSync, id: number): boolean {
    const o = getOrder(db, id);
    if (!o) throw bizError('ORDER_NOT_FOUND');
    return o.statusId != null ? !!getStatus(db, o.statusId)?.isTerminal : false;
  },
};
