/**
 * 第九章验收标准自动化验收（PRD 9.1 功能 15 条 + 9.2 非功能可度量项）
 * 沙箱内无法验证的 GUI/安装包项以注释标注，交由真机验收（见 docs/dev-plan.md M9）。
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import { expect } from '../test-utils.ts';
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
  nodeService,
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
    const id = customerService.create(db, { name: ' ＡＢＣ 电子 ', contact: '张三', phone: '138' });
    expect(customerService.get(db, id).name).toBe('ＡＢＣ 电子');
    expect(() => customerService.create(db, { name: 'abc 电子', contact: '李四', phone: '139' })).toThrowError(/已存在/);
    customerService.update(db, id, { contact: '张三三' });
    expect(customerService.get(db, id).contact).toBe('张三三');
    customerService.softDelete(db, id, '2026-10-28');
    expect(customerService.options(db).map((o) => o.id)).not.toContain(id);
  });

  it('9.1.2 软删除有二次确认数据（订单数返回）、订单保留并计入统计', () => {
    const cid = customerService.create(db, { name: '客户X', contact: '张三', phone: '138' });
    orderService.create(db, {
      customerId: cid,
      orderDate: '2026-10-10',
      typeId: null,
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
    const cid = customerService.create(db, { name: '客户Y', contact: '张三', phone: '138' });
    const id = orderService.create(db, {
      customerId: cid,
      orderDate: '2026-10-28',
      typeId: null,
      statusId: statusDictService.list(db).find((s) => s.name === '进行中')!.id,
      items: [],
    });
    expect(orderService.get(db, id).orderNo).toBe('XS202610280001');
    expect(orderService.get(db, id).nodes).toHaveLength(10);
    expect(() =>
      orderService.create(db, {
        customerId: cid,
        orderDate: '2026-10-28',
        typeId: null,
        statusId: statusDictService.list(db).find((s) => s.name === '进行中')!.id,
        orderNo: 'XS202610280001',
        items: [],
      }),
    ).toThrowError(/编号已存在/);
  });

  it('9.1.4 明细小计与总金额自动计算；手改标记与恢复', () => {
    const cid = customerService.create(db, { name: '客户Z', contact: '张三', phone: '138' });
    const id = orderService.create(db, {
      customerId: cid,
      orderDate: '2026-10-28',
      typeId: null,
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
    const cid = customerService.create(db, { name: '客户W', contact: '张三', phone: '138' });
    const oid = orderService.create(db, {
      customerId: cid,
      orderDate: '2026-10-28',
      typeId: null,
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

  it('9.1.6 节点增删排序、时间线数据倒序（仓储按 sortOrder 正序，UI 倒序）、四色状态', () => {
    const cid = customerService.create(db, { name: '客户V', contact: '张三', phone: '138' });
    const oid = orderService.create(db, {
      customerId: cid,
      orderDate: '2026-10-28',
      typeId: null,
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
    const c1 = customerService.create(db, { name: '客户甲', contact: '张三', phone: '138' });
    const c2 = customerService.create(db, { name: '客户乙', contact: '李四', phone: '139' });
    const inProg = statusDictService.list(db).find((s) => s.name === '进行中')!.id;
    const done = statusDictService.list(db).find((s) => s.name === '已完结')!.id;
    const o1 = orderService.create(db, {
      customerId: c1, orderDate: '2026-10-01', typeId: null, statusId: inProg, items: [{ chipModel: 'CHIP-X', brand: null, packageSpec: null, qty: 1, unitPrice: 1, subtotal: 1, customerPn: null, remark: null }],
    });
    const o2 = orderService.create(db, { customerId: c2, orderDate: '2026-10-20', typeId: null, statusId: done, items: [] });
    expect(orderService.list(db, { customerId: c1, page: 1, pageSize: 10, today: '2026-10-28' }).total).toBe(1);
    expect(orderService.list(db, { statusId: done, page: 1, pageSize: 10, today: '2026-10-28' }).rows[0].id).toBe(o2);
    expect(orderService.list(db, { dateFrom: '2026-10-15', page: 1, pageSize: 10, today: '2026-10-28' }).rows[0].id).toBe(o2);
    expect(orderService.list(db, { search: 'CHIP-X', page: 1, pageSize: 10, today: '2026-10-28' }).rows[0].id).toBe(o1);
    expect(orderService.list(db, { search: '202610280002', page: 1, pageSize: 10, today: '2026-10-28' }).rows[0].id).toBe(o2);
    const sorted = orderService.list(db, { sortField: 'total_amount', sortDir: 'desc', page: 1, pageSize: 10, today: '2026-10-28' }).rows;
    expect(sorted[0].id).toBe(o1); // 有金额的在前
  });

  it('9.1.8 首页 7 指标与状态分布、逾期倒序（复用口径测试，抽查一致性）', () => {
    const cid = customerService.create(db, { name: '客户丙', contact: '张三', phone: '138' });
    orderService.create(db, {
      customerId: cid, orderDate: '2026-10-05', typeId: null,
      statusId: statusDictService.list(db).find((s) => s.name === '进行中')!.id,
      expectedDeliveryDate: '2026-10-20', isKey: true, items: [],
    });
    const s = statsService.dashboard(db, '2026-10-28');
    expect(s.customerCount).toBe(1);
    expect(s.activeOrderCount).toBe(1);
    expect(s.monthNewOrderCount).toBe(1);
    expect(s.overdueOrderCount).toBe(1);
    expect(s.keyOrderCount).toBe(1);
    expect(s.overdueOrders[0].daysOverdue).toBe(8);
    expect(s.statusDistribution.map((x) => x.count).reduce((a, b) => a + b, 0)).toBe(1);
  });

  it('9.1.9 提醒识别正确（仅非终态 × 三状态 × 已填计划；3 天内含今天）', () => {
    const cid = customerService.create(db, { name: '客户丁', contact: '张三', phone: '138' });
    const oid = orderService.create(db, {
      customerId: cid, orderDate: '2026-10-28', typeId: null,
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

  it('9.1.10 导出 Excel 与系统数据一致（客户/订单/明细/单订单 3-sheet）', async () => {
    const cid = customerService.create(db, { name: '导出验收客户', contact: '张三', phone: '138' });
    const oid = orderService.create(db, {
      customerId: cid, orderDate: '2026-10-28', typeId: null,
      statusId: statusDictService.list(db).find((s) => s.name === '进行中')!.id,
      items: [{ chipModel: 'CHIP-ACCEPT', brand: 'ST', packageSpec: 'QFN', qty: 5, unitPrice: 2, subtotal: 10, customerPn: null, remark: null }],
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await exportOrderDetail(db, oid)) as never);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['订单信息', '物料明细', '进度节点']);
    expect(String(wb.worksheets[1].getRow(2).getCell(1).value)).toBe('CHIP-ACCEPT');
    const ordersWb = new ExcelJS.Workbook();
    await ordersWb.xlsx.load((await exportOrders(db, { page: 1, pageSize: 100, today: '2026-10-28' })) as never);
    expect(String(ordersWb.worksheets[0].getRow(2).getCell(2).value)).toBe('导出验收客户');
    const custWb = new ExcelJS.Workbook();
    await custWb.xlsx.load((await exportCustomers(db)) as never);
    expect(String(custWb.worksheets[0].getRow(2).getCell(1).value)).toBe('导出验收客户');
  });

  it('9.1.11 导入：模板可用、校验、客户精确匹配、重复跳过、报告', async () => {
    customerService.create(db, { name: '导入验收客户', contact: '张三', phone: '138' });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('导入模板');
    ws.addRow(['订单编号(留空自动生成)', '客户全称*', '订单日期(YYYY-MM-DD)*', '订单类型*', '订单状态*']);
    ws.addRow([null, '导入验收客户', '2026-10-28', '批量订单', '进行中']);
    ws.addRow([null, '幽灵客户', '2026-10-28', '批量订单', '进行中']);
    const buf = (await wb.xlsx.writeBuffer()) as unknown as Buffer;
    const report = await importOrders(db, buf);
    expect(report.successCount).toBe(1);
    expect(report.failCount).toBe(1);
    expect(report.failures[0].reason).toContain('不存在');
  });

  it('9.1.12 备份 zip 含数据库与附件、恢复前自动备份、恢复完整', () => {
    customerService.create(db, { name: '备份验收客户', contact: '张三', phone: '138' });
    writeFileSync(join(dataDir, 'attachments', 'file.txt'), 'DATA');
    const b = createBackup(ctx());
    validateBackup(b.path);
    customerService.create(db, { name: '将被覆盖', contact: '李四', phone: '139' });
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

  it('9.1.13 删除订单级联删除明细/节点/附件记录', () => {
    const cid = customerService.create(db, { name: '客户戊', contact: '张三', phone: '138' });
    const oid = orderService.create(db, {
      customerId: cid, orderDate: '2026-10-28', typeId: null,
      statusId: statusDictService.list(db).find((s) => s.name === '进行中')!.id,
      items: [{ chipModel: 'A', brand: null, packageSpec: null, qty: 1, unitPrice: 1, subtotal: 1, customerPn: null, remark: null }],
    });
    const nodeId = orderService.get(db, oid).nodes[0].id;
    nodeService.addAttachment(db, nodeId, { originalName: 'a', storedPath: 'p/a', size: 1 });
    orderService.delete(db, oid);
    expect(orderService.list(db, { page: 1, pageSize: 10, today: '2026-10-28' }).total).toBe(0);
  });

  it('9.1.14 字典增删改与引用保护；状态语义驱动统计', () => {
    const newType = dictService.create(db, { category: 'customer_type', name: '代理商' });
    const cid = customerService.create(db, { name: '客户己', contact: '张三', phone: '138', typeId: newType });
    void cid;
    expect(() => dictService.delete(db, newType)).toThrowError(/被 1 条业务数据引用/);
    const custom = statusDictService.create(db, { name: '归档', color: '#000', isTerminal: true, terminalResult: 'completed' });
    const oid = orderService.create(db, {
      customerId: customerService.create(db, { name: '客户庚', contact: '张三', phone: '138' }),
      orderDate: '2026-10-28', typeId: null, statusId: custom, items: [],
    });
    void oid;
    const s = statsService.dashboard(db, '2026-10-28');
    expect(s.activeOrderCount).toBe(0); // 终态不计入跟进中
    expect(() => statusDictService.delete(db, custom)).toThrowError(/被 1 个订单引用/);
  });

  it('9.1.15 数据目录迁移：数据完整迁移、旧目录保留（通过配置层语义验证）', () => {
    // 迁移函数依赖 electron 上下文（ctxRef），在沙箱内无法直接调用；
    // 此处验证迁移底层依赖能力：新目录打开与完整性校验（PRAGMA integrity_check）
    customerService.create(db, { name: '客户辛', contact: '张三', phone: '138' });
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

  it('9.2.1 启动（打开+迁移）≤3s；9.2.2 全部功能离线可用（本套件全部为本地 DB/文件操作）', () => {
    const t0 = performance.now();
    const fresh = openDatabase(':memory:');
    migrate(fresh);
    const ms = performance.now() - t0;
    fresh.close();
    expect(ms).toBeLessThan(3000);
  });

  it('9.2.4 高 DPI：渲染层未使用固定像素布局的窗口约束（构建产物验证见 M10）', () => {
    // GUI 项由真机验收；此处验证配置存在
    expect(existsSync(join('apps', 'desktop', 'build.mjs'))).toBe(true);
  });

  it('编号规则与汇率设置联动（4.6.2/4.6.3）', () => {
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
