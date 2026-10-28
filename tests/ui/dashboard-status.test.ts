import { describe, it } from 'node:test';
import { expect } from '../test-utils.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const file = join(process.cwd(), 'apps/desktop/src/renderer/src/pages/DashboardPage.tsx');

describe('首页状态分布（数量为 0 的状态不展示）', () => {
  it('饼图与状态说明均基于过滤后的分布数据', () => {
    const src = readFileSync(file, 'utf8');
    expect(src.includes('s.count > 0')).toBe(true);
    // 图表数据与说明列表都使用 distribution，而不是原始 statusDistribution
    expect(src.includes('data: distribution.map')).toBe(true);
    expect(src.includes('{distribution.map(')).toBe(true);
    expect(src.includes('stats.statusDistribution.map')).toBe(false);
  });

  it('无数据时展示占位文案而不是空饼图', () => {
    const src = readFileSync(file, 'utf8');
    expect(src.includes('暂无订单数据')).toBe(true);
    expect(src.includes('distribution.length === 0')).toBe(true);
  });
});
