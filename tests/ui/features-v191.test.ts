import { describe, it } from 'node:test';
import { expect } from '../test-utils.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (p: string): string => readFileSync(join(root, p), 'utf8');

describe('V1.9.1 订单录入界面优化', () => {
  it('客户与供应商下拉显示简称（有简称时）', () => {
    const src = read('apps/desktop/src/renderer/src/pages/OrderFormPage.tsx');
    expect(src.includes('const labelOf')).toBe(true);
    expect(src.includes('customers.map((c) => ({ value: c.id, label: labelOf(c) }))')).toBe(true);
    expect(src.includes('suppliers.map((s) => ({ value: s.id, label: labelOf(s) }))')).toBe(true);
  });

  it('物料明细去掉“从物料库选择”，名称/规格列加宽', () => {
    const src = read('apps/desktop/src/renderer/src/pages/OrderFormPage.tsx');
    expect(src.includes('从物料库选择')).toBe(false);
    expect(/title: '物料名称',\s*width: 200/.test(src)).toBe(true);
    expect(/title: '料号规格 \*',\s*width: 220/.test(src)).toBe(true);
  });

  it('订单详情只保留 Word 报价单按钮', () => {
    const src = read('apps/desktop/src/renderer/src/pages/OrderDetailPage.tsx');
    expect(src.includes('api.exportQuote(')).toBe(false);
    expect(src.includes('导出报价单（Word）')).toBe(true);
  });

  it('重点跟进改为 Switch 且带状态文案', () => {
    const src = read('apps/desktop/src/renderer/src/pages/OrderFormPage.tsx');
    expect(src.includes('checkedChildren="重点"')).toBe(true);
    expect(src.includes('unCheckedChildren="普通"')).toBe(true);
    expect(src.includes('<Switch')).toBe(true);
  });
});
