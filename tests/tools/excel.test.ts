import { describe, it, beforeEach, afterEach } from 'node:test';
import { expect } from '../test-utils.ts';
import ExcelJS from 'exceljs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, migrate, customerService, orderService, statusDictService, wechatService } from '@erp/db';
import type { DatabaseSync } from 'node:sqlite';
import {
  customerTemplate,
  orderTemplate,
  importCustomers,
  importOrders,
  exportCustomers,
  exportOrders,
  exportItems,
  exportOrderDetail,
} from '@erp/tools';

let db: DatabaseSync;
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'erp-excel-'));
  db = openDatabase(join(dir, 'test.db'));
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

async function writeWorkbook(headers: string[], rows: (string | number | null)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('导入模板');
  ws.addRow(headers);
  rows.forEach((r) => ws.addRow(r));
  return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
}

async function readAll(buf: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as never);
  const ws = wb.worksheets[0];
  const out: string[][] = [];
  ws.eachRow((row) => {
    const vals: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      const v = cell.value;
      if (v == null) vals.push('');
      else if (typeof v === 'object' && 'result' in v) vals.push(String((v as { result: unknown }).result));
      else vals.push(String(v));
    });
    out.push(vals);
  });
  return out;
}

describe('Excel 模板（V1.2）', () => {
  it('客户模板包含表头与示例行（无联系人/电话列）', async () => {
    const buf = await customerTemplate();
    const rows = await readAll(buf);
    expect(rows[0][0]).toBe('客户全称*');
    expect(rows[0][2]).toBe('客户简称');
    expect(rows[0]).not.toContain('联系电话*');
    expect(rows[1][1]).toBe('终端');
  });

  it('订单模板包含表头与示例行（状态非必填）', async () => {
    const buf = await orderTemplate(db);
    const rows = await readAll(buf);
    expect(rows[0][1]).toBe('客户全称*');
    expect(rows[0][4]).toBe('订单状态');
    expect(rows[1][2]).toBe('2026-10-28');
  });
});

describe('客户导入（V1.2：仅全称必填）', () => {
  it('行级校验：合法入库、重复跳过、缺全填报错，报告正确', async () => {
    customerService.create(db, { name: '已有客户' });
    const buf = await writeWorkbook(
      ['客户全称*', '客户类型', '客户简称', '地址', '备注'],
      [
        ['新客户A', '终端', 'A', '深圳市', ''],
        [' 已有客户 ', '', '', '', ''],
        ['', '终端', '无名', '', ''],
      ],
    );
    const report = await importCustomers(db, buf);
    expect(report.successCount).toBe(1);
    expect(report.failCount).toBe(2);
    expect(report.failures[0].reason).toContain('已存在');
    expect(report.failures[1].reason).toContain('客户全称不能为空');
    expect(customerService.list(db, { page: 1, pageSize: 10 }).total).toBe(2);
  });
});

describe('订单导入（V1.2：日期/类型/状态可选）', () => {
  it('客户必须已存在；成功行自动生成 10 个节点；编号留空自动生成', async () => {
    customerService.create(db, { name: '导入客户' });
    const buf = await writeWorkbook(
      ['订单编号(留空自动生成)', '客户全称*', '订单日期(YYYY-MM-DD)', '订单类型', '订单状态', '总金额(留空=自动汇总)', '预计交货日期(YYYY-MM-DD)'],
      [
        [null, '导入客户', '2026-10-28', '批量订单', '进行中', 1000, '2026-11-30'],
        [null, '不存在的客户', null, null, null, null, null],
      ],
    );
    const report = await importOrders(db, buf);
    expect(report.successCount).toBe(1);
    expect(report.failCount).toBe(1);
    expect(report.failures[0].reason).toContain('不存在');
    const page = orderService.list(db, { page: 1, pageSize: 10, today: '2026-10-28' });
    expect(page.total).toBe(1);
    const order = orderService.get(db, page.rows[0].id);
    expect(order.orderNo).toBe('XS202610280001'); // 按编号规则自动生成
    expect(order.totalAmount).toBe(1000);
    expect(order.amountManual).toBe(true);
    expect(order.nodes).toHaveLength(10); // 自动生成 10 个标准节点
    expect(order.nodes[0].name).toBe('需求沟通');
  });

  it('日期/类型/状态留空也能导入', async () => {
    customerService.create(db, { name: '导入客户2' });
    const buf = await writeWorkbook(
      ['订单编号(留空自动生成)', '客户全称*', '订单日期(YYYY-MM-DD)', '订单类型', '订单状态'],
      [['MIN-1', '导入客户2', null, null, null]],
    );
    const report = await importOrders(db, buf);
    expect(report.successCount).toBe(1);
    const page = orderService.list(db, { page: 1, pageSize: 10, today: '2026-10-28' });
    const order = orderService.get(db, page.rows[0].id);
    expect(order.orderDate).toBeNull();
    expect(order.statusId).toBeNull();
  });

  it('重复订单编号跳过', async () => {
    customerService.create(db, { name: '导入客户' });
    const buf = await writeWorkbook(
      ['订单编号(留空自动生成)', '客户全称*', '订单日期(YYYY-MM-DD)', '订单类型', '订单状态'],
      [
        ['XH-1', '导入客户', '2026-10-28', '批量订单', '进行中'],
        ['XH-1', '导入客户', '2026-10-28', '批量订单', '进行中'],
      ],
    );
    const report = await importOrders(db, buf);
    expect(report.successCount).toBe(1);
    expect(report.failCount).toBe(1);
    expect(report.failures[0].reason).toContain('已存在');
  });
});

