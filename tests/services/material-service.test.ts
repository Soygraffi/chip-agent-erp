import { describe, it, beforeEach } from 'node:test';
import { expect } from '../test-utils.ts';
import type { DatabaseSync } from 'node:sqlite';
import { materialService, orderService } from '@erp/db';
import { createTestDb, seedMaterial, seedCustomer } from '../db/helpers.ts';

describe('物料服务（V1.3）', () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = createTestDb();
  });

  it('创建：编码/名称必填，价格非负，税率 0-100', () => {
    expect(() => materialService.create(db, { code: '', name: 'X' })).toThrowError(/物料编码不能为空/);
    expect(() => materialService.create(db, { code: 'A1', name: ' ' })).toThrowError(/物料名称不能为空/);
    expect(() =>
      materialService.create(db, { code: 'A1', name: 'X', salePrice: -1 }),
    ).toThrowError(/出货价必须为非负数/);
    expect(() =>
      materialService.create(db, { code: 'A1', name: 'X', taxRate: 101 }),
    ).toThrowError(/税率/);
    const id = materialService.create(db, {
      code: ' A001 ',
      name: ' ARM处理器 ',
      spec: 'GD32F407ZGT6',
      salePrice: 29.24,
      purchasePrice: 12.5,
    });
    const m = materialService.get(db, id);
    expect(m.code).toBe('A001');
    expect(m.name).toBe('ARM处理器');
    expect(m.taxRate).toBe(13); // 默认税率
    expect(m.priceTaxIncluded).toBe(true);
  });

  it('编码判重（自己编辑除外）', () => {
    const a = materialService.create(db, { code: 'A001', name: '物料A' });
    const b = materialService.create(db, { code: 'B002', name: '物料B' });
    expect(() => materialService.create(db, { code: ' a001 ', name: '重复' })).toThrowError(/物料编码已存在/);
    expect(() => materialService.update(db, b, { code: 'A001' })).toThrowError(/物料编码已存在/);
    materialService.update(db, a, { code: 'A001-X' });
    expect(materialService.get(db, a).code).toBe('A001-X');
  });

  it('被订单明细引用的物料不能删除，可停用', () => {
    const cid = seedCustomer(db, { name: '物料客户' });
    const mid = materialService.create(db, { code: 'A001', name: '物料A', salePrice: 10 });
    const oid = orderService.create(db, {
      customerId: cid,
      items: [
        {
          materialId: mid,
          materialCode: 'A001',
          materialName: '物料A',
          chipModel: 'GD32F407',
          brand: null,
          packageSpec: null,
          qty: 2,
          unitPrice: 10,
          purchasePrice: 5,
          priceTaxIncluded: true,
          taxRate: 13,
          subtotal: 20,
          customerPn: null,
          remark: null,
        },
      ],
    });
    expect(orderService.get(db, oid).items[0].materialId).toBe(mid);
    expect(() => materialService.delete(db, mid)).toThrowError(/不能删除/);
    materialService.update(db, mid, { isActive: false });
    expect(materialService.options(db)).toHaveLength(0);
    // 未被引用的物料可删除
    const unused = seedMaterial(db, { code: 'UNUSED' });
    materialService.delete(db, unused);
  });

  it('物料 → 关联订单查询', () => {
    const cid = seedCustomer(db, { name: '物料客户' });
    const mid = seedMaterial(db, { code: 'A001', name: '物料A' });
    const oid = orderService.create(db, {
      customerId: cid,
      items: [
        {
          materialId: mid,
          chipModel: 'GD32F407',
          brand: null,
          packageSpec: null,
          qty: 3,
          unitPrice: 10,
          subtotal: 30,
          customerPn: null,
          remark: null,
        },
      ],
    });
    const orders = materialService.ordersUsing(db, mid);
    expect(orders).toHaveLength(1);
    expect(orders[0].orderId).toBe(oid);
    expect(orders[0].customerName).toBe('物料客户');
  });
});
