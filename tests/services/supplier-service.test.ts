import { describe, it, beforeEach } from 'node:test';
import { expect } from '../test-utils.ts';
import type { DatabaseSync } from 'node:sqlite';
import { supplierService, materialService } from '@erp/db';
import { createTestDb } from '../db/helpers.ts';

describe('供应商管理（V1.6）', () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = createTestDb();
  });

  it('创建：名称必填、重名（归一化）拒绝', () => {
    expect(() => supplierService.create(db, { name: '  ' })).toThrowError(/供应商名称不能为空/);
    const id = supplierService.create(db, {
      name: '深圳华强电子',
      shortName: '华强',
      contact: '张三',
      phone: '13800000000',
    });
    expect(id).toBeGreaterThan(0);
    expect(() => supplierService.create(db, { name: ' 深圳华强电子 ' })).toThrowError(/供应商名称已存在/);
  });

  it('编辑与软删除：删除后列表与选项均排除', () => {
    const id = supplierService.create(db, { name: 'A供应商' });
    supplierService.update(db, id, { contact: '李四', remark: '长期合作' });
    expect(supplierService.get(db, id)).toMatchObject({ contact: '李四', remark: '长期合作' });
    supplierService.softDelete(db, id, '2026-10-28');
    expect(supplierService.list(db, { page: 1, pageSize: 10 }).total).toBe(0);
    expect(supplierService.options(db)).toHaveLength(0);
    // 同名可重新创建
    expect(supplierService.create(db, { name: 'A供应商' })).toBeGreaterThan(0);
  });

  it('列表搜索：名称/简称/联系人', () => {
    supplierService.create(db, { name: '深圳华强电子', shortName: '华强', contact: '张三' });
    supplierService.create(db, { name: '上海芯源半导体', shortName: '芯源', contact: '李四' });
    expect(supplierService.list(db, { search: '华强', page: 1, pageSize: 10 }).total).toBe(1);
    expect(supplierService.list(db, { search: '李四', page: 1, pageSize: 10 }).total).toBe(1);
    expect(supplierService.list(db, { page: 1, pageSize: 10 }).total).toBe(2);
  });

  it('物料可关联供应商，并统计该供应商的物料数', () => {
    const sid = supplierService.create(db, { name: '深圳华强电子' });
    const mid = materialService.create(db, {
      code: 'RDDZX03001',
      name: 'ARM处理器',
      supplierId: sid,
      salePrice: 29.24,
    });
    expect(materialService.get(db, mid).supplierId).toBe(sid);
    const row = materialService.list(db, { page: 1, pageSize: 10 }).rows[0];
    expect(row.supplierName).toBe('深圳华强电子');
    expect(supplierService.materialCount(db, sid)).toBe(1);
    expect(supplierService.list(db, { page: 1, pageSize: 10 }).rows[0].materialCount).toBe(1);
    // 解除关联
    materialService.update(db, mid, { supplierId: null });
    expect(supplierService.materialCount(db, sid)).toBe(0);
  });
});
