/**
 * 性能基准（PRD 6.1 / 9.2）：
 * 生成 1000 客户 + 1000 订单（各 3 明细 + 10 节点），测量
 * 启动(初始化+迁移) / 列表查询 / 搜索 / 看板 / Excel 导入 1000 条
 * 运行：node scripts/benchmark.ts
 */
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
import ExcelJS from 'exceljs';

const dir = mkdtempSync(join(tmpdir(), 'erp-bench-'));

function time<T>(label: string, fn: () => T): { label: string; ms: number; result: T } {
  const t0 = performance.now();
  const result = fn();
  const ms = performance.now() - t0;
  console.log(`${label}: ${ms.toFixed(1)} ms`);
  return { label, ms, result };
}

// 1. 启动：初始化 + 迁移
const init = time('冷启动（打开+迁移+种子）', () => {
  const db = openDatabase(join(dir, 'erp.db'));
  migrate(db);
  return db;
});
const db = init.result;
const statuses = statusDictService.list(db);
const inProg = statuses.find((s) => s.name === '进行中')!.id;

// 2. 写入 1000 客户
const cids: number[] = [];
time('写入 1000 客户', () => {
  for (let i = 1; i <= 1000; i++) {
    cids.push(
      customerService.create(db, {
        name: `基准客户${String(i).padStart(4, '0')}`,
        contact: `联系人${i}`,
        phone: `138${String(i).padStart(8, '0')}`,
      }),
    );
  }
});

// 3. 写入 1000 订单（各 3 明细 + 自动 10 节点）
time('写入 1000 订单（含明细+节点）', () => {
  for (let i = 1; i <= 1000; i++) {
    const cid = cids[(i - 1) % 1000];
    orderService.create(db, {
      customerId: cid,
      orderDate: i % 2 === 0 ? '2026-10-15' : '2026-09-15',
      typeId: dictService.list(db, 'order_type')[1].id,
      statusId: inProg,
      expectedDeliveryDate: i % 3 === 0 ? '2026-10-01' : '2026-11-30',
      items: [
        { chipModel: `CHIP-A${i}`, brand: 'ST', packageSpec: 'LQFP48', qty: 100, unitPrice: 1.5, subtotal: 150, customerPn: null, remark: null },
        { chipModel: `CHIP-B${i}`, brand: null, packageSpec: null, qty: 200, unitPrice: 0.5, subtotal: 100, customerPn: null, remark: null },
        { chipModel: `CHIP-C${i}`, brand: null, packageSpec: null, qty: 300, unitPrice: 0.25, subtotal: 75, customerPn: null, remark: null },
      ],
    });
  }
});

// 4. 列表查询
time('订单列表查询（每页 20，共 1000 条）', () => {
  orderService.list(db, { page: 1, pageSize: 20, today: '2026-10-28' });
});

// 5. 关键字搜索（芯片型号跨表）
time('芯片型号搜索（跨明细表 LIKE）', () => {
  orderService.list(db, { search: 'CHIP-B500', page: 1, pageSize: 20, today: '2026-10-28' });
});

// 6. 首页看板
time('首页看板聚合（7 指标+饼图数据+逾期/重点列表）', () => {
  statsService.dashboard(db, '2026-10-28');
});

// 7. 提醒计算
time('提醒候选计算', () => {
  statsService.reminders(db, '2026-10-28');
});

// 8. Excel 导入 1000 条客户
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet('导入模板');
ws.addRow(['客户全称*', '客户类型*', '联系人*', '联系电话*']);
for (let i = 1; i <= 1000; i++) {
  ws.addRow([`导入客户${String(i).padStart(4, '0')}`, '终端', `联系人${i}`, `139${String(i).padStart(8, '0')}`]);
}
const importBuf = (await wb.xlsx.writeBuffer()) as unknown as Buffer;
{
  const t0 = performance.now();
  await importCustomers(db, importBuf);
  console.log(`Excel 导入 1000 条客户（≤5s 目标）: ${(performance.now() - t0).toFixed(1)} ms`);
}

db.close();
rmSync(dir, { recursive: true, force: true });

const results = {
  initMs: init.ms,
  queryMs: 0,
};
void results;
console.log('BENCHMARK DONE');
