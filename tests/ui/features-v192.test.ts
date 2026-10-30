import { describe, it } from 'node:test';
import { expect } from '../test-utils.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const src = readFileSync(
  join(root, 'apps/desktop/src/renderer/src/pages/OrderDetailPage.tsx'),
  'utf8',
);

describe('订单详情页布局（V1.9.2）', () => {
  it('订单文档移到页面最后（在进度之后）', () => {
    const docsIdx = src.indexOf('订单文档（');
    const nodeIdx = src.indexOf('进度（');
    expect(docsIdx).toBeGreaterThan(nodeIdx);
  });

  it('备注栏在采购合同上方', () => {
    const remarkIdx = src.indexOf('title="备注"');
    const contractIdx = src.indexOf('采购合同（');
    expect(remarkIdx).toBeGreaterThan(0);
    expect(remarkIdx).toBeLessThan(contractIdx);
  });

  it('备注可直接编辑并保存到订单', () => {
    expect(src.includes('Input.TextArea')).toBe(true);
    expect(src.includes('saveRemark')).toBe(true);
    expect(/api\.orders\.update\(orderId, \{ remark:/.test(src)).toBe(true);
  });
});
