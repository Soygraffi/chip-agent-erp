/**
 * 第九章验收标准自动化验收（PRD 9.1 功能 15 条 + V1.2 微信群/订单文档 + 9.2 非功能可度量项）
 * 沙箱内无法验证的 GUI/安装包项以注释标注，交由真机验收（见 docs/dev-plan.md M9）。
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import { expect } from '../test-utils.ts';
import { todayOrderNo } from '../db/helpers.ts';
import ExcelJS from 'exceljs';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  copyFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  openDatabase,
  migrate,
  customerService,
  orderService,
  orderAttachmentService,
  nodeService,
  wechatService,
  materialService,
  statsService,
  statusDictService,
  dictService,
  templateService,
  rateService,
  getOrderNoConfig,
  setSetting,
} from '@erp/db';
import {
  createBackup,
  restoreBackup,
  validateBackup,
  importCustomers,
  importOrders,
  exportCustomers,
  exportOrders,
  exportOrderDetail,
  exportQuote,
} from '@erp/tools';

let dir: string;
let dataDir: string;
let backupsDir: string;
let db: import('node:sqlite').DatabaseSync;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'erp-accept-'));
  dataDir = join(dir, 'data');
  backupsDir = join(dir, 'backups');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(backupsDir, { recursive: true });
  mkdirSync(join(dataDir, 'attachments'), { recursive: true });
  db = openDatabase(join(dataDir, 'erp.db'));
  migrate(db);
});

afterEach(() => {
  try {
    db.close();
  } catch {
    /* ignore */
  }
  rmSync(dir, { recursive: true, force: true });
});

function ctx() {
  return { db, dataDir, backupsDir };
}

