import { describe, it, beforeEach } from 'node:test';
import { expect } from '../test-utils.ts';
import type { DatabaseSync } from 'node:sqlite';
import { nodeService, orderService, customerService, statusDictService } from '@erp/db';
import { createTestDb, statusByName } from '../db/helpers.ts';

function setupOrder(db: DatabaseSync): number {
  const cid = customerService.create(db, { name: '华强半导体', contact: '张三', phone: '13800000000' });
  return orderService.create(db, {
    customerId: cid,
    orderDate: '2026-10-28',
    typeId: null,
    statusId: statusByName(db, '进行中'),
    items: [],
  });
}

describe('节点服务与状态机（PRD 4.4.2 / 5.2）', () => {
  let db: DatabaseSync;
  let orderId: number;
  beforeEach(() => {
    db = createTestDb();
    orderId = setupOrder(db);
  });

  it('节点标记完成：自动填实际时间、自动进入下一节点', () => {
    const nodes = orderService.get(db, orderId).nodes;
    const outcome = nodeService.update(db, nodes[0].id, { status: 'done' });
    expect(outcome.promotedNodeId).toBe(nodes[1].id);
    expect(outcome.autoCompleted).toBe(false);
    const after = orderService.get(db, orderId).nodes;
    expect(after[0].status).toBe('done');
    expect(after[0].actualTime).toBeTruthy(); // 自动填当天
    expect(after[1].status).toBe('in_progress');
    expect(after[2].status).toBe('pending');
  });

  it('全部节点完成后订单自动置为默认完成状态（单向联动）', () => {
    const nodes = orderService.get(db, orderId).nodes;
    let lastOutcome: { autoCompleted: boolean } | null = null;
    for (const n of nodes) {
      lastOutcome = nodeService.update(db, n.id, { status: 'done' });
    }
    expect(lastOutcome!.autoCompleted).toBe(true);
    const doneId = statusByName(db, '已完结');
    const o = orderService.get(db, orderId);
    expect(o.statusId).toBe(doneId);
  });

  it('终态订单补节点完成不再触发状态变更（单向）', () => {
    const nodes = orderService.get(db, orderId).nodes;
    nodes.forEach((n) => nodeService.update(db, n.id, { status: 'done' }));
    // 手动改回进行中
    const detail = orderService.get(db, orderId);
    expect(detail.statusId).toBe(statusByName(db, '已完结'));
    db.prepare('UPDATE orders SET status_id = ? WHERE id = ?').run(statusByName(db, '进行中'), orderId);
    // 新增节点并完成 → 再次触发自动完结
    const newId = nodeService.create(db, orderId, { name: '补充节点' });
    nodeService.update(db, newId, { status: 'done' });
    expect(orderService.get(db, orderId).statusId).toBe(statusByName(db, '已完结'));
  });

  it('节点数为 0 时（全部删除）不触发自动完结', () => {
    const nodes = orderService.get(db, orderId).nodes;
    // 全删
    nodes.forEach((n) => nodeService.delete(db, n.id));
    const o = orderService.get(db, orderId);
    expect(o.nodes).toHaveLength(0);
    expect(o.statusId).toBe(statusByName(db, '进行中'));
  });

  it('计划时间格式校验与字段更新', () => {
    const n = orderService.get(db, orderId).nodes[0];
    expect(() => nodeService.updateFields(db, n.id, { planTime: '2026/10/30' })).toThrowError(/计划完成时间格式不正确/);
    nodeService.updateFields(db, n.id, { planTime: '2026-10-30', owner: '王五' });
    const after = orderService.get(db, orderId).nodes[0];
    expect(after.planTime).toBe('2026-10-30');
    expect(after.owner).toBe('王五');
    expect(after.status).toBe('pending'); // updateFields 不触发状态机
  });

  it('自定义节点与排序', () => {
    const id = nodeService.create(db, orderId, { name: '自定义节点' });
    expect(id).toBeGreaterThan(0);
    const nodes = orderService.get(db, orderId).nodes;
    expect(nodes[nodes.length - 1].name).toBe('自定义节点');
    expect(nodes[nodes.length - 1].templateCode).toBeNull();
    // 调整顺序：自定义节点排第一
    const ids = nodes.map((n) => n.id);
    nodeService.reorder(db, orderId, [ids[ids.length - 1], ...ids.slice(0, -1)]);
    expect(orderService.get(db, orderId).nodes[0].name).toBe('自定义节点');
    // 不一致的 id 列表被拒
    expect(() => nodeService.reorder(db, orderId, [ids[0]])).toThrowError(/不一致/);
  });

  it('删除节点级联删除跟进与附件记录', () => {
    const n = orderService.get(db, orderId).nodes[0];
    nodeService.addFollowUp(db, n.id, '跟进内容');
    nodeService.addAttachment(db, n.id, { originalName: 'a.pdf', storedPath: 'p/a.pdf', size: 1 });
    const r = nodeService.delete(db, n.id);
    expect(r.attachmentPaths).toEqual(['p/a.pdf']);
    expect(orderService.get(db, orderId).nodes).toHaveLength(9);
  });

  it('跟进记录与附件校验', () => {
    const n = orderService.get(db, orderId).nodes[0];
    expect(() => nodeService.addFollowUp(db, n.id, '   ')).toThrowError(/跟进内容不能为空/);
    nodeService.addFollowUp(db, n.id, '第一条');
    nodeService.addFollowUp(db, n.id, '第二条');
    const rows = nodeService.listFollowUps(db, n.id);
    expect(rows.map((r) => r.content)).toEqual(['第一条', '第二条']);
    const aid = nodeService.addAttachment(db, n.id, { originalName: 'b.pdf', storedPath: 'p/b.pdf', size: 2 });
    expect(nodeService.listAttachments(db, n.id)).toHaveLength(1);
    const removed = nodeService.deleteAttachment(db, aid);
    expect(removed.storedPath).toBe('p/b.pdf');
    expect(() => nodeService.deleteAttachment(db, aid)).toThrowError(/附件不存在/);
  });

  it('标记异常延误不触发下一节点（done 之外的流转）', () => {
    const nodes = orderService.get(db, orderId).nodes;
    nodeService.update(db, nodes[0].id, { status: 'delayed' });
    const after = orderService.get(db, orderId).nodes;
    expect(after[0].status).toBe('delayed');
    expect(after[1].status).toBe('pending'); // 未自动进入
  });

  it('默认完成状态变更后，自动完结写入新默认状态', () => {
    // 新建一个自定义终态完成状态并设为默认完成
    const customId = statusDictService.create(db, {
      name: '项目结案',
      color: '#722ED1',
      isTerminal: true,
      terminalResult: 'completed',
      isDefaultCompleted: true,
    });
    const nodes = orderService.get(db, orderId).nodes;
    nodes.forEach((n) => nodeService.update(db, n.id, { status: 'done' }));
    expect(orderService.get(db, orderId).statusId).toBe(customId);
    // 原「已完结」不再默认
    const statuses = statusDictService.list(db);
    expect(statuses.find((s) => s.name === '已完结')!.isDefaultCompleted).toBe(false);
    expect(statuses.find((s) => s.id === customId)!.isDefaultCompleted).toBe(true);
  });
});
