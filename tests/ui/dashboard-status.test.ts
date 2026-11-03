import { describe, it } from 'node:test';
import { expect } from '../test-utils.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const file = join(process.cwd(), 'apps/desktop/src/renderer/src/pages/DashboardPage.tsx');

describe('首页状态分布（数量为 0 的状态不展示）', () => {
  it('饼图基于过滤后的分布数据，下方说明列表已移除', () => {
    const src = readFileSync(file, 'utf8');
    expect(src.includes('s.count > 0')).toBe(true);
    expect(src.includes('data: distribution.map')).toBe(true);
    expect(src.includes('状态说明')).toBe(false);
    expect(src.includes('{distribution.map(')).toBe(false);
    expect(src.includes('stats.statusDistribution.map')).toBe(false);
  });

  it('无数据时展示占位文案而不是空饼图', () => {
    const src = readFileSync(file, 'utf8');
    expect(src.includes('暂无订单数据')).toBe(true);
    expect(src.includes('distribution.length === 0')).toBe(true);
  });
});
