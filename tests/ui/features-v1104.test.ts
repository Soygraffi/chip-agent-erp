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
    expect(board.includes('未下单')).toBe(true);
    const settings = read('apps/desktop/src/renderer/src/pages/SettingsPage.tsx');
    expect(settings.includes("key: 'status'")).toBe(false);
  });

  it('ESC 返回上一页，最多返回到顶层页面并保留滚动位置', () => {
    const app = read('apps/desktop/src/renderer/src/App.tsx');
    expect(app.includes("'Escape'")).toBe(true);
    expect(app.includes('TOP_LEVEL')).toBe(true);
    expect(app.includes('navigate(-1)')).toBe(true);
    expect(app.includes('scrollPositions')).toBe(true);
  });

  it('窗口默认最大化且单实例运行', () => {
    const main = read('apps/desktop/src/main/index.ts');
    expect(main.includes('requestSingleInstanceLock')).toBe(true);
    expect(main.includes("app.on('second-instance'")).toBe(true);
    expect(main.includes('win.maximize()')).toBe(true);
  });

  it('首页顶部新建按钮有悬浮效果，金额改为本年', () => {
    const dash = read('apps/desktop/src/renderer/src/pages/DashboardPage.tsx');
    expect(dash.includes('BannerButton')).toBe(true);
    expect(dash.includes('本年订单金额')).toBe(true);
    expect(dash.includes('yearTotalAmount')).toBe(true);
  });

  it('首页快捷入口有悬浮效果', () => {
    const dash = read('apps/desktop/src/renderer/src/pages/DashboardPage.tsx');
    expect(dash.includes('QuickAction')).toBe(true);
    expect(dash.includes('onMouseEnter')).toBe(true);
    expect(dash.includes('translateY(-3px)')).toBe(true);
  });

  it('首页饼图按当前节点统计', () => {
    const dash = read('apps/desktop/src/renderer/src/pages/DashboardPage.tsx');
    expect(dash.includes('订单进度分布（按当前节点）')).toBe(true);
    const repo = read('packages/db/src/repos/stats-repo.ts');
    expect(repo.includes('order_node')).toBe(true);
    expect(repo.includes('currentNodeName')).toBe(true);
  });

  it('节点状态含「未下单」选项与专属叉叉图标', () => {
    const shared = read('packages/shared/src/types.ts');
    expect(shared.includes("none: '未下单'")).toBe(true);
    expect(shared.includes("'none'")).toBe(true);
    const stepper = read('apps/desktop/src/renderer/src/components/NodeStepper.tsx');
    expect(stepper.includes("if (n.status === 'none') return 'error';")).toBe(true);
  });
});
