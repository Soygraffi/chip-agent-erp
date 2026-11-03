import type { DatabaseSync } from 'node:sqlite';
import type { ItemProgressNode, Order, OrderItem, OrderListRow, Page } from '@erp/shared';
import { dateDiffDays } from '@erp/shared';
import { escapeLike } from './customer-repo.js';

/** 状态未填写时的展示值（PRD V1.2：订单状态可选） */
export const UNFILLED_STATUS_NAME = '未填写';
export const UNFILLED_STATUS_COLOR = '#BFBFBF';

export interface OrderInput {
  orderNo: string;
  customerId: number;
  orderDate: string | null;
  typeId: number | null;
  statusId: number | null;
  expectedDeliveryDate: string | null;
  actualDeliveryDate: string | null;
  orderQty: number | null;
  totalAmount: number | null;
  amountManual: boolean;
  paymentMethodId: number | null;
  isKey: boolean;
  remark: string | null;
}

export function insertOrder(db: DatabaseSync, o: OrderInput): number {
  const r = db
    .prepare(
      'INSERT INTO orders (order_no, customer_id, order_date, type_id, status_id, expected_delivery_date, ' +
        'actual_delivery_date, order_qty, total_amount, amount_manual, payment_method_id, is_key, remark) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      o.orderNo,
      o.customerId,
      o.orderDate ?? null,
      o.typeId ?? null,
      o.statusId ?? null,
      o.expectedDeliveryDate ?? null,
      o.actualDeliveryDate ?? null,
      o.orderQty ?? null,
      o.totalAmount ?? null,
      o.amountManual ? 1 : 0,
      o.paymentMethodId ?? null,
      o.isKey ? 1 : 0,
      o.remark ?? null,
    );
  return Number(r.lastInsertRowid);
}

