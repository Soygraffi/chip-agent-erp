import { describe, it } from 'node:test';
import type { DatabaseSync } from 'node:sqlite';
import { expect } from '../test-utils.ts';
import { createTestDb } from '../db/helpers.ts';
import { customerService, orderService, orderAttachmentService } from '@erp/db';

function seedOrder(db: DatabaseSync): number {
  const cid = customerService.create(db, { name: '测试客户' });
  return orderService.create(db, { customerId: cid, items: [] });
}

describe('订单文档类型（V1.9 采购合同）', () => {
  it('采购合同单独标注 kind，可按类型过滤', () => {
    const db = createTestDb();
    const oid = seedOrder(db);
    orderAttachmentService.add(db, oid, {
      originalName: '报价.pdf',
      storedPath: 'orders/1/quote.pdf',
      size: 10,
    });
    orderAttachmentService.add(db, oid, {
      originalName: '采购合同1.png',
      storedPath: 'orders/1/contract1.png',
      size: 20,
      kind: 'purchase_contract',
    });

    const all = orderAttachmentService.list(db, oid);
    expect(all).toHaveLength(2);
    expect(all[0].kind).toBe('file');
    expect(all[1].kind).toBe('purchase_contract');

    const contracts = orderAttachmentService.list(db, oid, 'purchase_contract');
    expect(contracts).toHaveLength(1);
    expect(contracts[0].originalName).toBe('采购合同1.png');

    const files = orderAttachmentService.list(db, oid, 'file');
    expect(files).toHaveLength(1);
    db.close();
  });

  it('删除采购合同只删该条', () => {
    const db = createTestDb();
    const oid = seedOrder(db);
    const id = orderAttachmentService.add(db, oid, {
      originalName: '合同.jpg',
      storedPath: 'orders/1/c.jpg',
      size: 5,
      kind: 'purchase_contract',
    });
    orderAttachmentService.remove(db, id);
    expect(orderAttachmentService.list(db, oid)).toHaveLength(0);
    db.close();
  });
});
