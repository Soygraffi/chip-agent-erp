import type { DatabaseSync } from 'node:sqlite';
import type { OrderAttachment } from '@erp/shared';
import { bizError } from '@erp/shared';
import {
  addOrderAttachment,
  deleteOrderAttachment,
  getOrderAttachment,
  listOrderAttachments,
  orderAttachmentPaths,
} from '../repos/attachment-repo.js';
import { getOrder } from '../repos/order-repo.js';

/** 订单文档（PDF / Word / 图片）服务：文件由上层复制进托管目录，这里只落记录 */
export const orderAttachmentService = {
  list(
    db: DatabaseSync,
    orderId: number,
    kind?: 'file' | 'purchase_contract',
  ): OrderAttachment[] {
    if (!getOrder(db, orderId)) throw bizError('ORDER_NOT_FOUND');
    return listOrderAttachments(db, orderId, kind);
  },

  add(
    db: DatabaseSync,
    orderId: number,
    a: { originalName: string; storedPath: string; size: number; kind?: 'file' | 'purchase_contract' },
  ): number {
    if (!getOrder(db, orderId)) throw bizError('ORDER_NOT_FOUND');
    return addOrderAttachment(db, { orderId, ...a });
  },

  remove(db: DatabaseSync, id: number): { storedPath: string } {
    const att = getOrderAttachment(db, id);
    if (!att) throw bizError('NOT_FOUND', '订单文档不存在');
    deleteOrderAttachment(db, id);
    return { storedPath: att.storedPath };
  },

  pathsByOrder(db: DatabaseSync, orderId: number): string[] {
    return orderAttachmentPaths(db, orderId);
  },
};
