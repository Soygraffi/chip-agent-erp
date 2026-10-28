import { describe, it, beforeEach, afterEach } from 'node:test';
import { expect } from '../test-utils.ts';
import ExcelJS from 'exceljs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, migrate, customerService, orderService, statusDictService, setSetting } from '@erp/db';
import type { DatabaseSync } from 'node:sqlite';
import { exportQuote, quoteFileName } from '@erp/tools';

let db: DatabaseSync;
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'erp-quote-'));
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

function seedOrder(): number {
  const cid = customerService.create(db, { name: '报价客户' });
  return orderService.create(db, {
    customerId: cid,
    orderDate: '2026-10-28',
    statusId: statusDictService.list(db).find((s) => s.name === '进行中')!.id,
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
        remark: '现货',
      },
      {
        materialCode: 'RDDZX03002',
        materialName: 'ARM处理器',
        chipModel: 'GD32F103ZET6',
        brand: '兆易创新',
        packageSpec: null,
        qty: 5,
        unitPrice: 14.94,
        purchasePrice: 9,
        priceTaxIncluded: true,
        taxRate: 13,
        subtotal: 74.7,
        customerPn: null,
        remark: null,
      },
    ],
  });
}

describe('一键导出报价单（V1.3）', () => {
  it('版式：公司抬头 + 报价单标题 + 表头 + 明细 + 合计（含税）', async () => {
    setSetting(db, 'company_name', '湖北长江光电子信息产业供应链有限公司');
    const oid = seedOrder();
    const buf = await exportQuote(db, oid);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as never);
    expect(wb.worksheets[0].name).toBe('报价单');
    const ws = wb.worksheets[0];
    expect(String(ws.getCell('A1').value)).toBe('湖北长江光电子信息产业供应链有限公司');
    expect(String(ws.getCell('A2').value)).toBe('报价单');
    const headers = (ws.getRow(3).values as unknown[]).slice(1).map((v) => String(v));
    expect(headers).toEqual([
      '物料编码',
      '物料名称',
      '料号规格',
      '品牌',
      '需求数量',
      '含税单价（元）',
      '含税金额（元）',
      '备注',
    ]);
    expect(String(ws.getRow(4).getCell(1).value)).toBe('RDDZX03001');
    expect(String(ws.getRow(4).getCell(3).value)).toBe('GD32F407ZGT6');
    expect(ws.getRow(4).getCell(5).value).toBe(5);
    expect(ws.getRow(4).getCell(6).value).toBe(29.24);
    expect(ws.getRow(4).getCell(7).value).toBe(146.2);
    expect(String(ws.getRow(5).getCell(1).value)).toBe('RDDZX03002');
    // 合计（含税）= 220.9
    const totalRow = ws.getRow(6);
    expect(String(totalRow.getCell(1).value)).toBe('合计（含税）');
    expect(totalRow.getCell(7).value).toBe(220.9);
  });

  it('不含税价格在报价单中换算为含税单价', async () => {
    const cid = customerService.create(db, { name: '不含税客户' });
    const oid = orderService.create(db, {
      customerId: cid,
      items: [
        {
          chipModel: 'X1',
          brand: null,
          packageSpec: null,
          qty: 1,
          unitPrice: 100,
          purchasePrice: null,
          priceTaxIncluded: false,
          taxRate: 13,
          subtotal: 113,
          customerPn: null,
          remark: null,
        },
      ],
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await exportQuote(db, oid)) as never);
    const ws = wb.worksheets[0];
    expect(ws.getRow(4).getCell(6).value).toBe(113);
    expect(ws.getRow(4).getCell(7).value).toBe(113);
  });

  it('报价单文件名含订单号', () => {
    expect(quoteFileName('XS202610280001')).toMatch(/^报价单_XS202610280001_\d{8}_\d{4}\.xlsx$/);
  });
});
