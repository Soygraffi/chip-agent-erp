import { describe, it } from 'node:test';
import { expect } from '../test-utils.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RENDERER = join(process.cwd(), 'apps/desktop/src/renderer/src');

/** 回归守卫：Hook 不允许出现在组件提前 return 之后（否则 Hook 数量变化导致整页白屏） */
function hooksAfterEarlyReturn(file: string, earlyReturnPattern: RegExp): string[] {
  const lines = readFileSync(join(RENDERER, file), 'utf8').split('\n');
  const idx = lines.findIndex((l) => earlyReturnPattern.test(l));
  if (idx < 0) return [];
  return lines
    .slice(idx + 1)
    .map((l, i) => ({ line: l, no: idx + 2 + i }))
    .filter((x) => /^\s+use(Effect|State|Callback|Memo|Ref|Reducer|Context)\(/.test(x.line))
    .map((x) => `第 ${x.no} 行: ${x.line.trim()}`);
}

describe('渲染层 Hook 顺序（防白屏回归）', () => {
  it('OrderDetailPage：所有 Hook 在 if (!detail) return 之前', () => {
    const bad = hooksAfterEarlyReturn('pages/OrderDetailPage.tsx', /^\s+if \(!detail\) return/);
    expect(bad).toEqual([]);
  });

  it('CustomerDetailPage：所有 Hook 在 if (!customer) return 之前', () => {
    const bad = hooksAfterEarlyReturn('pages/CustomerDetailPage.tsx', /^\s+if \(!customer\) return/);
    expect(bad).toEqual([]);
  });
});
