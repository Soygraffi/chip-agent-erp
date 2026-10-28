import { describe, it } from 'node:test';
import { expect } from '../test-utils.ts';
import { applyNodeDone, allNodesDone, defaultCompletedStatus } from '@erp/domain';
import type { OrderNode, OrderStatus } from '@erp/shared';

let nextId = 1;
function node(
  partial: Partial<OrderNode> & { sortOrder: number },
): OrderNode {
  return {
    id: nextId++,
    orderId: 1,
    templateId: null,
    templateCode: null,
    name: `节点${partial.sortOrder}`,
    status: 'pending',
    planTime: null,
    actualTime: null,
    owner: null,
    createdAt: '',
    updatedAt: '',
    ...partial,
  };
}

function statuses(): OrderStatus[] {
  return [
    { id: 1, name: '待确认', color: '#8C8C8C', sortOrder: 1, isTerminal: false, terminalResult: null, isDefaultCompleted: false, isSystem: true, enabled: true },
    { id: 4, name: '已完结', color: '#52C41A', sortOrder: 4, isTerminal: true, terminalResult: 'completed', isDefaultCompleted: true, isSystem: true, enabled: true },
    { id: 5, name: '已取消', color: '#595959', sortOrder: 5, isTerminal: true, terminalResult: 'cancelled', isDefaultCompleted: false, isSystem: true, enabled: true },
  ];
}

describe('节点状态机', () => {
  it('标记完成：自动填补实际完成时间', () => {
    const nodes = [node({ id: 11, sortOrder: 1 })];
    const { nodes: out, result } = applyNodeDone(nodes, 11, '2026-10-28');
    expect(out[0].status).toBe('done');
    expect(out[0].actualTime).toBe('2026-10-28');
    expect(result.actualTimeAutoFilled).toBe(true);
  });

  it('已有实际时间则不覆盖', () => {
    const nodes = [node({ id: 11, sortOrder: 1, actualTime: '2026-10-20' })];
    const { nodes: out } = applyNodeDone(nodes, 11, '2026-10-28');
    expect(out[0].actualTime).toBe('2026-10-20');
  });

  it('自动进入下一节点：后一个未开始节点置为进行中', () => {
    const nodes = [
      node({ id: 11, sortOrder: 1 }),
      node({ id: 12, sortOrder: 2 }),
      node({ id: 13, sortOrder: 3, status: 'in_progress' }),
    ];
    const { nodes: out, result } = applyNodeDone(nodes, 11, '2026-10-28');
    expect(out.find((n) => n.id === 12)!.status).toBe('in_progress');
    expect(result.promotedNodeId).toBe(12);
    // 已经是进行中的节点不受影响
    expect(out.find((n) => n.id === 13)!.status).toBe('in_progress');
  });

  it('没有后续未开始节点时不提升任何节点', () => {
    const nodes = [
      node({ id: 11, sortOrder: 1 }),
      node({ id: 12, sortOrder: 2, status: 'delayed' }),
      node({ id: 13, sortOrder: 3, status: 'done' }),
    ];
    const { result } = applyNodeDone(nodes, 11, '2026-10-28');
    expect(result.promotedNodeId).toBeNull();
  });

  it('全部节点完成后触发自动完结', () => {
    const nodes = [
      node({ id: 11, sortOrder: 1, status: 'done' }),
      node({ id: 12, sortOrder: 2, status: 'done' }),
      node({ id: 13, sortOrder: 3 }),
    ];
    const { result } = applyNodeDone(nodes, 13, '2026-10-28');
    expect(result.autoCompleted).toBe(true);
  });

  it('节点数为 0 不触发自动完结', () => {
    expect(allNodesDone([])).toBe(false);
    const { result } = applyNodeDone([], 1, '2026-10-28');
    expect(result.autoCompleted).toBe(false);
  });

  it('重复标记已完成不产生副作用', () => {
    const nodes = [node({ id: 11, sortOrder: 1, status: 'done', actualTime: '2026-10-20' })];
    const { nodes: out, result } = applyNodeDone(nodes, 11, '2026-10-28');
    expect(out[0].status).toBe('done');
    expect(out[0].actualTime).toBe('2026-10-20');
    expect(result.promotedNodeId).toBeNull();
    expect(result.autoCompleted).toBe(true); // 全 done 且 >0 → 仍满足自动完结条件
  });

  it('默认完成状态选择：取启用且标记默认完成者', () => {
    const s = statuses();
    expect(defaultCompletedStatus(s)?.name).toBe('已完结');
    const s2 = statuses().map((x) => (x.name === '已完结' ? { ...x, enabled: false } : x));
    expect(defaultCompletedStatus(s2)).toBeUndefined();
  });
});
