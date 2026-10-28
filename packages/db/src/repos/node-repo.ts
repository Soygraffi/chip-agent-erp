import type { DatabaseSync } from 'node:sqlite';
import type { NodeAttachment, NodeFollowUp, NodeStatus, OrderNode } from '@erp/shared';

const NODE_COLS = `n.id, n.order_id AS orderId, n.template_id AS templateId, t.code AS templateCode,
  n.name, n.status, n.plan_time AS planTime, n.actual_time AS actualTime,
  n.sort_order AS sortOrder, n.created_at AS createdAt, n.updated_at AS updatedAt`;

export function listNodesByOrder(db: DatabaseSync, orderId: number): OrderNode[] {
  return db
    .prepare(
      `SELECT ${NODE_COLS} FROM order_node n LEFT JOIN node_template t ON t.id = n.template_id
       WHERE n.order_id = ? ORDER BY n.sort_order, n.id`,
    )
    .all(orderId)
    .map((r) => ({
      ...r,
      templateCode: (r.templateCode as string | null) ?? null,
      planTime: (r.planTime as string | null) ?? null,
      actualTime: (r.actualTime as string | null) ?? null,
      status: r.status as NodeStatus,
    })) as OrderNode[];
}

export function getNode(db: DatabaseSync, id: number): OrderNode | null {
  const r = db
    .prepare(`SELECT ${NODE_COLS} FROM order_node n LEFT JOIN node_template t ON t.id = n.template_id WHERE n.id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  if (!r) return null;
  return {
    ...r,
    templateCode: (r.templateCode as string | null) ?? null,
    planTime: (r.planTime as string | null) ?? null,
    actualTime: (r.actualTime as string | null) ?? null,
    status: r.status as NodeStatus,
  } as OrderNode;
}

export interface NodeInput {
  orderId: number;
  templateId: number | null;
  name: string;
  status: NodeStatus;
  planTime: string | null;
  actualTime: string | null;
  sortOrder: number;
}

export function insertNode(db: DatabaseSync, n: NodeInput): number {
  const r = db
    .prepare(
      'INSERT INTO order_node (order_id, template_id, name, status, plan_time, actual_time, sort_order) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(n.orderId, n.templateId, n.name, n.status, n.planTime, n.actualTime, n.sortOrder);
  return Number(r.lastInsertRowid);
}

export function updateNode(
  db: DatabaseSync,
  id: number,
  patch: {
    name?: string;
    status?: NodeStatus;
    planTime?: string | null;
    actualTime?: string | null;
  },
): boolean {
  const map: Record<string, string> = {
    name: 'name',
    status: 'status',
    planTime: 'plan_time',
    actualTime: 'actual_time',
  };
  const fields: string[] = [];
  const args: (string | number | null)[] = [];
  for (const [k, col] of Object.entries(map)) {
    const v = (patch as Record<string, unknown>)[k];
    if (v !== undefined) {
      fields.push(`${col} = ?`);
      args.push(v as string | number | null);
    }
  }
  if (fields.length === 0) return false;
  fields.push("updated_at = datetime('now','localtime')");
  args.push(id);
  return db.prepare(`UPDATE order_node SET ${fields.join(', ')} WHERE id = ?`).run(...args)
    .changes > 0;
}

export function deleteNode(db: DatabaseSync, id: number): boolean {
  return db.prepare('DELETE FROM order_node WHERE id = ?').run(id).changes > 0;
}

export function reorderNodes(db: DatabaseSync, orderId: number, ids: number[]): void {
  const stmt = db.prepare('UPDATE order_node SET sort_order = ? WHERE id = ? AND order_id = ?');
  ids.forEach((id, i) => stmt.run(i + 1, id, orderId));
}

export function maxNodeSort(db: DatabaseSync, orderId: number): number {
  const r = db
    .prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM order_node WHERE order_id = ?')
    .get(orderId) as { m: number };
  return r.m;
}

/* ---------------- node_follow_up ---------------- */

export function addFollowUp(db: DatabaseSync, nodeId: number, content: string): number {
  const r = db
    .prepare('INSERT INTO node_follow_up (node_id, content) VALUES (?, ?)')
    .run(nodeId, content);
  return Number(r.lastInsertRowid);
}

export function listFollowUps(db: DatabaseSync, nodeId: number): NodeFollowUp[] {
  return db
    .prepare(
      'SELECT id, node_id AS nodeId, content, created_at AS createdAt FROM node_follow_up ' +
        'WHERE node_id = ? ORDER BY id',
    )
    .all(nodeId) as unknown as NodeFollowUp[];
}

/* ---------------- node_attachment ---------------- */

export function addAttachment(
  db: DatabaseSync,
  a: { nodeId: number; originalName: string; storedPath: string; size: number },
): number {
  const r = db
    .prepare(
      'INSERT INTO node_attachment (node_id, original_name, stored_path, size) VALUES (?, ?, ?, ?)',
    )
    .run(a.nodeId, a.originalName, a.storedPath, a.size);
  return Number(r.lastInsertRowid);
}

export function listAttachments(db: DatabaseSync, nodeId: number): NodeAttachment[] {
  return db
    .prepare(
      'SELECT id, node_id AS nodeId, original_name AS originalName, stored_path AS storedPath, ' +
        'size, created_at AS createdAt FROM node_attachment WHERE node_id = ? ORDER BY id',
    )
    .all(nodeId) as unknown as NodeAttachment[];
}

export function getAttachment(db: DatabaseSync, id: number): NodeAttachment | null {
  const r = db
    .prepare(
      'SELECT id, node_id AS nodeId, original_name AS originalName, stored_path AS storedPath, ' +
        'size, created_at AS createdAt FROM node_attachment WHERE id = ?',
    )
    .get(id) as NodeAttachment | undefined;
  return r ?? null;
}

export function deleteAttachment(db: DatabaseSync, id: number): boolean {
  return db.prepare('DELETE FROM node_attachment WHERE id = ?').run(id).changes > 0;
}

/** 鍒犻櫎鑺傜偣鍓嶆敹闆嗗叾闄勪欢璺緞锛堢敤浜庢枃浠舵竻鐞嗭級 */
export function attachmentPathsByNode(db: DatabaseSync, nodeId: number): string[] {
  return (
    db.prepare('SELECT stored_path FROM node_attachment WHERE node_id = ?').all(nodeId) as {
      stored_path: string;
    }[]
  ).map((r) => r.stored_path);
}

/** 鍒犻櫎璁㈠崟鍓嶆敹闆嗗叏閮ㄩ檮浠惰矾寰勶紙鐢ㄤ簬鏂囦欢娓呯悊锛?*/
export function attachmentPathsByOrder(db: DatabaseSync, orderId: number): string[] {
  return (
    db
      .prepare(
        'SELECT na.stored_path FROM node_attachment na JOIN order_node n ON n.id = na.node_id ' +
          'WHERE n.order_id = ?',
      )
      .all(orderId) as { stored_path: string }[]
  ).map((r) => r.stored_path);
}
