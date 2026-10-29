import { describe, it } from 'node:test';
import { expect } from '../test-utils.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (p: string): string => readFileSync(join(root, p), 'utf8');

describe('报价单入口（V1.8.1）', () => {
  it('订单管理卡片提供「报价单」按钮并复用 QuoteModal', () => {
    const src = read('apps/desktop/src/renderer/src/components/OrdersBoard.tsx');
    expect(src.includes('报价单')).toBe(true);
    expect(src.includes('QuoteModal')).toBe(true);
    expect(src.includes('setQuoteOrder(o)')).toBe(true);
  });

  it('订单详情页提供 Word 报价单入口并复用 QuoteModal', () => {
    const src = read('apps/desktop/src/renderer/src/pages/OrderDetailPage.tsx');
    expect(src.includes('导出报价单（Word）')).toBe(true);
    expect(src.includes('QuoteModal')).toBe(true);
  });

  it('首页看板不显示报价单按钮，订单管理页保留', () => {
    const dash = read('apps/desktop/src/renderer/src/pages/DashboardPage.tsx');
    const orders = read('apps/desktop/src/renderer/src/pages/OrdersPage.tsx');
    expect(dash.includes('showQuote={false}')).toBe(true);
    expect(orders.includes('showQuote')).toBe(false);
  });

  it('新建订单页复用同一弹窗组件', () => {
    const src = read('apps/desktop/src/renderer/src/pages/OrderFormPage.tsx');
    expect(src.includes('QuoteModal')).toBe(true);
    expect(src.includes('openQuoteModal')).toBe(true);
  });

  it('弹窗字段齐全且空值不显示提示存在', () => {
    const src = read('apps/desktop/src/renderer/src/components/QuoteModal.tsx');
    for (const label of [
      '客户单位全称',
      '对接人',
      '联系电话（客户）',
      '客户地址',
      '报价日期',
      '报价有效期（天）',
      '报价人',
      '报价人电话',
      '备注说明',
      '添加一条备注',
    ]) {
      expect(src.includes(label)).toBe(true);
    }
    expect(src.includes('留空则不显示')).toBe(true);
  });
});
