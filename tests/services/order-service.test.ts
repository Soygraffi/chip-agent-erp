import { describe, it, beforeEach } from 'node:test';
import { expect } from '../test-utils.ts';
import type { DatabaseSync } from 'node:sqlite';
import { orderService, orderAttachmentService, customerService, materialService, wechatService } from '@erp/db';
import { createTestDb, statusByName, dictIdByName, todayOrderNo } from '../db/helpers.ts';

function baseInput(db: DatabaseSync) {
  const cid = customerService.create(db, { name: '华强半导体' });
  return {
    customerId: cid,
    orderDate: '2026-10-28',
    typeId: dictIdByName(db, 'order_type', '批量订单'),
    statusId: statusByName(db, '进行中'),
    expectedDeliveryDate: '2026-11-15',
    items: [
      { chipModel: 'STM32F103', brand: 'ST', packageSpec: 'LQFP48', qty: 100, unitPrice: 9.5, subtotal: 950, customerPn: null, remark: null },
      { chipModel: 'AMS1117-3.3', brand: null, packageSpec: 'SOT-223', qty: 300, unitPrice: 0.35, subtotal: 105, customerPn: null, remark: null },
    ],
  };
}

describe('订单服务（V1.2：日期/状态可选，无币种/负责人）', () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = createTestDb();
  });

  it('创建订单：自动编号、明细小计与总金额、自动生成 10 个节点', () => {
    const input = baseInput(db);
    const id = orderService.create(db, input);
    const detail = orderService.get(db, id);

    expect(detail.orderNo).toBe(todayOrderNo(1));
    expect(detail.items).toHaveLength(2);
    expect(detail.items[0].subtotal).toBe(950);
    expect(detail.items[1].subtotal).toBe(105);
    expect(detail.totalAmount).toBe(1055);
    expect(detail.amountManual).toBe(false);
    // 自动生成 10 个标准节点，顺序 = 模板顺序，全部未开始
    expect(detail.nodes).toHaveLength(10);
    expect(detail.nodes[0].name).toBe('需求沟通');
    expect(detail.nodes[0].status).toBe('pending');
    expect(detail.nodes[9].name).toBe('收款完成');
    expect(detail.nodes.every((n) => n.planTime === null)).toBe(true);
  });

  it('日期/类型/状态均可留空：创建成功，详情显示未填写', () => {
    const input = baseInput(db);
    const id = orderService.create(db, { ...input, orderDate: null, typeId: null, statusId: null });
    const detail = orderService.get(db, id);
    expect(detail.orderDate).toBeNull();
    expect(detail.typeId).toBeNull();
    expect(detail.statusId).toBeNull();
  });

  it('手录编号唯一性；编号留空自动生成（当日递增）', () => {
    const input = baseInput(db);
    orderService.create(db, { ...input, orderNo: 'XH-001' });
    expect(() => orderService.create(db, { ...input, orderNo: 'XH-001' })).toThrowError(/订单编号已存在/);
    const a = orderService.create(db, { ...input, orderNo: null });
    const b = orderService.create(db, { ...input, orderNo: null });
    expect(orderService.get(db, a).orderNo).toBe(todayOrderNo(1));
    expect(orderService.get(db, b).orderNo).toBe(todayOrderNo(2));
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

  it('编辑订单：改明细重算金额、改客户、清空日期', () => {
    const input = baseInput(db);
    const id = orderService.create(db, input);
    const c2 = customerService.create(db, { name: '深科微电子' });
    orderService.update(db, id, {
      customerId: c2,
      orderDate: null,
      items: [{ chipModel: 'LM358', brand: null, packageSpec: 'SOP-8', qty: 10, unitPrice: 0.5, subtotal: 5, customerPn: null, remark: null }],
    });
    const d = orderService.get(db, id);
    expect(d.items).toHaveLength(1);
    expect(d.totalAmount).toBe(5);
    expect(d.customerId).toBe(c2);
    expect(d.orderDate).toBeNull();
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
    const deleted = customerService.create(db, { name: '将被删除' });
    customerService.softDelete(db, deleted, '2026-10-28');
    expect(() => orderService.create(db, { ...input, customerId: deleted })).toThrowError(/客户已删除/);
  });

  it('删除订单：返回附件路径、级联删除明细与节点', () => {
    const input = baseInput(db);
    const id = orderService.create(db, input);
    const nodeId = orderService.get(db, id).nodes[0].id;
    db.prepare(
      'INSERT INTO node_attachment (node_id, original_name, stored_path, size) VALUES (?, ?, ?, ?)',
    ).run(nodeId, 'a.pdf', 'attachments/x/a.pdf', 10);
    orderAttachmentService.add(db, id, { originalName: '合同.pdf', storedPath: 'attachments/1/order/c.pdf', size: 5 });
    const r = orderService.delete(db, id);
    expect(r.attachmentPaths).toEqual(['attachments/x/a.pdf']);
    expect(() => orderService.get(db, id)).toThrowError(/订单不存在/);
    const items = db.prepare('SELECT COUNT(*) AS c FROM order_item WHERE order_id = ?').get(id) as { c: number };
    const nodes = db.prepare('SELECT COUNT(*) AS c FROM order_node WHERE order_id = ?').get(id) as { c: number };
    expect(items.c).toBe(0);
    expect(nodes.c).toBe(0);
  });

  it('V1.5 订单总览：列表行直接带物料明细与进度节点', () => {
    const input = baseInput(db);
    const id = orderService.create(db, input);
    const page = orderService.overview(db, { page: 1, pageSize: 10, today: '2026-10-28' });
    expect(page.total).toBe(1);
    const row = page.rows[0];
    expect(row.id).toBe(id);
    expect(row.items).toHaveLength(2);
    expect(row.nodes).toHaveLength(10);
    expect(row.customerContact).toBeNull();
    // 明细字段齐全，可直接展示物料名称/料号规格/品牌/数量
    expect(row.items[0].chipModel).toBe('STM32F103');
    expect(row.items[0].qty).toBe(100);
  });

  it('V1.7 订单总览包含关联的微信群体名称', () => {
    const cid = customerService.create(db, { name: '群客户' });
    const g1 = wechatService.createGroup(db, cid, { name: '商务交流群' });
    orderService.create(db, { customerId: cid, items: [], wechatGroupIds: [g1] });
    const page = orderService.overview(db, { page: 1, pageSize: 10, today: '2026-10-29' });
    expect(page.rows[0].wechatGroups.map((g) => g.name)).toEqual(['商务交流群']);
  });

  it('V1.6.1 订单明细手输物料自动进入物料库并回填 material_id', () => {
    const input = baseInput(db);
    const id = orderService.create(db, input);
    const detail = orderService.get(db, id);
    // 两行明细都应已关联物料库
    expect(detail.items.every((it) => it.materialId != null)).toBe(true);
    const materials = materialService.list(db, { page: 1, pageSize: 50 }).rows;
    expect(materials).toHaveLength(2);
    const stm32 = materials.find((m) => m.code === 'STM32F103')!;
    expect(stm32).toBeTruthy();
    expect(stm32.name).toBe('STM32F103'); // 无物料名称时用料号规格
    expect(stm32.spec).toBe('STM32F103');
    // 再次下单使用相同编码：复用同一物料，不重复建档
    orderService.create(db, {
      ...input,
      items: [
        { chipModel: 'STM32F103', brand: null, packageSpec: null, qty: 1, unitPrice: 9.5, subtotal: 9.5, customerPn: null, remark: null },
      ],
    });
    expect(materialService.list(db, { page: 1, pageSize: 50 }).total).toBe(2);
  });

  it('V1.6.1 显式指定 materialId 时不覆盖物料主数据', () => {
    const cid = customerService.create(db, { name: '物料客户' });
    const mid = materialService.create(db, { code: 'M-001', name: '已有物料', salePrice: 10 });
    const oid = orderService.create(db, {
      customerId: cid,
      items: [
        {
          materialId: mid,
          chipModel: 'M-001',
          brand: null,
          packageSpec: null,
          qty: 1,
          unitPrice: 12,
          subtotal: 12,
          customerPn: null,
          remark: null,
        },
      ],
    });
    expect(orderService.get(db, oid).items[0].materialId).toBe(mid);
    expect(orderService.get(db, oid).items[0].unitPrice).toBe(12);
    expect(materialService.get(db, mid).salePrice).toBe(10); // 主数据价格不变
  });

  it('isTerminal：状态为空视为未结束', () => {
    const input = baseInput(db);
    const id = orderService.create(db, { ...input, statusId: null });
    expect(orderService.isTerminal(db, id)).toBe(false);
    const doneId = statusByName(db, '已完结');
    orderService.update(db, id, { statusId: doneId });
    expect(orderService.isTerminal(db, id)).toBe(true);
  });
});

describe('订单文档服务（V1.2）', () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = createTestDb();
  });

  it('添加/列出/删除订单文档', () => {
    const cid = customerService.create(db, { name: '文档客户' });
    const oid = orderService.create(db, { customerId: cid, items: [] });
    const id = orderAttachmentService.add(db, oid, { originalName: '报价单.pdf', storedPath: 'attachments/1/order/a.pdf', size: 9 });
    const docs = orderAttachmentService.list(db, oid);
    expect(docs).toHaveLength(1);
    expect(docs[0].originalName).toBe('报价单.pdf');
    const removed = orderAttachmentService.remove(db, id);
    expect(removed.storedPath).toBe('attachments/1/order/a.pdf');
    expect(orderAttachmentService.list(db, oid)).toHaveLength(0);
    expect(() => orderAttachmentService.remove(db, id)).toThrowError(/订单文档不存在/);
  });
});
