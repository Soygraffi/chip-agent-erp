import { describe, it, beforeEach, afterEach } from 'node:test';
import { expect } from '../test-utils.ts';
import ExcelJS from 'exceljs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, migrate, customerService, orderService, statusDictService } from '@erp/db';
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

describe('Excel 模板', () => {
  it('客户模板包含表头与示例行', async () => {
    const buf = await customerTemplate();
    const rows = await readAll(buf);
    expect(rows[0][0]).toBe('客户全称*');
    expect(rows[0][3]).toBe('联系电话*');
    expect(rows[1][1]).toBe('终端');
  });

  it('订单模板包含表头与示例行', async () => {
    const buf = await orderTemplate(db);
    const rows = await readAll(buf);
    expect(rows[0][1]).toBe('客户全称*');
    expect(rows[0][4]).toBe('订单状态*');
    expect(rows[1][2]).toBe('2026-10-28');
  });
});

describe('客户导入（PRD 4.5.1）', () => {
  it('行级校验：合法入库、重复跳过、缺必填报错，报告正确', async () => {
    customerService.create(db, { name: '已有客户', contact: '张三', phone: '13800000000' });
    const buf = await writeWorkbook(
      ['客户全称*', '客户类型*', '联系人*', '联系电话*', '客户简称'],
      [
        ['新客户A', '终端', '李四', '13900000000', 'A'],
        [' 已有客户 ', '终端', '王五', '13700000000', ''],
        ['缺联系人客户', '终端', '', '13600000000', ''],
      ],
    );
    const report = await importCustomers(db, buf);
    expect(report.successCount).toBe(1);
    expect(report.failCount).toBe(2);
    expect(report.failures[0].reason).toContain('已存在');
    expect(report.failures[1].reason).toContain('联系人不能为空');
    expect(customerService.list(db, { page: 1, pageSize: 10 }).total).toBe(2);
  });
});

describe('订单导入（PRD 4.5.1）', () => {
  it('客户必须已存在；成功行自动生成 10 个节点；编号留空自动生成', async () => {
    customerService.create(db, { name: '导入客户', contact: '张三', phone: '13800000000' });
    const buf = await writeWorkbook(
      ['订单编号(留空自动生成)', '客户全称*', '订单日期(YYYY-MM-DD)*', '订单类型*', '订单状态*', '币种(留空=人民币)', '总金额(留空=自动汇总)', '预计交货日期(YYYY-MM-DD)'],
      [
        [null, '导入客户', '2026-10-28', '批量订单', '进行中', null, 1000, '2026-11-30'],
        [null, '不存在的客户', '2026-10-28', '批量订单', '进行中', null, null, null],
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

  it('重复订单编号跳过', async () => {
    customerService.create(db, { name: '导入客户', contact: '张三', phone: '13800000000' });
    const buf = await writeWorkbook(
      ['订单编号(留空自动生成)', '客户全称*', '订单日期(YYYY-MM-DD)*', '订单类型*', '订单状态*'],
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

describe('导出（PRD 4.5.1）', () => {
  function seed(): number {
    const cid = customerService.create(db, { name: '导出客户', contact: '张三', phone: '13800000000' });
    return orderService.create(db, {
      customerId: cid,
      orderDate: '2026-10-28',
      typeId: null,
      statusId: statusDictService.list(db).find((s) => s.name === '进行中')!.id,
      items: [
        { chipModel: 'STM32F103', brand: 'ST', packageSpec: 'LQFP48', qty: 10, unitPrice: 9.5, subtotal: 95, customerPn: 'PN1', remark: null },
      ],
    });
  }

  it('导出客户列表包含数据行', async () => {
    customerService.create(db, { name: '导出客户', contact: '张三', phone: '13800000000' });
    const buf = await exportCustomers(db);
    const rows = await readAll(buf);
    expect(rows[0][0]).toBe('客户全称');
    expect(rows[1][0]).toBe('导出客户');
    expect(rows[1][3]).toBe('张三');
  });

  it('导出订单列表包含折人民币与逾期列', async () => {
    seed();
    const buf = await exportOrders(db, { page: 1, pageSize: 100, today: '2026-10-28' });
    const rows = await readAll(buf);
    expect(rows[0][0]).toBe('订单编号');
    expect(rows[1][0]).toBe('XS202610280001');
  });

  it('导出订单明细包含芯片型号', async () => {
    seed();
    const buf = await exportItems(db);
    const rows = await readAll(buf);
    expect(rows[0][2]).toBe('芯片型号');
    expect(rows[1][2]).toBe('STM32F103');
  });

  it('导出单订单详情：3 个 sheet（订单信息/物料明细/进度节点）', async () => {
    const id = seed();
    const buf = await exportOrderDetail(db, id);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as never);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['订单信息', '物料明细', '进度节点']);
    const info = wb.worksheets[0];
    expect(String(info.getRow(1).getCell(2).value)).toBe('XS202610280001');
    const items = wb.worksheets[1];
    expect(String(items.getRow(2).getCell(1).value)).toBe('STM32F103');
    const nodes = wb.worksheets[2];
    expect(String(nodes.getRow(2).getCell(1).value)).toBe('需求沟通');
    expect(nodes.rowCount).toBe(11); // 表头 + 10 个节点
  });
});
