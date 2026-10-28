/**
 * 无头冒烟测试入口：ELECTRON_RUN_AS_NODE=1 下运行
 * 验证 初始化 → 迁移/种子 → 核心服务可用 → 数据库可关闭
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { statsService, statusDictService, dictService } from '@erp/db';
import { initApp } from './bootstrap';

function main(): void {
  const dir = mkdtempSync(join(tmpdir(), 'erp-smoke-'));
  try {
    const ctx = initApp(dir);
    const stats = statsService.dashboard(ctx.db);
    if (typeof stats.customerCount !== 'number') throw new Error('dashboard broken');
    if (statusDictService.list(ctx.db).length !== 5) throw new Error('order_status seed broken');
    if (dictService.list(ctx.db, 'customer_type').length !== 4) throw new Error('dict seed broken');
    const reminders = statsService.reminders(ctx.db);
    if (!Array.isArray(reminders.overdue) || !Array.isArray(reminders.upcoming))
      throw new Error('reminders broken');
    ctx.db.close();
    console.log(
      'SMOKE_OK ' +
        JSON.stringify({
          customerCount: stats.customerCount,
          statusCount: 5,
          dataDir: dir,
        }),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main();
