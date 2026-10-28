import { describe, it, beforeEach } from 'node:test';
import { expect } from '../test-utils.ts';
import type { DatabaseSync } from 'node:sqlite';
import { orderService, customerService } from '@erp/db';
import { createTestDb, statusByName, dictIdByName } from '../db/helpers.ts';

function baseInput(db: DatabaseSync) {
  const cid = customerService.create(db, { name: '华强半导体', contact: '张三', phone: '13800000000' });
  return {
    customerId: cid,
    orderDate: '2026-10-28',
    typeId: dictIdByName(db, 'order_type', '批量订单'),
    statusId: statusByName(db, '进行中'),
    expectedDeliveryDate: '2026-11-15',
    currencyId: dictIdByName(db, 'currency', '人民币 CNY'),
    items: [
      { chipModel: 'STM32F103', brand: 'ST', packageSpec: 'LQFP48', qty: 100, unitPrice: 9.5, subtotal: 950, customerPn: null, remark: null },
      { chipModel: 'AMS1117-3.3', brand: null, packageSpec: 'SOT-223', qty: 300, unitPrice: 0.35, subtotal: 105, customerPn: null, remark: null },
    ],
  };
}

describe('订单服务', () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = createTestDb();
  });

  it('创建订单：自动编号、明细小计与总金额、汇率快照、自动生成 10 个节点', () => {
    const input = baseInput(db);
    const id = orderService.create(db, input);
    const detail = orderService.get(db, id);

    expect(detail.orderNo).toBe('XS202610280001');
    expect(detail.items).toHaveLength(2);
    expect(detail.items[0].subtotal).toBe(950);
    expect(detail.items[1].subtotal).toBe(105);
    expect(detail.totalAmount).toBe(1055);
    expect(detail.amountManual).toBe(false);
    expect(detail.exchangeRate).toBe(1);
    // 自动生成 10 个标准节点，顺序 = 模板顺序，全部未开始
    expect(detail.nodes).toHaveLength(10);
    expect(detail.nodes[0].name).toBe('需求沟通');
    expect(detail.nodes[0].status).toBe('pending');
    expect(detail.nodes[9].name).toBe('收款完成');
    expect(detail.nodes.every((n) => n.planTime === null)).toBe(true);
  });

  it('手录编号唯一性；编号留空自动生成（当日递增）', () => {
    const input = baseInput(db);
    orderService.create(db, { ...input, orderNo: 'XH-001' });
    expect(() => orderService.create(db, { ...input, orderNo: 'XH-001' })).toThrowError(/订单编号已存在/);
    const a = orderService.create(db, { ...input, orderNo: null });
    const b = orderService.create(db, { ...input, orderNo: null });
    const d1 = orderService.get(db, a);
    const d2 = orderService.get(db, b);
    expect(d1.orderNo).toBe('XS202610280001');
    expect(d2.orderNo).toBe('XS202610280002');
  });

  it('手改总金额：标记 amountManual，恢复自动汇总', () => {
    const input = baseInput(db);
    const id = orderService.create(db, { ...input, totalAmount: 800, amountManual: true });
    expect(orderService.get(db, id).totalAmount).toBe(800);
    expect(orderService.get(db, id).amountManual).toBe(true);
    orderService.restoreAutoAmount(db, id);
    const d = orderService.get(db, id);
    expect(d.totalAmount).toBe(1055);
    expect(d.amountManual).toBe(false);
  });

  it('美元订单快照汇率', () => {
    const input = baseInput(db);
    const usd = dictIdByName(db, 'currency', '美元 USD');
    const id = orderService.create(db, { ...input, currencyId: usd });
    expect(orderService.get(db, id).exchangeRate).toBe(7.2);
  });

  it('编辑订单：改明细重算金额、改汇率快照、改客户', () => {
    const input = baseInput(db);
    const id = orderService.create(db, input);
    const c2 = customerService.create(db, { name: '深科微电子', contact: '李四', phone: '13900000000' });
    orderService.update(db, id, {
      customerId: c2,
      items: [{ chipModel: 'LM358', brand: null, packageSpec: 'SOP-8', qty: 10, unitPrice: 0.5, subtotal: 5, customerPn: null, remark: null }],
    });
    const d = orderService.get(db, id);
    expect(d.items).toHaveLength(1);
    expect(d.totalAmount).toBe(5);
    expect(d.customerId).toBe(c2);
    // 编辑不动节点
    expect(d.nodes).toHaveLength(10);
  });

  it('校验：50 条明细上限、数量整数、芯片型号必填、日期格式、已删除客户', () => {
    const input = baseInput(db);
    const many = Array.from({ length: 51 }, (_, i) => ({
      chipModel: `C${i}`, brand: null, packageSpec: null, qty: 1, unitPrice: 1, subtotal: 1, customerPn: null, remark: null,
    }));
    expect(() => orderService.create(db, { ...input, items: many })).toThrowError(/最多 50 条/);
    expect(() =>
      orderService.create(db, { ...input, items: [{ chipModel: '', brand: null, packageSpec: null, qty: 1, unitPrice: 1, subtotal: 1, customerPn: null, remark: null }] }),
    ).toThrowError(/芯片型号不能为空/);
    expect(() =>
      orderService.create(db, { ...input, items: [{ chipModel: 'A', brand: null, packageSpec: null, qty: 1.5, unitPrice: 1, subtotal: 1.5, customerPn: null, remark: null }] }),
    ).toThrowError(/非负整数/);
    expect(() => orderService.create(db, { ...input, orderDate: '2026-13-40' })).toThrowError(/订单日期格式不正确/);
    expect(() => orderService.create(db, { ...input, expectedDeliveryDate: 'bad' })).toThrowError(/预计交货日期格式不正确/);
    // 软删除客户的订单创建被拒
    const deleted = customerService.create(db, { name: '将被删除', contact: '张三', phone: '138' });
    customerService.softDelete(db, deleted, '2026-10-28');
    expect(() => orderService.create(db, { ...input, customerId: deleted })).toThrowError(/客户已删除/);
  });

  it('删除订单：返回附件路径、级联删除明细与节点', () => {
    const input = baseInput(db);
    const id = orderService.create(db, input);
    // 挂一个附件记录
    const nodeId = orderService.get(db, id).nodes[0].id;
    db.prepare(
      'INSERT INTO node_attachment (node_id, original_name, stored_path, size) VALUES (?, ?, ?, ?)',
    ).run(nodeId, 'a.pdf', 'attachments/x/a.pdf', 10);
    const r = orderService.delete(db, id);
    expect(r.attachmentPaths).toEqual(['attachments/x/a.pdf']);
    expect(() => orderService.get(db, id)).toThrowError(/订单不存在/);
    const items = db.prepare('SELECT COUNT(*) AS c FROM order_item WHERE order_id = ?').get(id) as { c: number };
    const nodes = db.prepare('SELECT COUNT(*) AS c FROM order_node WHERE order_id = ?').get(id) as { c: number };
    expect(items.c).toBe(0);
    expect(nodes.c).toBe(0);
  });
});
