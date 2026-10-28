import { describe, it } from 'node:test';
import { expect } from '../test-utils.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RENDERER = join(process.cwd(), 'apps/desktop/src/renderer/src');

function read(rel: string): string {
  return readFileSync(join(RENDERER, rel), 'utf8');
}

/**
 * 回归守卫：antd Steps 的 onChange 在“点击当前步骤”时不会触发
 * （rc-steps: if (onChange && current !== next)），会导致第一个节点无法编辑。
 * 因此进度条必须使用自研 NodeStepper。
 */
describe('进度步骤条实现（防“第一步点不动”回归）', () => {
  it('订单管理卡片使用 NodeStepper，不再使用 antd Steps', () => {
    const src = read('components/OrdersBoard.tsx');
    expect(src.includes('NodeStepper')).toBe(true);
    expect(/<Steps[\s>]/.test(src)).toBe(false);
  });

  it('订单详情使用 NodeStepper，不再使用 antd Steps', () => {
    const src = read('pages/OrderDetailPage.tsx');
    expect(src.includes('NodeStepper')).toBe(true);
    expect(/<Steps[\s>]/.test(src)).toBe(false);
  });

  it('NodeStepper 整块区域可点击（onClick 绑定在每一步容器上）', () => {
    const src = read('components/NodeStepper.tsx');
    expect(src.includes('onClick={() => onSelect(n)}')).toBe(true);
    expect(src.includes('cursor: \'pointer\'')).toBe(true);
  });
});
