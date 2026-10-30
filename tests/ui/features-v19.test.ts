import { describe, it } from 'node:test';
import { expect } from '../test-utils.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (p: string): string => readFileSync(join(root, p), 'utf8');

describe('V1.9 订单/报价单改造', () => {
  it('订单卡片物料列顺序：品牌→物料名称→料号规格→数量→含税金额', () => {
    const src = read('apps/desktop/src/renderer/src/components/OrdersBoard.tsx');
    const start = src.indexOf('const ITEM_COLUMNS');
    const block = src.slice(start, start + 800);
    const order = ['品牌', '物料名称', '料号规格', '数量', '含税金额'].map((t) => block.indexOf(`'${t}'`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('新建订单可选择每行供应商，并有二级菜单（订单数量/交期）', () => {
    const src = read('apps/desktop/src/renderer/src/pages/OrderFormPage.tsx');
    expect(src.includes("title: '供应商'")).toBe(true);
    expect(src.includes('supplierId')).toBe(true);
    expect(src.includes('更多信息（订单数量 / 交期）')).toBe(true);
    expect(src.includes('name="orderQty"')).toBe(true);
    expect(src.includes('name="expectedDeliveryDate"')).toBe(true);
  });

  it('订单详情支持上传并预览采购合同图片', () => {
    const src = read('apps/desktop/src/renderer/src/pages/OrderDetailPage.tsx');
    expect(src.includes('采购合同')).toBe(true);
    expect(src.includes('pickAndAddImage')).toBe(true);
    expect(src.includes('purchase_contract')).toBe(true);
    expect(src.includes('AntImage')).toBe(true);
    expect(src.includes("title: '供应商'")).toBe(true);
  });

  it('报价单不再输出公司盖章处', () => {
    const src = read('packages/tools/src/quote-docx.ts');
    expect(src.includes("run('（公司盖章处）'")).toBe(false);
    expect(src.includes('（公司盖章处）')).toBe(false);
  });

  it('报价单文件名规则：客户简称+报价单_日期', () => {
    const src = read('packages/tools/src/quote-docx.ts');
    expect(src.includes('quoteDocxFileName')).toBe(true);
    expect(src.includes('报价单_')).toBe(true);
  });
});
