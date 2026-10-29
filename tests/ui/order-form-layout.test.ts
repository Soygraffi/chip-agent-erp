import { describe, it } from 'node:test';
import { expect } from '../test-utils.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const file = join(process.cwd(), 'apps/desktop/src/renderer/src/pages/OrderFormPage.tsx');

describe('新建订单表单布局（V1.7）', () => {
  it('利润率列位于税率列之后', () => {
    const src = readFileSync(file, 'utf8');
    const taxIdx = src.indexOf("title: '税率%'");
    const marginIdx = src.indexOf("title: '利润率%'");
    expect(taxIdx).toBeGreaterThan(0);
    expect(marginIdx).toBeGreaterThan(taxIdx);
  });

  it('表单提供导出 Word 报价单按钮', () => {
    const src = readFileSync(file, 'utf8');
    expect(src.includes('导出报价单（Word）')).toBe(true);
    expect(src.includes('exportQuoteDocx')).toBe(true);
    expect(src.includes('export:quoteDocx')).toBe(false); // 渲染层只通过 api 封装调用
  });
});
