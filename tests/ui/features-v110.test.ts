import { describe, it } from 'node:test';
import { expect } from '../test-utils.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (p: string): string => readFileSync(join(root, p), 'utf8');

describe('V1.10 客户 Logo 清理（需求1）', () => {
  it('客户卡片与编辑弹窗都不再有“移除 Logo”按钮', () => {
    const src = read('apps/desktop/src/renderer/src/pages/CustomersPage.tsx');
    expect(src.includes('移除 Logo')).toBe(false);
    expect(src.includes('clearLogo')).toBe(false);
    // 上传/更换 Logo 仍保留
    expect(src.includes('上传/更换 Logo')).toBe(true);
  });
});
