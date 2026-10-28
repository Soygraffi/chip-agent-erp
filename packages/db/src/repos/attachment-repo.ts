import type { DatabaseSync } from 'node:sqlite';
import type { OrderAttachment } from '@erp/shared';

const COLS = `a.id, a.order_id AS orderId, a.original_name AS originalName,
  a.stored_path AS storedPath, a.size, a.created_at AS createdAt`;

export function listOrderAttachments(db: DatabaseSync, orderId: number): OrderAttachment[] {
  return db
    .prepare(`SELECT ${COLS} FROM order_attachment a WHERE a.order_id = ? ORDER BY a.id`)
    .all(orderId) as unknown as OrderAttachment[];
}

export function getOrderAttachment(db: DatabaseSync, id: number): OrderAttachment | null {
  const r = db
    .prepare(`SELECT ${COLS} FROM order_attachment a WHERE a.id = ?`)
    .get(id) as OrderAttachment | undefined;
  return r ?? null;
}

export function addOrderAttachment(
  db: DatabaseSync,
  a: { orderId: number; originalName: string; storedPath: string; size: number },
): number {
  const r = db
    .prepare(
      'INSERT INTO order_attachment (order_id, original_name, stored_path, size) VALUES (?, ?, ?, ?)',
    )
    .run(a.orderId, a.originalName, a.storedPath, a.size);
  return Number(r.lastInsertRowid);
}

export function deleteOrderAttachment(db: DatabaseSync, id: number): boolean {
  return db.prepare('DELETE FROM order_attachment WHERE id = ?').run(id).changes > 0;
}

/** 删除订单前收集订单文档路径（用于文件清理） */
export function orderAttachmentPaths(db: DatabaseSync, orderId: number): string[] {
  return (
    db.prepare('SELECT stored_path FROM order_attachment WHERE order_id = ?').all(orderId) as {
      stored_path: string;
    }[]
  ).map((r) => r.stored_path);
}
