import type { DatabaseSync } from 'node:sqlite';
import type { NodeAttachment, NodeFollowUp, NodeStatus, OrderNode } from '@erp/shared';
import { bizError, isValidDateStr, todayStr } from '@erp/shared';
import {
  addAttachment,
  addFollowUp,
  attachmentPathsByNode,
  deleteAttachment,
  deleteNode,
  getNode,
  getOrder,
  getStatus,
  insertNode,
  listAttachments,
  listFollowUps,
  listNodesByOrder,
  listStatuses,
  maxNodeSort,
  reorderNodes,
  setStatus,
  updateNode,
} from '../repos/index.js';
import { withTransaction } from '../connection.js';
import { applyNodeDone, defaultCompletedStatus } from '@erp/domain';

export interface NodeUpdateInput {
  name?: string;
  status?: NodeStatus;
  planTime?: string | null;
  actualTime?: string | null;
  owner?: string | null;
}

export interface NodeDoneOutcome {
  promotedNodeId: number | null;
  autoCompleted: boolean;
  orderStatusChangedTo: number | null;
}

export const nodeService = {
  listByOrder(db: DatabaseSync, orderId: number): OrderNode[] {
    return listNodesByOrder(db, orderId);
  },

  create(
    db: DatabaseSync,
    orderId: number,
    input: { name: string; owner?: string | null; planTime?: string | null },
  ): number {
    if (!getOrder(db, orderId)) throw bizError('ORDER_NOT_FOUND');
    if (!input.name || !input.name.trim()) throw bizError('VALIDATION', '节点名称不能为空');
    if (input.planTime && !isValidDateStr(input.planTime))
      throw bizError('VALIDATION', '计划完成时间格式不正确');
    return insertNode(db, {
      orderId,
      templateId: null,
      name: input.name.trim(),
      status: 'pending',
      planTime: input.planTime ?? null,
      actualTime: null,
      owner: input.owner ?? null,
      sortOrder: maxNodeSort(db, orderId) + 1,
    });
  },

  /**
   * 更新节点；状态改为 done 时触发完整状态机（自动填实际时间 / 自动进入下一节点 /
   * 全节点完成 → 订单自动置完成态，单向联动，PRD 4.4.2 / data-model 6.4 6.5）
   */
  update(db: DatabaseSync, id: number, input: NodeUpdateInput): NodeDoneOutcome {
    const node = getNode(db, id);
    if (!node) throw bizError('NODE_NOT_FOUND');
    const outcome: NodeDoneOutcome = { promotedNodeId: null, autoCompleted: false, orderStatusChangedTo: null };
    if (input.planTime && !isValidDateStr(input.planTime))
      throw bizError('VALIDATION', '计划完成时间格式不正确');

    withTransaction(db, () => {
      if (input.status === 'done' && node.status !== 'done') {
        // 状态机：自动填实际时间 → 提升下一未开始节点 → 全节点完成自动完结
        const nodes = listNodesByOrder(db, node.orderId);
        const { nodes: updated, result } = applyNodeDone(nodes, id, todayStr());
        const done = updated.find((n) => n.id === id)!;
        updateNode(db, id, {
          name: input.name ?? done.name,
          planTime: input.planTime ?? done.planTime,
          actualTime: input.actualTime ?? done.actualTime,
          owner: input.owner ?? done.owner,
          status: 'done',
        });
        if (result.promotedNodeId != null) {
          updateNode(db, result.promotedNodeId, { status: 'in_progress' });
        }
        outcome.promotedNodeId = result.promotedNodeId;
        outcome.autoCompleted = result.autoCompleted;
        if (result.autoCompleted) {
          const order = getOrder(db, node.orderId);
          const current = order ? getStatus(db, order.statusId) : null;
          // 单向联动：仅订单当前非终态时自动置完成态
          if (current && !current.isTerminal) {
            const target = defaultCompletedStatus(listStatuses(db, true));
            if (target) {
              setStatus(db, node.orderId, target.id);
              outcome.orderStatusChangedTo = target.id;
            }
          }
        }
      } else {
        updateNode(db, id, input);
      }
    });
    return outcome;
  },

  /** 仅更新字段（不触发状态机） */
  updateFields(db: DatabaseSync, id: number, input: NodeUpdateInput): void {
    if (!getNode(db, id)) throw bizError('NODE_NOT_FOUND');
    if (input.planTime && !isValidDateStr(input.planTime))
      throw bizError('VALIDATION', '计划完成时间格式不正确');
    updateNode(db, id, input);
  },

  reorder(db: DatabaseSync, orderId: number, ids: number[]): void {
    const existing = listNodesByOrder(db, orderId);
    const existingIds = new Set(existing.map((n) => n.id));
    if (ids.length !== existingIds.size || ids.some((i) => !existingIds.has(i)))
      throw bizError('VALIDATION', '节点列表与现有节点不一致');
    reorderNodes(db, orderId, ids);
  },

  delete(db: DatabaseSync, id: number): { attachmentPaths: string[] } {
    if (!getNode(db, id)) throw bizError('NODE_NOT_FOUND');
    const paths = attachmentPathsByNode(db, id);
    deleteNode(db, id);
    return { attachmentPaths: paths };
  },

  addFollowUp(db: DatabaseSync, nodeId: number, content: string): number {
    if (!getNode(db, nodeId)) throw bizError('NODE_NOT_FOUND');
    if (!content || !content.trim()) throw bizError('VALIDATION', '跟进内容不能为空');
    return addFollowUp(db, nodeId, content.trim());
  },

  listFollowUps(db: DatabaseSync, nodeId: number): NodeFollowUp[] {
    return listFollowUps(db, nodeId);
  },

  addAttachment(
    db: DatabaseSync,
    nodeId: number,
    a: { originalName: string; storedPath: string; size: number },
  ): number {
    if (!getNode(db, nodeId)) throw bizError('NODE_NOT_FOUND');
    return addAttachment(db, { nodeId, ...a });
  },

  listAttachments(db: DatabaseSync, nodeId: number): NodeAttachment[] {
    return listAttachments(db, nodeId);
  },

  deleteAttachment(db: DatabaseSync, id: number): { storedPath: string } {
    const att = db
      .prepare('SELECT id, stored_path AS storedPath FROM node_attachment WHERE id = ?')
      .get(id) as { id: number; storedPath: string } | undefined;
    if (!att) throw bizError('NOT_FOUND', '附件不存在');
    deleteAttachment(db, id);
    return { storedPath: att.storedPath };
  },
};
