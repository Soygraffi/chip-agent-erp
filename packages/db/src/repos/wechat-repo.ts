import type { DatabaseSync } from 'node:sqlite';
import type { WechatGroup, WechatMember } from '@erp/shared';

const GROUP_COLS = `g.id, g.customer_id AS customerId, g.name, g.remark,
  g.sort_order AS sortOrder, g.created_at AS createdAt`;
const MEMBER_COLS = `m.id, m.group_id AS groupId, m.wechat_id AS wechatId, m.real_name AS realName,
  m.position, m.remark, m.sort_order AS sortOrder, m.created_at AS createdAt`;

export function listGroups(db: DatabaseSync, customerId: number): WechatGroup[] {
  return db
    .prepare(`SELECT ${GROUP_COLS} FROM customer_wechat_group g WHERE g.customer_id = ? ORDER BY g.sort_order, g.id`)
    .all(customerId)
    .map((r) => ({ ...r, remark: (r.remark as string | null) ?? null })) as WechatGroup[];
}

export function getGroup(db: DatabaseSync, id: number): WechatGroup | null {
  const r = db
    .prepare(`SELECT ${GROUP_COLS} FROM customer_wechat_group g WHERE g.id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  if (!r) return null;
  return { ...r, remark: (r.remark as string | null) ?? null } as WechatGroup;
}

export function insertGroup(
  db: DatabaseSync,
  customerId: number,
  input: { name: string; remark?: string | null; sortOrder?: number },
): number {
  const r = db
    .prepare(
      'INSERT INTO customer_wechat_group (customer_id, name, remark, sort_order) VALUES (?, ?, ?, ?)',
    )
    .run(customerId, input.name, input.remark ?? null, input.sortOrder ?? 0);
  return Number(r.lastInsertRowid);
}

export function updateGroup(
  db: DatabaseSync,
  id: number,
  patch: { name?: string; remark?: string | null; sortOrder?: number },
): boolean {
  const fields: string[] = [];
  const args: (string | number | null)[] = [];
  if (patch.name !== undefined) {
    fields.push('name = ?');
    args.push(patch.name);
  }
  if (patch.remark !== undefined) {
    fields.push('remark = ?');
    args.push(patch.remark);
  }
  if (patch.sortOrder !== undefined) {
    fields.push('sort_order = ?');
    args.push(patch.sortOrder);
  }
  if (fields.length === 0) return false;
  args.push(id);
  return db.prepare(`UPDATE customer_wechat_group SET ${fields.join(', ')} WHERE id = ?`).run(...args)
    .changes > 0;
}

export function deleteGroup(db: DatabaseSync, id: number): boolean {
  return db.prepare('DELETE FROM customer_wechat_group WHERE id = ?').run(id).changes > 0;
}

export function listMembers(db: DatabaseSync, groupId: number): WechatMember[] {
  return db
    .prepare(`SELECT ${MEMBER_COLS} FROM wechat_member m WHERE m.group_id = ? ORDER BY m.sort_order, m.id`)
    .all(groupId)
    .map((r) => ({
      ...r,
      realName: (r.realName as string | null) ?? null,
      position: (r.position as string | null) ?? null,
      remark: (r.remark as string | null) ?? null,
    })) as WechatMember[];
}

export function getMember(db: DatabaseSync, id: number): WechatMember | null {
  const r = db
    .prepare(`SELECT ${MEMBER_COLS} FROM wechat_member m WHERE m.id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  if (!r) return null;
  return {
    ...r,
    realName: (r.realName as string | null) ?? null,
    position: (r.position as string | null) ?? null,
    remark: (r.remark as string | null) ?? null,
  } as WechatMember;
}

export function insertMember(
  db: DatabaseSync,
  groupId: number,
  input: { wechatId: string; realName?: string | null; position?: string | null; remark?: string | null; sortOrder?: number },
): number {
  const r = db
    .prepare(
      'INSERT INTO wechat_member (group_id, wechat_id, real_name, position, remark, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(
      groupId,
      input.wechatId,
      input.realName ?? null,
      input.position ?? null,
      input.remark ?? null,
      input.sortOrder ?? 0,
    );
  return Number(r.lastInsertRowid);
}

export function updateMember(
  db: DatabaseSync,
  id: number,
  patch: { wechatId?: string; realName?: string | null; position?: string | null; remark?: string | null; sortOrder?: number },
): boolean {
  const map: Record<string, string> = {
    wechatId: 'wechat_id',
    realName: 'real_name',
    position: 'position',
    remark: 'remark',
  };
  const fields: string[] = [];
  const args: (string | number | null)[] = [];
  for (const [k, col] of Object.entries(map)) {
    const v = (patch as Record<string, unknown>)[k];
    if (v !== undefined) {
      fields.push(`${col} = ?`);
      args.push(v as string | null);
    }
  }
  if (patch.sortOrder !== undefined) {
    fields.push('sort_order = ?');
    args.push(patch.sortOrder);
  }
  if (fields.length === 0) return false;
  args.push(id);
  return db.prepare(`UPDATE wechat_member SET ${fields.join(', ')} WHERE id = ?`).run(...args)
    .changes > 0;
}

export function deleteMember(db: DatabaseSync, id: number): boolean {
  return db.prepare('DELETE FROM wechat_member WHERE id = ?').run(id).changes > 0;
}

/* ---------------- 订单 ↔ 微信群 ---------------- */

export function listGroupsByOrder(db: DatabaseSync, orderId: number): WechatGroup[] {
  return db
    .prepare(
      `SELECT g.id, g.customer_id AS customerId, g.name, g.remark,
              g.sort_order AS sortOrder, g.created_at AS createdAt
       FROM order_wechat_group og
       JOIN customer_wechat_group g ON g.id = og.group_id
       WHERE og.order_id = ?
       ORDER BY g.sort_order, g.id`,
    )
    .all(orderId)
    .map((r) => ({ ...r, remark: (r.remark as string | null) ?? null })) as WechatGroup[];
}

export function setOrderGroups(db: DatabaseSync, orderId: number, groupIds: number[]): void {
  db.prepare('DELETE FROM order_wechat_group WHERE order_id = ?').run(orderId);
  const stmt = db.prepare('INSERT INTO order_wechat_group (order_id, group_id) VALUES (?, ?)');
  for (const gid of groupIds) stmt.run(orderId, gid);
}
