import { describe, it, beforeEach } from 'node:test';
import { expect } from '../test-utils.ts';
import type { DatabaseSync } from 'node:sqlite';
import {
  insertOrder,
  getOrder,
  updateOrder,
  deleteOrder,
  setStatus,
  listOrders,
  listItems,
  replaceItems,
  getAllOrderNos,
  listGroupsByOrder,
  setOrderGroups,
  listOrderAttachments,
  addOrderAttachment,
  orderAttachmentPaths,
} from '@erp/db';
import {
  createTestDb,
  seedCustomer,
  seedOrder,
  seedWechatGroup,
  statusByName,
  dictIdByName,
} from './helpers.ts';

const TODAY = '2026-10-28';

describe('订单仓储', () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = createTestDb();
  });

  it('新增与读取（日期/状态可空、金额、手改标记）', () => {
    const cid = seedCustomer(db);
    const id = insertOrder(db, {
      orderNo: 'XS202610280001',
      customerId: cid,
      orderDate: null,
      typeId: dictIdByName(db, 'order_type', '批量订单'),
      statusId: null,
      expectedDeliveryDate: '2026-11-10',
      actualDeliveryDate: null,
      totalAmount: 100,
      amountManual: true,
      paymentMethodId: null,
      isKey: true,
      remark: null,
    });
    const o = getOrder(db, id)!;
    expect(o.orderNo).toBe('XS202610280001');
    expect(o.orderDate).toBeNull();
    expect(o.statusId).toBeNull();
    expect(o.amountManual).toBe(true);
    expect(o.isKey).toBe(true);
  });

  it('订单编号全局唯一', () => {
    const cid = seedCustomer(db);
    insertOrder(db, { orderNo: 'A1', customerId: cid, orderDate: '2026-10-28', statusId: 1 });
    expect(() =>
      insertOrder(db, { orderNo: 'A1', customerId: cid, orderDate: '2026-10-28', statusId: 1 }),
    ).toThrow(/UNIQUE/);
  });

  it('列表筛选：客户/状态/类型/日期范围', () => {
    const c1 = seedCustomer(db, { name: '客户一' });
    const c2 = seedCustomer(db, { name: '客户二' });
    const inProg = statusByName(db, '进行中');
    const done = statusByName(db, '已完结');
    const tBatch = dictIdByName(db, 'order_type', '批量订单');
    const tSample = dictIdByName(db, 'order_type', '样品单');
    seedOrder(db, { customerId: c1, statusId: inProg, typeId: tBatch, orderDate: '2026-10-01' });
    seedOrder(db, { customerId: c1, statusId: done, typeId: tBatch, orderDate: '2026-10-20' });
    seedOrder(db, { customerId: c2, statusId: inProg, typeId: tSample, orderDate: '2026-09-15' });

    expect(listOrders(db, { page: 1, pageSize: 10, today: TODAY }).total).toBe(3);
    expect(listOrders(db, { customerId: c1, page: 1, pageSize: 10, today: TODAY }).total).toBe(2);
    expect(listOrders(db, { statusId: inProg, page: 1, pageSize: 10, today: TODAY }).total).toBe(2);
    expect(listOrders(db, { typeId: tSample, page: 1, pageSize: 10, today: TODAY }).total).toBe(1);
    expect(
      listOrders(db, { dateFrom: '2026-10-01', dateTo: '2026-10-31', page: 1, pageSize: 10, today: TODAY }).total,
    ).toBe(2);
  });

  it('关键字搜索：订单编号与芯片型号（跨明细表）', () => {
    const cid = seedCustomer(db);
    const o1 = seedOrder(db, { customerId: cid, orderNo: 'XS202610280001' });
    const o2 = seedOrder(db, { customerId: cid, orderNo: 'XS202610280002' });
    replaceItems(db, o1, [
      { chipModel: 'STM32F103C8T6', brand: null, packageSpec: null, qty: 100, unitPrice: 10, subtotal: 1000, customerPn: null, remark: null },
    ]);
    const byNo = listOrders(db, { search: '202610280002', page: 1, pageSize: 10, today: TODAY });
    expect(byNo.total).toBe(1);
    expect(byNo.rows[0].id).toBe(o2);
    const byChip = listOrders(db, { search: 'stm32f103', page: 1, pageSize: 10, today: TODAY });
    expect(byChip.total).toBe(1);
    expect(byChip.rows[0].id).toBe(o1);
  });

  it('逾期标记与排序：仅非终态 + 交期已过，逾期天数正确', () => {
    const cid = seedCustomer(db);
    const inProg = statusByName(db, '进行中');
    const done = statusByName(db, '已完结');
    seedOrder(db, { customerId: cid, statusId: inProg, expectedDeliveryDate: '2026-10-01' }); // 逾期 27 天
    seedOrder(db, { customerId: cid, statusId: done, expectedDeliveryDate: '2026-10-01' }); // 终态不逾期
    seedOrder(db, { customerId: cid, statusId: inProg, expectedDeliveryDate: '2026-11-01' }); // 未到期
    seedOrder(db, { customerId: cid, statusId: inProg, expectedDeliveryDate: null });

    const overdue = listOrders(db, { onlyOverdue: true, page: 1, pageSize: 10, today: TODAY });
    expect(overdue.total).toBe(1);
    expect(overdue.rows[0].daysOverdue).toBe(27);

    const all = listOrders(db, { page: 1, pageSize: 10, today: TODAY });
    const days = all.rows.map((r) => r.daysOverdue).sort((a, b) => b - a);
    expect(days[0]).toBe(27);
  });

  it('状态未填写：显示“未填写”且视为非终态', () => {
    const cid = seedCustomer(db);
    const oid = seedOrder(db, { customerId: cid, statusId: null, expectedDeliveryDate: '2026-10-01' });
    const rows = listOrders(db, { page: 1, pageSize: 10, today: TODAY }).rows;
    const row = rows.find((r) => r.id === oid)!;
    expect(row.statusName).toBe('未填写');
    expect(row.statusColor).toBe('#BFBFBF');
    expect(row.statusIsTerminal).toBe(false);
    expect(row.daysOverdue).toBe(27); // 未填写状态仍参与逾期判断
    const overdue = listOrders(db, { onlyOverdue: true, page: 1, pageSize: 10, today: TODAY });
    expect(overdue.total).toBe(1);
  });

  it('排序：按订单日期、金额、预计交期升降序', () => {
    const cid = seedCustomer(db);
    seedOrder(db, { customerId: cid, orderNo: 'A1', orderDate: '2026-10-01', totalAmount: 100, expectedDeliveryDate: '2026-11-01' });
    seedOrder(db, { customerId: cid, orderNo: 'A2', orderDate: '2026-10-20', totalAmount: 300, expectedDeliveryDate: '2026-10-25' });
    seedOrder(db, { customerId: cid, orderNo: 'A3', orderDate: '2026-10-10', totalAmount: 200, expectedDeliveryDate: '2026-10-30' });

    const byDate = listOrders(db, { sortField: 'order_date', sortDir: 'asc', page: 1, pageSize: 10, today: TODAY });
    expect(byDate.rows.map((r) => r.orderNo)).toEqual(['A1', 'A3', 'A2']);
    const byAmount = listOrders(db, { sortField: 'total_amount', sortDir: 'desc', page: 1, pageSize: 10, today: TODAY });
    expect(byAmount.rows.map((r) => r.orderNo)).toEqual(['A2', 'A3', 'A1']);
    const byDelivery = listOrders(db, { sortField: 'expected_delivery_date', sortDir: 'asc', page: 1, pageSize: 10, today: TODAY });
    expect(byDelivery.rows.map((r) => r.orderNo)).toEqual(['A2', 'A3', 'A1']);
  });

  it('已删除客户：订单仍可查，标记 customerDeleted', () => {
    const cid = seedCustomer(db, { name: '将被删除的客户' });
    seedOrder(db, { customerId: cid });
    db.prepare("UPDATE customer SET deleted_at = '2026-10-28' WHERE id = ?").run(cid);
    const r = listOrders(db, { page: 1, pageSize: 10, today: TODAY });
    expect(r.total).toBe(1);
    expect(r.rows[0].customerDeleted).toBe(true);
    expect(r.rows[0].customerName).toBe('将被删除的客户');
  });

  it('物料明细替换式保存与读取', () => {
    const cid = seedCustomer(db);
    const oid = seedOrder(db, { customerId: cid });
    replaceItems(db, oid, [
      { chipModel: 'A', brand: 'ST', packageSpec: 'LQFP48', qty: 10, unitPrice: 1.5, subtotal: 15, customerPn: 'PN1', remark: null },
      { chipModel: 'B', brand: null, packageSpec: null, qty: 20, unitPrice: 0.5, subtotal: 10, customerPn: null, remark: null },
    ]);
    const items = listItems(db, oid);
    expect(items).toHaveLength(2);
    expect(items[0].sortOrder).toBe(1);
    expect(items[1].sortOrder).toBe(2);
    // 再次替换：旧的被清空
    replaceItems(db, oid, [{ chipModel: 'C', brand: null, packageSpec: null, qty: 1, unitPrice: 9, subtotal: 9, customerPn: null, remark: null }]);
    expect(listItems(db, oid).map((i) => i.chipModel)).toEqual(['C']);
  });

  it('删除订单级联删除明细与节点（外键）', () => {
    const cid = seedCustomer(db);
    const oid = seedOrder(db, { customerId: cid });
    replaceItems(db, oid, [{ chipModel: 'A', brand: null, packageSpec: null, qty: 1, unitPrice: 1, subtotal: 1, customerPn: null, remark: null }]);
    db.prepare('INSERT INTO order_node (order_id, name, status) VALUES (?, ?, ?)').run(oid, '节点1', 'pending');
    expect(deleteOrder(db, oid)).toBe(true);
    const items = db.prepare('SELECT COUNT(*) AS c FROM order_item WHERE order_id = ?').get(oid) as { c: number };
    const nodes = db.prepare('SELECT COUNT(*) AS c FROM order_node WHERE order_id = ?').get(oid) as { c: number };
    expect(items.c).toBe(0);
    expect(nodes.c).toBe(0);
  });

  it('getAllOrderNos / setStatus / updateOrder', () => {
    const cid = seedCustomer(db);
    const oid = seedOrder(db, { customerId: cid, orderNo: 'NO1' });
    seedOrder(db, { customerId: cid, orderNo: 'NO2' });
    expect(getAllOrderNos(db).sort()).toEqual(['NO1', 'NO2']);
    expect(setStatus(db, oid, statusByName(db, '已发货'))).toBe(true);
    expect(getOrder(db, oid)!.statusId).toBe(statusByName(db, '已发货'));
    expect(updateOrder(db, oid, { remark: '新备注', isKey: true })).toBe(true);
    const o = getOrder(db, oid)!;
    expect(o.remark).toBe('新备注');
    expect(o.isKey).toBe(true);
  });

  it('订单关联微信群（设置/读取/删除级联）', () => {
    const cid = seedCustomer(db);
    const g1 = seedWechatGroup(db, cid, '商务交流群');
    const g2 = seedWechatGroup(db, cid, '研发交流群');
    const oid = seedOrder(db, { customerId: cid });
    setOrderGroups(db, oid, [g1, g2]);
    const groups = listGroupsByOrder(db, oid);
    expect(groups.map((g) => g.name)).toEqual(['商务交流群', '研发交流群']);
    // 覆盖式设置
    setOrderGroups(db, oid, [g2]);
    expect(listGroupsByOrder(db, oid)).toHaveLength(1);
    // 删除订单后关联清空
    deleteOrder(db, oid);
    expect(listGroupsByOrder(db, oid)).toHaveLength(0);
  });

  it('订单文档：添加/读取/路径收集/删除级联', () => {
    const cid = seedCustomer(db);
    const oid = seedOrder(db, { customerId: cid });
    addOrderAttachment(db, { orderId: oid, originalName: '合同.pdf', storedPath: 'attachments/1/order/a.pdf', size: 10 });
    addOrderAttachment(db, { orderId: oid, originalName: '图片.png', storedPath: 'attachments/1/order/b.png', size: 20 });
    const docs = listOrderAttachments(db, oid);
    expect(docs).toHaveLength(2);
    expect(docs[0].originalName).toBe('合同.pdf');
    expect(orderAttachmentPaths(db, oid).sort()).toEqual(['attachments/1/order/a.pdf', 'attachments/1/order/b.png']);
    deleteOrder(db, oid);
    expect(listOrderAttachments(db, oid)).toHaveLength(0);
  });
});
