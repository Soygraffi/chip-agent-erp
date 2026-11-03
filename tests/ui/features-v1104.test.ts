import { describe, it } from 'node:test';
import { expect } from '../test-utils.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestDb } from '../db/helpers.ts';
import { customerService, orderService, nodeService } from '@erp/db';

const root = process.cwd();
const read = (p: string): string => readFileSync(join(root, p), 'utf8');

describe('V1.10.4 节点「无」与订单状态按节点', () => {
  it('节点可标记为无（客户未继续下单）', () => {
    const db = createTestDb();
    const cid = customerService.create(db, { name: '测试客户' });
    const oid = orderService.create(db, { customerId: cid, items: [] });
    const node = orderService.get(db, oid).nodes[0];
    nodeService.update(db, node.id, { status: 'none' });
    const after = orderService.get(db, oid).nodes[0];
    expect(after.status).toBe('none');
    db.close();
  });

  it('订单表单/列表不再提供订单状态，改由节点展示', () => {
    const form = read('apps/desktop/src/renderer/src/pages/OrderFormPage.tsx');
    expect(form.includes('订单状态')).toBe(false);
    const board = read('apps/desktop/src/renderer/src/components/OrdersBoard.tsx');
    expect(board.includes('placeholder="订单状态"')).toBe(false);
    expect(board.includes('无 · 客户未继续下单')).toBe(true);
    const settings = read('apps/desktop/src/renderer/src/pages/SettingsPage.tsx');
    expect(settings.includes("key: 'status'")).toBe(false);
  });

  it('首页饼图按当前节点统计', () => {
    const dash = read('apps/desktop/src/renderer/src/pages/DashboardPage.tsx');
    expect(dash.includes('订单进度分布（按当前节点）')).toBe(true);
    const repo = read('packages/db/src/repos/stats-repo.ts');
    expect(repo.includes('order_node')).toBe(true);
    expect(repo.includes('currentNodeName')).toBe(true);
  });

  it('节点状态含「无」选项与颜色', () => {
    const shared = read('packages/shared/src/types.ts');
    expect(shared.includes("none: '无（客户未继续）'")).toBe(true);
    expect(shared.includes("'none'")).toBe(true);
  });
});
