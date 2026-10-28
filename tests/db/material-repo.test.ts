import { describe, it, beforeEach } from 'node:test';
import { expect } from '../test-utils.ts';
import type { DatabaseSync } from 'node:sqlite';
import {
  insertMaterial,
  getMaterial,
  updateMaterial,
  deleteMaterial,
  listMaterials,
  listMaterialOptions,
  listOrdersByMaterial,
  findMaterialByNorm,
  materialUsageCount,
} from '@erp/db';
import { createTestDb, seedMaterial, seedCustomer, seedOrder } from './helpers.ts';

describe('物料仓储（V1.3）', () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = createTestDb();
  });

  it('新增/读取：编码归一化、进货价与出货价、含税标记', () => {
    const id = insertMaterial(db, {
      code: 'RDDZX03001',
      codeNorm: 'rddzx03001',
      name: 'ARM处理器',
      spec: 'GD32F407ZGT6',
      brand: '兆易创新',
      purchasePrice: 12.5,
      salePrice: 29.24,
      priceTaxIncluded: true,
      taxRate: 13,
    });
    const m = getMaterial(db, id)!;
    expect(m.code).toBe('RDDZX03001');
    expect(m.purchasePrice).toBe(12.5);
    expect(m.salePrice).toBe(29.24);
    expect(m.priceTaxIncluded).toBe(true);
    expect(m.taxRate).toBe(13);
    expect(findMaterialByNorm(db, 'rddzx03001')!.id).toBe(id);
  });

  it('编码唯一（归一化后）', () => {
    seedMaterial(db, { code: 'ABC-01' });
    expect(() =>
      insertMaterial(db, { code: 'abc-01', codeNorm: 'abc-01', name: '重复' }),
    ).toThrow(/UNIQUE/);
  });

  it('列表检索：编码/名称/规格/品牌 + 关联订单统计', () => {
    const m1 = seedMaterial(db, { code: 'A001', name: 'ARM处理器', spec: 'GD32F407' });
    seedMaterial(db, { code: 'B002', name: '电源芯片', spec: 'AMS1117', brand: 'AMS' });
    const cid = seedCustomer(db);
    const oid = seedOrder(db, { customerId: cid });
    db.prepare(
      'INSERT INTO order_item (order_id, material_id, chip_model, qty, unit_price, subtotal) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(oid, m1, 'GD32F407', 10, 29.24, 292.4);

    expect(listMaterials(db, { page: 1, pageSize: 10 }).total).toBe(2);
    expect(listMaterials(db, { search: '电源', page: 1, pageSize: 10 }).total).toBe(1);
    expect(listMaterials(db, { search: 'GD32', page: 1, pageSize: 10 }).total).toBe(1);
    const row = listMaterials(db, { search: 'A001', page: 1, pageSize: 10 }).rows[0];
    expect(row.orderItemCount).toBe(1);
    expect(row.orderCount).toBe(1);

    const orders = listOrdersByMaterial(db, m1);
    expect(orders).toHaveLength(1);
    expect(orders[0].orderId).toBe(oid);
    expect(materialUsageCount(db, m1)).toBe(1);
  });

  it('更新与删除；选项只返回启用物料', () => {
    const id = seedMaterial(db);
    expect(updateMaterial(db, id, { salePrice: 30, isActive: false })).toBe(true);
    expect(getMaterial(db, id)).toMatchObject({ salePrice: 30, isActive: false });
    expect(listMaterialOptions(db)).toHaveLength(0);
    expect(deleteMaterial(db, id)).toBe(true);
    expect(getMaterial(db, id)).toBeNull();
  });
});
