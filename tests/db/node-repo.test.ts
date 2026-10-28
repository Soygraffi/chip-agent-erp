import { describe, it, beforeEach } from 'node:test';
import { expect } from '../test-utils.ts';
import type { DatabaseSync } from 'node:sqlite';
import {
  listNodesByOrder,
  insertNode,
  updateNode,
  deleteNode,
  reorderNodes,
  addFollowUp,
  listFollowUps,
  addAttachment,
  listAttachments,
  getAttachment,
  deleteAttachment,
  attachmentPathsByNode,
  attachmentPathsByOrder,
} from '@erp/db';
import { createTestDb, seedCustomer, seedOrder, seedNode, templateIdByCode } from './helpers.ts';

describe('进度节点仓储', () => {
  let db: DatabaseSync;
  let orderId: number;
  beforeEach(() => {
    db = createTestDb();
    const cid = seedCustomer(db);
    orderId = seedOrder(db, { customerId: cid });
  });

  it('节点带模板语义码读取', () => {
    const arrivalId = templateIdByCode(db, 'arrival');
    seedNode(db, orderId, { templateId: arrivalId, name: '到货入库', status: 'done', sortOrder: 1 });
    const nodes = listNodesByOrder(db, orderId);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].templateCode).toBe('arrival');
    expect(nodes[0].status).toBe('done');
  });

  it('更新节点：状态与计划时间', () => {
    const nid = seedNode(db, orderId, { name: '报价中', sortOrder: 1 });
    expect(updateNode(db, nid, { status: 'delayed', planTime: '2026-11-01' })).toBe(true);
    const nodes = listNodesByOrder(db, orderId);
    expect(nodes[0].status).toBe('delayed');
    expect(nodes[0].planTime).toBe('2026-11-01');
  });

  it('节点排序调整', () => {
    const n1 = seedNode(db, orderId, { name: 'A', sortOrder: 1 });
    const n2 = seedNode(db, orderId, { name: 'B', sortOrder: 2 });
    const n3 = seedNode(db, orderId, { name: 'C', sortOrder: 3 });
    reorderNodes(db, orderId, [n3, n1, n2]);
    const names = listNodesByOrder(db, orderId).map((n) => n.name);
    expect(names).toEqual(['C', 'A', 'B']);
  });

  it('删除节点级联删除跟进记录与附件记录', () => {
    const nid = seedNode(db, orderId, { name: 'A', sortOrder: 1 });
    addFollowUp(db, nid, '跟进一下');
    addAttachment(db, { nodeId: nid, originalName: 'a.pdf', storedPath: 'attachments/x/a.pdf', size: 10 });
    expect(deleteNode(db, nid)).toBe(true);
    const fu = db.prepare('SELECT COUNT(*) AS c FROM node_follow_up WHERE node_id = ?').get(nid) as { c: number };
    const att = db.prepare('SELECT COUNT(*) AS c FROM node_attachment WHERE node_id = ?').get(nid) as { c: number };
    expect(fu.c).toBe(0);
    expect(att.c).toBe(0);
  });

  it('跟进记录多次追加，按时间序', () => {
    const nid = seedNode(db, orderId, { name: 'A', sortOrder: 1 });
    addFollowUp(db, nid, '第一次跟进');
    addFollowUp(db, nid, '第二次跟进');
    const rows = listFollowUps(db, nid);
    expect(rows.map((r) => r.content)).toEqual(['第一次跟进', '第二次跟进']);
  });

  it('附件增查删与路径收集', () => {
    const nid = seedNode(db, orderId, { name: 'A', sortOrder: 1 });
    const aid = addAttachment(db, { nodeId: nid, originalName: '报价单.pdf', storedPath: `attachments/${orderId}/${nid}/x.pdf`, size: 123 });
    expect(listAttachments(db, nid)).toHaveLength(1);
    expect(getAttachment(db, aid)!.originalName).toBe('报价单.pdf');
    expect(attachmentPathsByNode(db, nid)).toEqual([`attachments/${orderId}/${nid}/x.pdf`]);
    expect(deleteAttachment(db, aid)).toBe(true);
    expect(listAttachments(db, nid)).toHaveLength(0);
  });

  it('按订单收集全部附件路径（删除订单前文件清理用）', () => {
    const n1 = seedNode(db, orderId, { name: 'A', sortOrder: 1 });
    const n2 = seedNode(db, orderId, { name: 'B', sortOrder: 2 });
    addAttachment(db, { nodeId: n1, originalName: 'a', storedPath: 'p/a', size: 1 });
    addAttachment(db, { nodeId: n2, originalName: 'b', storedPath: 'p/b', size: 1 });
    const paths = attachmentPathsByOrder(db, orderId);
    expect(paths.sort()).toEqual(['p/a', 'p/b']);
  });

  it('新节点可插入自定义节点（template_id 为空）', () => {
    const id = insertNode(db, {
      orderId,
      templateId: null,
      name: '自定义节点',
      status: 'pending',
      planTime: null,
      actualTime: null,
      owner: null,
      sortOrder: 99,
    });
    const nodes = listNodesByOrder(db, orderId);
    expect(nodes.find((n) => n.id === id)!.templateCode).toBeNull();
  });
});