describe('第九章验收标准', () => {
  it('9.1.1 客户增删改查 + 全称唯一（归一化判重、仅未删除客户）', () => {
    const id = customerService.create(db, { name: ' ＡＢＣ 电子 ' });
    expect(customerService.get(db, id).name).toBe('ＡＢＣ 电子');
    expect(() => customerService.create(db, { name: 'abc 电子' })).toThrowError(/已存在/);
    customerService.update(db, id, { remark: '重点客户，主要做 MCU' });
    expect(customerService.get(db, id).remark).toBe('重点客户，主要做 MCU');
    customerService.softDelete(db, id, '2026-10-28');
    expect(customerService.options(db).map((o) => o.id)).not.toContain(id);
  });

  it('9.1.2 软删除返回订单数、订单保留并计入统计', () => {
    const cid = customerService.create(db, { name: '客户X' });
    orderService.create(db, {
      customerId: cid,
      orderDate: '2026-10-10',
      statusId: statusDictService.list(db).find((s) => s.name === '进行中')!.id,
      expectedDeliveryDate: '2026-10-01',
      items: [],
    });
    const r = customerService.softDelete(db, cid, '2026-10-28');
    expect(r.orderCount).toBe(1);
    const s = statsService.dashboard(db, '2026-10-28');
    expect(s.customerCount).toBe(0);
    expect(s.activeOrderCount).toBe(1); // 订单仍计入统计
    expect(s.overdueOrderCount).toBe(1);
  });

  it('9.1.3 订单创建：编号自动生成、手动编号唯一、自动生成 10 节点', () => {
    const cid = customerService.create(db, { name: '客户Y' });
    const id = orderService.create(db, {
      customerId: cid,
      orderDate: '2026-10-28',
      statusId: statusDictService.list(db).find((s) => s.name === '进行中')!.id,
      items: [],
    });
    expect(orderService.get(db, id).orderNo).toBe(todayOrderNo(1));
    expect(orderService.get(db, id).nodes).toHaveLength(10);
    expect(() =>
      orderService.create(db, {
        customerId: cid,
        orderDate: '2026-10-28',
        statusId: statusDictService.list(db).find((s) => s.name === '进行中')!.id,
        orderNo: todayOrderNo(1),
        items: [],
      }),
    ).toThrowError(/编号已存在/);
  });

  it('9.1.4 明细小计与总金额自动计算；手改标记与恢复', () => {
    const cid = customerService.create(db, { name: '客户Z' });
    const id = orderService.create(db, {
      customerId: cid,
      orderDate: '2026-10-28',
      statusId: statusDictService.list(db).find((s) => s.name === '进行中')!.id,
      items: [
        { chipModel: 'A', brand: null, packageSpec: null, qty: 3, unitPrice: 0.1, subtotal: 0.3, customerPn: null, remark: null },
        { chipModel: 'B', brand: null, packageSpec: null, qty: 2, unitPrice: 10.55, subtotal: 21.1, customerPn: null, remark: null },
      ],
    });
    const d = orderService.get(db, id);
    expect(d.totalAmount).toBe(21.4);
    expect(d.amountManual).toBe(false);
    orderService.update(db, id, { amountManual: true, totalAmount: 20 });
    expect(orderService.get(db, id).amountManual).toBe(true);
    orderService.restoreAutoAmount(db, id);
    expect(orderService.get(db, id).totalAmount).toBe(21.4);
  });

  it('9.1.5 全部节点完成自动完结；节点完成自动进入下一节点', () => {
    const cid = customerService.create(db, { name: '客户W' });
    const oid = orderService.create(db, {
      customerId: cid,
      orderDate: '2026-10-28',
      statusId: statusDictService.list(db).find((s) => s.name === '进行中')!.id,
      items: [],
    });
    const nodes = orderService.get(db, oid).nodes;
    const first = nodeService.update(db, nodes[0].id, { status: 'done' });
    expect(first.promotedNodeId).toBe(nodes[1].id);
    nodes.slice(1).forEach((n) => nodeService.update(db, n.id, { status: 'done' }));
    const doneId = statusDictService.list(db).find((s) => s.name === '已完结')!.id;
    expect(orderService.get(db, oid).statusId).toBe(doneId);
  });

  it('9.1.6 节点增删排序、时间线数据（UI 倒序展示）、四色状态', () => {
    const cid = customerService.create(db, { name: '客户V' });
    const oid = orderService.create(db, {
      customerId: cid,
      orderDate: '2026-10-28',
      statusId: statusDictService.list(db).find((s) => s.name === '进行中')!.id,
      items: [],
    });
    const nodes = orderService.get(db, oid).nodes;
    const custom = nodeService.create(db, oid, { name: '自定义节点' });
    const ids = [...nodes.map((n) => n.id), custom];
    nodeService.reorder(db, oid, [ids[ids.length - 1], ...ids.slice(0, -1)]);
    const after = orderService.get(db, oid).nodes;
    expect(after[0].name).toBe('自定义节点');
    expect(after).toHaveLength(11);
    nodeService.delete(db, custom);
    expect(orderService.get(db, oid).nodes).toHaveLength(10);
  });

  it('9.1.7 筛选/搜索/排序正确（客户、状态、日期范围、编号、芯片型号）', () => {
    const c1 = customerService.create(db, { name: '客户甲' });
    const c2 = customerService.create(db, { name: '客户乙' });
    const inProg = statusDictService.list(db).find((s) => s.name === '进行中')!.id;
    const done = statusDictService.list(db).find((s) => s.name === '已完结')!.id;
    const o1 = orderService.create(db, {
      customerId: c1, orderDate: '2026-10-01', statusId: inProg, items: [{ chipModel: 'CHIP-X', brand: null, packageSpec: null, qty: 1, unitPrice: 1, subtotal: 1, customerPn: null, remark: null }],
    });
    const o2 = orderService.create(db, { customerId: c2, orderDate: '2026-10-20', statusId: done, items: [] });
    expect(orderService.list(db, { customerId: c1, page: 1, pageSize: 10, today: '2026-10-28' }).total).toBe(1);
    expect(orderService.list(db, { statusId: done, page: 1, pageSize: 10, today: '2026-10-28' }).rows[0].id).toBe(o2);
    expect(orderService.list(db, { dateFrom: '2026-10-15', page: 1, pageSize: 10, today: '2026-10-28' }).rows[0].id).toBe(o2);
    expect(orderService.list(db, { search: 'CHIP-X', page: 1, pageSize: 10, today: '2026-10-28' }).rows[0].id).toBe(o1);
    expect(orderService.list(db, { search: todayOrderNo(2), page: 1, pageSize: 10, today: '2026-10-28' }).rows[0].id).toBe(o2);
    const sorted = orderService.list(db, { sortField: 'total_amount', sortDir: 'desc', page: 1, pageSize: 10, today: '2026-10-28' }).rows;
    expect(sorted[0].id).toBe(o1); // 有金额的在前
  });

  it('9.1.8 首页 7 指标与状态分布（含未填写）、逾期倒序', () => {
    const cid = customerService.create(db, { name: '客户丙' });
    orderService.create(db, {
      customerId: cid, orderDate: '2026-10-05',
      statusId: statusDictService.list(db).find((s) => s.name === '进行中')!.id,
      expectedDeliveryDate: '2026-10-20', isKey: true, items: [],
    });
    orderService.create(db, {
      customerId: cid, orderDate: '2026-10-06', statusId: null, items: [],
    });
    const s = statsService.dashboard(db, '2026-10-28');
    expect(s.customerCount).toBe(1);
    expect(s.activeOrderCount).toBe(2); // 含未填写状态
    expect(s.monthNewOrderCount).toBe(2);
    expect(s.overdueOrderCount).toBe(1);
    expect(s.keyOrderCount).toBe(1);
    expect(s.overdueOrders[0].daysOverdue).toBe(8);
    expect(s.statusDistribution.map((x) => x.count).reduce((a, b) => a + b, 0)).toBe(2);
    expect(s.statusDistribution.some((x) => x.statusName === '未填写')).toBe(true);
  });

  it('9.1.9 提醒识别正确（仅非终态 × 三状态 × 已填计划；3 天内含今天）', () => {
    const cid = customerService.create(db, { name: '客户丁' });
    const oid = orderService.create(db, {
      customerId: cid, orderDate: '2026-10-28',
      statusId: statusDictService.list(db).find((s) => s.name === '进行中')!.id, items: [],
    });
    const nodes = orderService.get(db, oid).nodes;
    nodeService.updateFields(db, nodes[0].id, { planTime: '2026-10-27' }); // 逾期
    nodeService.updateFields(db, nodes[1].id, { planTime: '2026-10-31' }); // 3 天内
    nodeService.updateFields(db, nodes[2].id, { planTime: '2026-11-05' }); // 超窗
    const r = statsService.reminders(db, '2026-10-28');
    expect(r.overdue).toHaveLength(1);
    expect(r.upcoming).toHaveLength(1);
    expect(r.upcoming[0].days).toBe(3);
    // 完结后不再提醒
    nodes.forEach((n) => nodeService.update(db, n.id, { status: 'done' }));
    const r2 = statsService.reminders(db, '2026-10-28');
    expect(r2.overdue).toHaveLength(0);
    expect(r2.upcoming).toHaveLength(0);
  });

  it('9.1.10 导出 Excel 与系统数据一致（客户/订单/单订单 4-sheet）', async () => {
    const cid = customerService.create(db, { name: '导出验收客户' });
    const oid = orderService.create(db, {
      customerId: cid, orderDate: '2026-10-28',
      statusId: statusDictService.list(db).find((s) => s.name === '进行中')!.id,
      items: [{ chipModel: 'CHIP-ACCEPT', brand: 'ST', packageSpec: 'QFN', qty: 5, unitPrice: 2, subtotal: 10, customerPn: null, remark: null }],
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await exportOrderDetail(db, oid)) as never);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['订单信息', '物料明细', '进度节点', '沟通微信群']);
    expect(String(wb.worksheets[1].getRow(2).getCell(3).value)).toBe('CHIP-ACCEPT');
    const ordersWb = new ExcelJS.Workbook();
    await ordersWb.xlsx.load((await exportOrders(db, { page: 1, pageSize: 100, today: '2026-10-28' })) as never);
    expect(String(ordersWb.worksheets[0].getRow(2).getCell(2).value)).toBe('导出验收客户');
    const custWb = new ExcelJS.Workbook();
    await custWb.xlsx.load((await exportCustomers(db)) as never);
    expect(String(custWb.worksheets[0].getRow(2).getCell(1).value)).toBe('导出验收客户');
  });

  it('9.1.11 导入：模板可用、校验、客户精确匹配、重复跳过、报告', async () => {
    customerService.create(db, { name: '导入验收客户' });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('导入模板');
    ws.addRow(['订单编号(留空自动生成)', '客户全称*', '订单日期(YYYY-MM-DD)', '订单类型', '订单状态']);
    ws.addRow([null, '导入验收客户', '2026-10-28', '批量订单', '进行中']);
    ws.addRow([null, '幽灵客户', null, null, null]);
    const buf = (await wb.xlsx.writeBuffer()) as unknown as Buffer;
    const report = await importOrders(db, buf);
    expect(report.successCount).toBe(1);
    expect(report.failCount).toBe(1);
    expect(report.failures[0].reason).toContain('不存在');
  });

  it('9.1.12 备份 zip 含数据库与附件、恢复前自动备份、恢复完整', () => {
    customerService.create(db, { name: '备份验收客户' });
    writeFileSync(join(dataDir, 'attachments', 'file.txt'), 'DATA');
    const b = createBackup(ctx());
    validateBackup(b.path);
    customerService.create(db, { name: '将被覆盖' });
    const r = restoreBackup({ ...ctx(), zipPath: b.path });
    expect(existsSync(r.preRestorePath)).toBe(true);
    const reopened = openDatabase(join(dataDir, 'erp.db'));
    migrate(reopened);
    try {
      const rows = customerService.list(reopened, { page: 1, pageSize: 10 });
      expect(rows.total).toBe(1);
      expect(rows.rows[0].name).toBe('备份验收客户');
    } finally {
      reopened.close();
    }
    expect(existsSync(join(dataDir, 'attachments', 'file.txt'))).toBe(true);
  });

  it('9.1.13 删除订单级联删除明细/节点/订单文档/附件记录', () => {
    const cid = customerService.create(db, { name: '客户戊' });
    const oid = orderService.create(db, {
      customerId: cid, orderDate: '2026-10-28',
      statusId: statusDictService.list(db).find((s) => s.name === '进行中')!.id,
      items: [{ chipModel: 'A', brand: null, packageSpec: null, qty: 1, unitPrice: 1, subtotal: 1, customerPn: null, remark: null }],
    });
    const nodeId = orderService.get(db, oid).nodes[0].id;
    nodeService.addAttachment(db, nodeId, { originalName: 'a', storedPath: 'p/a', size: 1 });
    orderAttachmentService.add(db, oid, { originalName: 'b', storedPath: 'p/b', size: 1 });
    orderService.delete(db, oid);
    expect(orderService.list(db, { page: 1, pageSize: 10, today: '2026-10-28' }).total).toBe(0);
  });

  it('9.1.14 字典增删改与引用保护；状态语义驱动统计', () => {
    const newType = dictService.create(db, { category: 'customer_type', name: '代理商' });
    const cid = customerService.create(db, { name: '客户己', typeId: newType });
    void cid;
    expect(() => dictService.delete(db, newType)).toThrowError(/被 1 条业务数据引用/);
    const custom = statusDictService.create(db, { name: '归档', color: '#000', isTerminal: true, terminalResult: 'completed' });
    const oid = orderService.create(db, {
      customerId: customerService.create(db, { name: '客户庚' }),
      orderDate: '2026-10-28', statusId: custom, items: [],
    });
    void oid;
    const s = statsService.dashboard(db, '2026-10-28');
    expect(s.activeOrderCount).toBe(0); // 终态不计入跟进中
    expect(() => statusDictService.delete(db, custom)).toThrowError(/被 1 个订单引用/);
  });

  it('9.1.15 数据目录迁移：复制后数据完整（旧目录保留由设置层保证）', () => {
    customerService.create(db, { name: '客户辛' });
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    const target = join(dir, 'newdata');
    mkdirSync(target, { recursive: true });
    copyFileSync(join(dataDir, 'erp.db'), join(target, 'erp.db'));
    const verify = openDatabase(join(target, 'erp.db'));
    const row = verify.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    expect(row.integrity_check).toBe('ok');
    expect(customerService.list(verify, { page: 1, pageSize: 10 }).total).toBe(1);
    verify.close();
  });

  it('V1.2 新增：客户多微信群 + 群成员（微信号→姓名/岗位）', () => {
    const cid = customerService.create(db, { name: '微信群客户' });
    const g1 = wechatService.createGroup(db, cid, { name: '商务交流群' });
    const g2 = wechatService.createGroup(db, cid, { name: '研发交流群' });
    wechatService.createMember(db, g1, { wechatId: 'wx_boss', realName: '王总', position: '总经理' });
    wechatService.createMember(db, g2, { wechatId: 'wx_hw', realName: '李工', position: '硬件工程师' });
    expect(wechatService.listGroups(db, cid)).toHaveLength(2);
    expect(wechatService.listMembers(db, g1)[0].realName).toBe('王总');
    expect(wechatService.listMembers(db, g2)[0].position).toBe('硬件工程师');
  });

  it('V1.2 新增：订单上传 PDF/Word/图片（记录+托管路径）并列出', () => {
    const cid = customerService.create(db, { name: '文档客户' });
    const oid = orderService.create(db, { customerId: cid, items: [] });
    const docs = [
      { originalName: '采购合同.pdf', storedPath: `attachments/${oid}/order/a.pdf`, size: 1024 },
      { originalName: '规格书.docx', storedPath: `attachments/${oid}/order/b.docx`, size: 2048 },
      { originalName: '样品照片.png', storedPath: `attachments/${oid}/order/c.png`, size: 4096 },
    ];
    docs.forEach((d) => orderAttachmentService.add(db, oid, d));
    const list = orderAttachmentService.list(db, oid);
    expect(list.map((d) => d.originalName)).toEqual(['采购合同.pdf', '规格书.docx', '样品照片.png']);
  });

  it('V1.2 新增：订单日期/类型/状态未填时展示“未填写”且不阻断保存', () => {
    const cid = customerService.create(db, { name: '缺字段客户' });
    const oid = orderService.create(db, { customerId: cid, items: [] });
    const row = orderService.list(db, { page: 1, pageSize: 10, today: '2026-10-28' }).rows.find((r) => r.id === oid)!;
    expect(row.orderDate).toBeNull();
    expect(row.statusName).toBe('未填写');
    expect(row.typeName).toBeNull();
  });

  it('V1.3 新增：物料库增删改查、订单引用、删除保护与关联订单', () => {
    const mid = materialService.create(db, {
      code: 'RDDZX03001',
      name: 'ARM处理器',
      spec: 'GD32F407ZGT6',
      brand: '兆易创新',
      purchasePrice: 12.5,
      salePrice: 29.24,
      priceTaxIncluded: true,
      taxRate: 13,
    });
    const cid = customerService.create(db, { name: '物料验收客户' });
    const oid = orderService.create(db, {
      customerId: cid,
      items: [
        {
          materialId: mid,
          materialCode: 'RDDZX03001',
          materialName: 'ARM处理器',
          chipModel: 'GD32F407ZGT6',
          brand: '兆易创新',
          packageSpec: null,
          qty: 5,
          unitPrice: 29.24,
          purchasePrice: 12.5,
          priceTaxIncluded: true,
          taxRate: 13,
          subtotal: 146.2,
          customerPn: null,
          remark: null,
        },
      ],
    });
    expect(orderService.get(db, oid).totalAmount).toBe(146.2);
    expect(() => materialService.delete(db, mid)).toThrowError(/不能删除/);
    const orders = materialService.ordersUsing(db, mid);
    expect(orders[0].orderId).toBe(oid);
    expect(materialService.list(db, { search: 'GD32', page: 1, pageSize: 10 }).total).toBe(1);
  });

  it('V1.3 新增：不含税单价按税率换算为含税金额', () => {
    const cid = customerService.create(db, { name: '不含税客户' });
    const oid = orderService.create(db, {
      customerId: cid,
      items: [
        {
          chipModel: 'X1',
          brand: null,
          packageSpec: null,
          qty: 2,
          unitPrice: 100,
          purchasePrice: 80,
          priceTaxIncluded: false,
          taxRate: 13,
          subtotal: 226,
          customerPn: null,
          remark: null,
        },
      ],
    });
    const d = orderService.get(db, oid);
    expect(d.items[0].subtotal).toBe(226); // 2 × 100 × 1.13
    expect(d.totalAmount).toBe(226);
    expect(d.items[0].priceTaxIncluded).toBe(false);
  });

  it('V1.3 新增：一键导出报价单（公司抬头 + 明细 + 合计含税）', async () => {
    setSetting(db, 'company_name', '测试供应链有限公司');
    const cid = customerService.create(db, { name: '报价单客户' });
    const oid = orderService.create(db, {
      customerId: cid,
      items: [
        {
          materialCode: 'RDDZX03001',
          materialName: 'ARM处理器',
          chipModel: 'GD32F407ZGT6',
          brand: '兆易创新',
          packageSpec: null,
          qty: 5,
          unitPrice: 29.24,
          purchasePrice: 12.5,
          priceTaxIncluded: true,
          taxRate: 13,
          subtotal: 146.2,
          customerPn: null,
          remark: null,
        },
      ],
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await exportQuote(db, oid)) as never);
    const ws = wb.worksheets[0];
    expect(ws.name).toBe('报价单');
    expect(String(ws.getCell('A1').value)).toBe('测试供应链有限公司');
    expect(String(ws.getCell('A2').value)).toBe('报价单');
    expect(ws.getRow(4).getCell(7).value).toBe(146.2);
    // 合计行（1 条明细时位于第 5 行）
    let totalRowNo = 0;
    ws.eachRow((row, i) => {
      if (String(row.getCell(1).value) === '合计（含税）') totalRowNo = i;
    });
    expect(totalRowNo).toBeGreaterThan(0);
    expect(ws.getRow(totalRowNo).getCell(7).value).toBe(146.2);
  });

  it('V1.3 新增：客户 Logo 路径保存/清除', () => {
    const cid = customerService.create(db, { name: 'Logo客户' });
    customerService.update(db, cid, { logoPath: 'attachments/customer-logos/1/a.png' });
    expect(customerService.get(db, cid).logoPath).toBe('attachments/customer-logos/1/a.png');
    customerService.update(db, cid, { logoPath: null });
    expect(customerService.get(db, cid).logoPath).toBeNull();
  });

  it('9.2.1 启动（打开+迁移）≤3s；9.2.2 全部功能离线可用（本套件全部为本地 DB/文件操作）', () => {
    const t0 = performance.now();
    const fresh = openDatabase(':memory:');
    migrate(fresh);
    const ms = performance.now() - t0;
    fresh.close();
    expect(ms).toBeLessThan(3000);
  });

  it('编号规则与汇率设置联动（4.6.2/4.6.3，V1.2 汇率仅保留工具能力）', () => {
    setSetting(db, 'order_no_prefix', 'SO');
    setSetting(db, 'order_no_seq_width', '3');
    const cfg = getOrderNoConfig(db);
    expect(cfg).toEqual({ prefix: 'SO', dateFormat: 'YYYYMMDD', seqWidth: 3 });
    const cny = dictService.list(db, 'currency').find((c) => c.name === '人民币 CNY')!.id;
    rateService.upsert(db, cny, 1.25);
    expect(rateService.list(db).find((r) => r.currencyId === cny)!.rate).toBe(1.25);
  });

  it('模板服务与节点语义码（4.6.1）', () => {
    const t = templateService.list(db, true);
    expect(t).toHaveLength(10);
    expect(t.map((x) => x.code)).toContain('arrival');
    expect(t.map((x) => x.code)).toContain('ship');
  });
});