describe('导出（V1.2）', () => {
  function seed(): number {
    const cid = customerService.create(db, { name: '导出客户' });
    const gid = wechatService.createGroup(db, cid, { name: '商务交流群' });
    wechatService.createMember(db, gid, { wechatId: 'wx01', realName: '张三', position: '采购经理' });
    return orderService.create(db, {
      customerId: cid,
      orderDate: '2026-10-28',
      typeId: null,
      statusId: statusDictService.list(db).find((s) => s.name === '进行中')!.id,
      wechatGroupIds: [gid],
      items: [
        { chipModel: 'STM32F103', brand: 'ST', packageSpec: 'LQFP48', qty: 10, unitPrice: 9.5, subtotal: 95, customerPn: 'PN1', remark: null },
      ],
    });
  }

  it('导出客户列表包含微信群数列', async () => {
    customerService.create(db, { name: '导出客户' });
    const buf = await exportCustomers(db);
    const rows = await readAll(buf);
    expect(rows[0][0]).toBe('客户全称');
    expect(rows[0][4]).toBe('微信群数');
    expect(rows[1][0]).toBe('导出客户');
  });

  it('导出订单列表含状态/金额/沟通微信群列（无折人民币）', async () => {
    seed();
    const buf = await exportOrders(db, { page: 1, pageSize: 100, today: '2026-10-28' });
    const rows = await readAll(buf);
    expect(rows[0][0]).toBe('订单编号');
    expect(rows[0][4]).toBe('订单金额');
    expect(rows[0][9]).toBe('沟通微信群');
    expect(rows[1][0]).toBe('XS202610280001');
    expect(rows[1][9]).toBe('商务交流群');
  });

  it('导出订单明细包含物料编码/价格口径列', async () => {
    seed();
    const buf = await exportItems(db);
    const rows = await readAll(buf);
    expect(rows[0][2]).toBe('物料编码');
    expect(rows[0][4]).toBe('料号规格');
    expect(rows[0][9]).toBe('含税口径');
    expect(rows[1][4]).toBe('STM32F103');
  });

  it('导出单订单详情：4 个 sheet（订单信息/物料明细/进度节点/沟通微信群）', async () => {
    const id = seed();
    const buf = await exportOrderDetail(db, id);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as never);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['订单信息', '物料明细', '进度节点', '沟通微信群']);
    const info = wb.worksheets[0];
    expect(String(info.getRow(1).getCell(2).value)).toBe('XS202610280001');
    const items = wb.worksheets[1];
    expect(String(items.getRow(2).getCell(3).value)).toBe('STM32F103');
    const nodes = wb.worksheets[2];
    expect(String(nodes.getRow(2).getCell(1).value)).toBe('需求沟通');
    expect(nodes.rowCount).toBe(11); // 表头 + 10 个节点
    const groups = wb.worksheets[3];
    expect(String(groups.getRow(2).getCell(1).value)).toBe('商务交流群');
    expect(String(groups.getRow(2).getCell(3).value)).toBe('wx01');
    expect(String(groups.getRow(2).getCell(4).value)).toBe('张三');
    expect(String(groups.getRow(2).getCell(5).value)).toBe('采购经理');
  });
});