export function updateOrder(db: DatabaseSync, id: number, patch: Partial<OrderInput>): boolean {
  const map: Record<string, string> = {
    orderNo: 'order_no',
    customerId: 'customer_id',
    orderDate: 'order_date',
    typeId: 'type_id',
    statusId: 'status_id',
    expectedDeliveryDate: 'expected_delivery_date',
    actualDeliveryDate: 'actual_delivery_date',
    orderQty: 'order_qty',
    totalAmount: 'total_amount',
    paymentMethodId: 'payment_method_id',
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
  if (patch.amountManual !== undefined) {
    fields.push('amount_manual = ?');
    args.push(patch.amountManual ? 1 : 0);
  }
  if (patch.isKey !== undefined) {
    fields.push('is_key = ?');
    args.push(patch.isKey ? 1 : 0);
  }
  if (fields.length === 0) return false;
  fields.push("updated_at = datetime('now','localtime')");
  args.push(id);
  return db.prepare(`UPDATE orders SET ${fields.join(', ')} WHERE id = ?`).run(...args).changes > 0;
}

export function setStatus(db: DatabaseSync, id: number, statusId: number): boolean {
  return (
    db
      .prepare(
        "UPDATE orders SET status_id = ?, updated_at = datetime('now','localtime') WHERE id = ?",
      )
      .run(statusId, id).changes > 0
  );
}

const ORDER_COLS = `o.id, o.order_no AS orderNo, o.customer_id AS customerId, o.order_date AS orderDate,
  o.type_id AS typeId, o.status_id AS statusId, o.expected_delivery_date AS expectedDeliveryDate,
  o.actual_delivery_date AS actualDeliveryDate, o.order_qty AS orderQty, o.sort_order AS sortOrder,
  o.total_amount AS totalAmount,
  o.amount_manual AS amountManual, o.payment_method_id AS paymentMethodId, o.is_key AS isKey,
  o.remark, o.created_at AS createdAt, o.updated_at AS updatedAt`;

export function getOrder(db: DatabaseSync, id: number): Order | null {
  const r = db
    .prepare(`SELECT ${ORDER_COLS} FROM orders o WHERE o.id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  if (!r) return null;
  return { ...r, amountManual: !!r.amountManual, isKey: !!r.isKey } as Order;
}

export function deleteOrder(db: DatabaseSync, id: number): boolean {
  return db.prepare('DELETE FROM orders WHERE id = ?').run(id).changes > 0;
}

export function getAllOrderNos(db: DatabaseSync): string[] {
  const rows = db.prepare('SELECT order_no FROM orders').all() as { order_no: string }[];
  return rows.map((r) => r.order_no);
}

export interface OrderFilter {
  search?: string; // 订单编号 / 芯片型号
  customerId?: number | null;
  statusId?: number | null;
  typeId?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  deliveryFrom?: string | null;
  deliveryTo?: string | null;
  onlyOverdue?: boolean;
  onlyKey?: boolean;
  /** 存在「未下单」节点的订单排到最后（首页看板） */
  noneLast?: boolean;
  sortField?: 'order_date' | 'total_amount' | 'expected_delivery_date' | 'progress' | 'manual';
  sortDir?: 'asc' | 'desc';
  page: number;
  pageSize: number;
  today: string; // 用于计算逾期天数
}

export function listOrders(db: DatabaseSync, filter: OrderFilter): Page<OrderListRow> {
  const where: string[] = ['1=1'];
  const args: (string | number | null)[] = [];
  if (filter.search) {
    where.push(
      "(o.order_no LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM order_item i WHERE i.order_id = o.id AND i.chip_model LIKE ? ESCAPE '\\'))",
    );
    const like = `%${escapeLike(filter.search)}%`;
    args.push(like, like);
  }
  if (filter.customerId != null) {
    where.push('o.customer_id = ?');
    args.push(filter.customerId);
  }
  if (filter.statusId != null) {
    where.push('o.status_id = ?');
    args.push(filter.statusId);
  }
  if (filter.typeId != null) {
    where.push('o.type_id = ?');
    args.push(filter.typeId);
  }
  if (filter.dateFrom) {
    where.push('o.order_date >= ?');
    args.push(filter.dateFrom);
  }
  if (filter.dateTo) {
    where.push('o.order_date <= ?');
    args.push(filter.dateTo);
  }
  if (filter.deliveryFrom) {
    where.push('o.expected_delivery_date >= ?');
    args.push(filter.deliveryFrom);
  }
  if (filter.deliveryTo) {
    where.push('o.expected_delivery_date <= ?');
    args.push(filter.deliveryTo);
  }
  if (filter.onlyOverdue) {
    where.push(
      '(s.is_terminal = 0 OR o.status_id IS NULL) AND o.expected_delivery_date IS NOT NULL AND o.expected_delivery_date < ?',
    );
    args.push(filter.today);
  }
  if (filter.onlyKey) {
    where.push('o.is_key = 1 AND (s.is_terminal = 0 OR o.status_id IS NULL)');
  }
  const whereSql = where.join(' AND ');

  const total = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM orders o LEFT JOIN order_status s ON s.id = o.status_id WHERE ${whereSql}`,
      )
      .get(...args) as { c: number }
  ).c;

  const sortMap = {
    order_date: 'o.order_date',
    total_amount: 'o.total_amount',
    expected_delivery_date: 'o.expected_delivery_date',
    progress: "COALESCE((SELECT AVG(i.progress) FROM order_item i WHERE i.order_id = o.id), 0)",
    manual: 'o.sort_order',
  };
  const sortCol = sortMap[filter.sortField ?? 'order_date'];
  const dir = filter.sortDir === 'asc' ? 'ASC' : 'DESC';
  // 可选：把存在「未下单」节点的订单排到最后（首页看板用）
  const noneRank = filter.noneLast
    ? "((SELECT COUNT(*) FROM order_node n WHERE n.order_id = o.id AND n.status = 'none') > 0) ASC, "
    : '';
  const orderBy = `${noneRank}${sortCol} ${dir}, o.id ${dir}`;

  const rows = db
    .prepare(
      `SELECT ${ORDER_COLS},
        c.name AS customerName, c.deleted_at AS customerDeleted, c.contact AS customerContact,
        t.name AS typeName, s.name AS statusName, s.color AS statusColor,
        s.is_terminal AS statusIsTerminal,
        COALESCE((SELECT AVG(i.progress) FROM order_item i WHERE i.order_id = o.id), 0) AS stage
       FROM orders o
       JOIN customer c ON c.id = o.customer_id
       LEFT JOIN order_status s ON s.id = o.status_id
       LEFT JOIN dict_item t ON t.id = o.type_id
       WHERE ${whereSql}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
    )
    .all(...args, filter.pageSize, (filter.page - 1) * filter.pageSize)
    .map((r) => {
      const row = {
        ...r,
        amountManual: !!r.amountManual,
        isKey: !!r.isKey,
        statusIsTerminal: !!r.statusIsTerminal,
        customerDeleted: !!r.customerDeleted,
        customerContact: (r.customerContact as string | null) ?? null,
        statusName: (r.statusName as string | null) ?? UNFILLED_STATUS_NAME,
        statusColor: (r.statusColor as string | null) ?? UNFILLED_STATUS_COLOR,
        typeName: (r.typeName as string | null) ?? null,
      } as OrderListRow;
      row.daysOverdue = computeOverdueDays(row, filter.today);
      return row;
    });
  return { rows, total };
}

function computeOverdueDays(row: OrderListRow, today: string): number {
  if (row.statusIsTerminal || !row.expectedDeliveryDate) return 0;
  if (row.expectedDeliveryDate < today) return dateDiffDays(today, row.expectedDeliveryDate);
  return 0;
}

/* ---------------- order_item ---------------- */

export interface ItemInput {
  chipModel: string;
  brand: string | null;
  packageSpec: string | null;
  qty: number;
  unitPrice: number | null;
  subtotal: number | null;
  customerPn: string | null;
  remark: string | null;
  /** V1.3：物料库关联与价格口径；V1.4：进货价/出货价各自含税标记 */
  materialId?: number | null;
  materialCode?: string | null;
  materialName?: string | null;
  purchasePrice?: number | null;
  priceTaxIncluded?: boolean;
  purchaseTaxIncluded?: boolean;
  taxRate?: number;
  /** V1.9：该物料由哪家供应商提供 */
  supplierId?: number | null;
  /** V1.10：实际交货日期与时间轴阶段 */
  actualDeliveryDate?: string | null;
  stage?: number;
  /** V1.10.6：该明细自己的进度节点 */
  progressNodes?: ItemProgressNode[] | null;
}

function parseProgressNodes(v: unknown): ItemProgressNode[] | null {
  if (typeof v !== 'string' || !v) return null;
  try {
    const arr = JSON.parse(v) as unknown;
    if (!Array.isArray(arr)) return null;
    const nodes: ItemProgressNode[] = [];
    for (const n of arr) {
      if (!n || typeof n !== 'object') continue;
      const rec = n as Record<string, unknown>;
      if (typeof rec.name !== 'string' || typeof rec.status !== 'string') continue;
      nodes.push({ name: rec.name, status: rec.status as ItemProgressNode['status'] });
    }
    return nodes.length > 0 ? nodes : null;
  } catch {
    return null;
  }
}

function serializeProgressNodes(nodes: ItemProgressNode[] | null | undefined): string | null {
  if (!nodes || nodes.length === 0) return null;
  return JSON.stringify(nodes.map((n) => ({ name: n.name, status: n.status })));
}

/** 根据节点状态推导当前阶段序号（第一个未完成节点；全部完成则为节点数） */
function stageFromNodes(nodes: ItemProgressNode[], fallback: number): number {
  if (nodes.length === 0) return fallback;
  const idx = nodes.findIndex((n) => n.status !== 'done');
  return idx === -1 ? nodes.length : idx;
}

export function listItems(db: DatabaseSync, orderId: number): OrderItem[] {
  return db
    .prepare(
      'SELECT i.id, i.order_id AS orderId, i.material_id AS materialId, i.material_code AS materialCode, ' +
        'i.material_name AS materialName, i.chip_model AS chipModel, i.brand, i.package_spec AS packageSpec, ' +
        'i.qty, i.unit_price AS unitPrice, i.purchase_price AS purchasePrice, i.price_tax_included AS priceTaxIncluded, ' +
        'i.purchase_tax_included AS purchaseTaxIncluded, i.tax_rate AS taxRate, i.subtotal, i.customer_pn AS customerPn, ' +
        'i.remark, i.sort_order AS sortOrder, i.supplier_id AS supplierId, s.name AS supplierName, ' +
        'i.actual_delivery_date AS actualDeliveryDate, i.progress AS stage, i.progress_nodes AS progressNodes ' +
        'FROM order_item i LEFT JOIN supplier s ON s.id = i.supplier_id WHERE i.order_id = ? ORDER BY i.sort_order, i.id',
    )
    .all(orderId)
    .map(
      (r) =>
        ({
          ...r,
          materialId: (r.materialId as number | null) ?? null,
          materialCode: (r.materialCode as string | null) ?? null,
          materialName: (r.materialName as string | null) ?? null,
          brand: (r.brand as string | null) ?? null,
          supplierId: (r.supplierId as number | null) ?? null,
          supplierName: (r.supplierName as string | null) ?? null,
          packageSpec: (r.packageSpec as string | null) ?? null,
          purchasePrice: (r.purchasePrice as number | null) ?? null,
          priceTaxIncluded: !!(r.priceTaxIncluded as number | null ?? 1),
          purchaseTaxIncluded: r.purchaseTaxIncluded == null ? true : !!(r.purchaseTaxIncluded as number | null),
          taxRate: Number(r.taxRate ?? 13),
          customerPn: (r.customerPn as string | null) ?? null,
          remark: (r.remark as string | null) ?? null,
          actualDeliveryDate: (r.actualDeliveryDate as string | null) ?? null,
          stage: Number(r.stage ?? 0),
          progressNodes: parseProgressNodes(r.progressNodes),
        }) as OrderItem,
    );
}

export function replaceItems(db: DatabaseSync, orderId: number, items: ItemInput[]): void {
  db.prepare('DELETE FROM order_item WHERE order_id = ?').run(orderId);
  const stmt = db.prepare(
    'INSERT INTO order_item (order_id, material_id, material_code, material_name, chip_model, brand, ' +
      'package_spec, qty, unit_price, purchase_price, price_tax_included, purchase_tax_included, tax_rate, subtotal, ' +
      'customer_pn, remark, sort_order, supplier_id, actual_delivery_date, progress, progress_nodes) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  items.forEach((it, i) => {
    stmt.run(
      orderId,
      it.materialId ?? null,
      it.materialCode ?? null,
      it.materialName ?? null,
      it.chipModel,
      it.brand,
      it.packageSpec,
      it.qty,
      it.unitPrice,
      it.purchasePrice ?? null,
      it.priceTaxIncluded === false ? 0 : 1,
      it.purchaseTaxIncluded === false ? 0 : 1,
      it.taxRate ?? 13,
      it.subtotal,
      it.customerPn,
      it.remark,
      i + 1,
      it.supplierId ?? null,
      it.actualDeliveryDate ?? null,
      it.progressNodes && it.progressNodes.length > 0
        ? stageFromNodes(it.progressNodes, it.stage ?? 0)
        : it.stage ?? 0,
      serializeProgressNodes(it.progressNodes),
    );
  });
}

/** V1.10.1 更新单条明细所处的时间轴阶段（0 起，见 ITEM_STAGES） */
export function updateItemStage(db: DatabaseSync, itemId: number, stage: number): boolean {
  const s = Math.max(0, Math.round(stage));
  return db.prepare('UPDATE order_item SET progress = ? WHERE id = ?').run(s, itemId).changes > 0;
}

/** V1.10.6 保存某条明细自己的进度节点（逐节点名称/状态） */
export function updateItemNodes(
  db: DatabaseSync,
  itemId: number,
  nodes: ItemProgressNode[],
): boolean {
  if (nodes.length === 0) return false;
  const progress = stageFromNodes(nodes, 0);
  return (
    db
      .prepare('UPDATE order_item SET progress = ?, progress_nodes = ? WHERE id = ?')
      .run(progress, serializeProgressNodes(nodes), itemId).changes > 0
  );
}

/** V1.10.1 批量保存订单手动排序（拖动顺序） */
export function reorderOrders(db: DatabaseSync, ids: number[]): void {
  const stmt = db.prepare('UPDATE orders SET sort_order = ? WHERE id = ?');
  ids.forEach((id, i) => stmt.run(i + 1, id));
}