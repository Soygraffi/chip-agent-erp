import { describe, it } from 'node:test';
import { expect } from '../test-utils.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (p: string): string => readFileSync(join(root, p), 'utf8');

describe('V1.10 客户删除/明细交货/进度/排序/设置（需求2-6）', () => {
  it('客户管理不再提供删除按钮，删除入口在系统设置', () => {
    const customers = read('apps/desktop/src/renderer/src/pages/CustomersPage.tsx');
    expect(customers.includes('删除客户')).toBe(false);
    expect(customers.includes('softDelete')).toBe(false);
    const settings = read('apps/desktop/src/renderer/src/pages/SettingsPage.tsx');
    expect(settings.includes("key: 'danger'")).toBe(true);
    expect(settings.includes('softDelete')).toBe(true);
    expect(settings.includes('确认删除')).toBe(true);
  });

  it('订单明细每行可填实际交货日期', () => {
    const form = read('apps/desktop/src/renderer/src/pages/OrderFormPage.tsx');
    expect(form.includes("title: '实际交货日期'")).toBe(true);
    expect(form.includes('actualDeliveryDate')).toBe(true);
    const detail = read('apps/desktop/src/renderer/src/pages/OrderDetailPage.tsx');
    expect(detail.includes("title: '实际交货日期'")).toBe(true);
  });

  it('订单详情可为每条物料设置命名进度条', () => {
    const detail = read('apps/desktop/src/renderer/src/pages/OrderDetailPage.tsx');
    expect(detail.includes('设置物料进度')).toBe(true);
    expect(detail.includes('进度名称（可自定义）')).toBe(true);
    expect(detail.includes('updateItemProgress')).toBe(true);
    expect(detail.includes('<Progress')).toBe(true);
  });

  it('订单管理支持按进度排序且最快在前', () => {
    const board = read('apps/desktop/src/renderer/src/components/OrdersBoard.tsx');
    expect(board.includes("progress:desc")).toBe(true);
    expect(board.includes('按进度 ↓（最快在前）')).toBe(true);
  });

  it('系统设置可配置订单展示顺序并作为默认排序', () => {
    const settings = read('apps/desktop/src/renderer/src/pages/SettingsPage.tsx');
    expect(settings.includes('订单展示顺序')).toBe(true);
    expect(settings.includes('setOrderSort')).toBe(true);
    const board = read('apps/desktop/src/renderer/src/components/OrdersBoard.tsx');
    expect(board.includes('getOrderSort')).toBe(true);
  });
});
