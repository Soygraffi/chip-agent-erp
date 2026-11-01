import { describe, it } from 'node:test';
import { expect } from '../test-utils.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (p: string): string => readFileSync(join(root, p), 'utf8');

describe('V1.10.1 客户删除/明细交货/时间轴/排序/拖动设置', () => {
  it('客户管理不再提供删除按钮，删除入口在系统设置', () => {
    const customers = read('apps/desktop/src/renderer/src/pages/CustomersPage.tsx');
    expect(customers.includes('删除客户')).toBe(false);
    expect(customers.includes('softDelete')).toBe(false);
    const settings = read('apps/desktop/src/renderer/src/pages/SettingsPage.tsx');
    expect(settings.includes("key: 'danger'")).toBe(true);
    expect(settings.includes('softDelete')).toBe(true);
    expect(settings.includes('确认删除')).toBe(true);
  });

  it('订单明细每行可填实际交货日期（无占位提示）', () => {
    const form = read('apps/desktop/src/renderer/src/pages/OrderFormPage.tsx');
    expect(form.includes("title: '实际交货日期'")).toBe(true);
    expect(form.includes('每颗料可不同')).toBe(false);
    expect(form.includes('每料可不同')).toBe(false);
    const detail = read('apps/desktop/src/renderer/src/pages/OrderDetailPage.tsx');
    expect(detail.includes("title: '实际交货日期'")).toBe(true);
  });

  it('每颗料使用固定时间轴（需求沟通/报价中/客户确认…），不再用百分比', () => {
    const detail = read('apps/desktop/src/renderer/src/pages/OrderDetailPage.tsx');
    expect(detail.includes('设置该物料的时间轴')).toBe(true);
    expect(detail.includes('ITEM_STAGES')).toBe(true);
    expect(detail.includes('updateItemStage')).toBe(true);
    expect(detail.includes('完成百分比')).toBe(false);
    expect(detail.includes('progressPercent')).toBe(false);
    const shared = read('packages/shared/src/types.ts');
    expect(shared.includes('需求沟通')).toBe(true);
    expect(shared.includes('报价中')).toBe(true);
    expect(shared.includes('客户确认')).toBe(true);
  });

  it('订单管理可按时间轴进度排序，并支持按设置排序', () => {
    const board = read('apps/desktop/src/renderer/src/components/OrdersBoard.tsx');
    expect(board.includes('按进度 ↓（最快在前）')).toBe(true);
    expect(board.includes('按设置排序（自定义）')).toBe(true);
    expect(board.includes('manual:asc')).toBe(true);
    expect(board.includes('阶段')).toBe(true);
  });

  it('系统设置通过拖动订单设置顺序并保存', () => {
    const settings = read('apps/desktop/src/renderer/src/pages/SettingsPage.tsx');
    expect(settings.includes('订单展示顺序（拖动排序）')).toBe(true);
    expect(settings.includes('SortableList')).toBe(true);
    expect(settings.includes('api.orders.reorder')).toBe(true);
  });
});
