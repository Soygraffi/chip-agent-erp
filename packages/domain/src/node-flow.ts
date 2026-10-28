import type { NodeStatus, OrderNode, OrderStatus } from '@erp/shared';

/** 是否全部节点已完成（且节点数 > 0）——订单自动完结触发条件 */
export function allNodesDone(nodes: Pick<OrderNode, 'status'>[]): boolean {
  return nodes.length > 0 && nodes.every((n) => n.status === 'done');
}

/** 启用的“默认完成状态”（全局唯一），用于自动完结写入 */
export function defaultCompletedStatus(
  statuses: OrderStatus[],
): OrderStatus | undefined {
  return statuses.find((s) => s.enabled && s.isDefaultCompleted);
}

export interface NodeDoneResult {
  /** 被置为进行中的下一个节点 id（无则为 null） */
  promotedNodeId: number | null;
  /** 是否触发订单自动完结 */
  autoCompleted: boolean;
  /** 该节点实际完成时间被自动填补（原为空） */
  actualTimeAutoFilled: boolean;
}

/**
 * 节点标记「已完成」时的联动（PRD 4.4.2 / data-model 6.4、6.5）
 * 1. 实际完成时间为空则自动填 today
 * 2. 若存在排序在其后的第一个「未开始」节点 → 置为「进行中」（自动进入下一节点）
 * 3. 全部节点完成后返回 autoCompleted=true（订单级联动由服务层处理）
 * 返回的是修改后的节点副本，不改变传入对象。
 */
export function applyNodeDone(
  nodes: OrderNode[],
  nodeId: number,
  today: string,
): { nodes: OrderNode[]; result: NodeDoneResult } {
  const next = nodes.map((n) => ({ ...n }));
  const target = next.find((n) => n.id === nodeId);
  const result: NodeDoneResult = {
    promotedNodeId: null,
    autoCompleted: false,
    actualTimeAutoFilled: false,
  };
  if (!target || target.status === 'done') {
    result.autoCompleted = allNodesDone(next);
    return { nodes: next, result };
  }
  target.status = 'done';
  if (!target.actualTime) {
    target.actualTime = today;
    result.actualTimeAutoFilled = true;
  }
  const sorted = [...next].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const idx = sorted.findIndex((n) => n.id === nodeId);
  const successor = sorted.slice(idx + 1).find((n) => n.status === 'pending');
  if (successor) {
    successor.status = 'in_progress';
    result.promotedNodeId = successor.id;
  }
  result.autoCompleted = allNodesDone(next);
  return { nodes: next, result };
}

/** 校验节点状态流转合法性：允许的四元组内部任意流转（PRD 未限制方向） */
export const isNodeStatus = (s: unknown): s is NodeStatus =>
  typeof s === 'string' && ['pending', 'in_progress', 'done', 'delayed'].includes(s);
