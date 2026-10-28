/**
 * 非功能验收测试（PRD 6.1 / 9.2）：
 * 1000 客户 + 1000 订单规模下的性能断言
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import { expect } from './test-utils.ts';
import ExcelJS from 'exceljs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  openDatabase,
  migrate,
  customerService,
  orderService,
  statsService,
  statusDictService,
  dictService,
} from '@erp/db';
import { importCustomers } from '@erp/tools';
import type { DatabaseSync } from 'node:sqlite';

let dir: string;
let db: DatabaseSync;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'erp-perf-'));
  db = openDatabase(join(dir, 'perf.db'));
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

describe('性能验收（1000 条数据规模）', () => {
  function seedData(): void {
    const statuses = statusDictService.list(db);
    const inProg = statuses.find((s) => s.name === '进行中')!.id;
    const typeId = dictService.list(db, 'order_type')[1].id;
    const cids: number[] = [];
    for (let i = 1; i <= 1000; i++) {
      cids.push(
        customerService.create(db, {
          name: `性能客户${String(i).padStart(4, '0')}`,
          contact: `联系人${i}`,
          phone: `138${String(i).padStart(8, '0')}`,
        }),
      );
    }
    for (let i = 1; i <= 1000; i++) {
      orderService.create(db, {
        customerId: cids[(i - 1) % 1000],
        orderDate: i % 2 === 0 ? '2026-10-15' : '2026-09-15',
        typeId,
        statusId: inProg,
        expectedDeliveryDate: i % 3 === 0 ? '2026-10-01' : '2026-11-30',
        items: [
          { chipModel: `CHIP-${i}`, brand: null, packageSpec: null, qty: 10, unitPrice: 1, subtotal: 10, customerPn: null, remark: null },
        ],
      });
    }
  }

  it('9.2.1 启动（打开+迁移）≤3s', () => {
    const t0 = performance.now();
    const fresh = openDatabase(join(dir, 'fresh.db'));
    migrate(fresh);
    const ms = performance.now() - t0;
    fresh.close();
    expect(ms).toBeLessThan(3000);
  });

  it('6.1 列表查询/搜索 ≤1s（1000 条内）', () => {
    seedData();
    let ms = 0;
    for (let i = 0; i < 20; i++) {
      const t0 = performance.now();
      orderService.list(db, { page: 1, pageSize: 20, today: '2026-10-28' });
      ms += performance.now() - t0;
    }
    expect(ms / 20).toBeLessThan(1000);
    const t0 = performance.now();
    orderService.list(db, { search: 'CHIP-500', page: 1, pageSize: 20, today: '2026-10-28' });
    expect(performance.now() - t0).toBeLessThan(1000);
    const t1 = performance.now();
    statsService.dashboard(db, '2026-10-28');
    expect(performance.now() - t1).toBeLessThan(1000);
  });

  it('6.1 Excel 导入 1000 条 ≤5s', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('导入模板');
    ws.addRow(['客户全称*', '客户类型*', '联系人*', '联系电话*']);
    for (let i = 1; i <= 1000; i++) {
      ws.addRow([`导入性能客户${String(i).padStart(4, '0')}`, '终端', `联系人${i}`, `139${String(i).padStart(8, '0')}`]);
    }
    const buf = (await wb.xlsx.writeBuffer()) as unknown as Buffer;
    const t0 = performance.now();
    const report = await importCustomers(db, buf);
    const ms = performance.now() - t0;
    expect(report.successCount).toBe(1000);
    expect(ms).toBeLessThan(5000);
  });

  it('6.1 单订单支持 50 条明细与 100 个节点', () => {
    const cid = customerService.create(db, { name: '上限客户', contact: '张三', phone: '138' });
    const oid = orderService.create(db, {
      customerId: cid,
      orderDate: '2026-10-28',
      typeId: null,
      statusId: statusDictService.list(db).find((s) => s.name === '进行中')!.id,
      items: Array.from({ length: 50 }, (_, i) => ({
        chipModel: `CHIP-${i}`,
        brand: null,
        packageSpec: null,
        qty: 1,
        unitPrice: 1,
        subtotal: 1,
        customerPn: null,
        remark: null,
      })),
    });
    expect(orderService.get(db, oid).items).toHaveLength(50);
    // 再补 90 个自定义节点（含模板生成的 10 个 → 100）
    for (let i = 0; i < 90; i++) {
      db.prepare(
        'INSERT INTO order_node (order_id, name, status, sort_order) VALUES (?, ?, ?, ?)',
      ).run(oid, `附加节点${i}`, 'pending', 11 + i);
    }
    expect(orderService.get(db, oid).nodes).toHaveLength(100);
  });
});
