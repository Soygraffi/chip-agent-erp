import { describe, it, beforeEach } from 'node:test';
import { expect } from '../test-utils.ts';
import type { DatabaseSync } from 'node:sqlite';
import { customerService } from '@erp/db';
import { createTestDb, seedOrder, statusByName } from '../db/helpers.ts';

describe('客户服务（V1.2：无联系人/电话字段）', () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = createTestDb();
  });

  it('创建客户：重名（归一化后）被拒', () => {
    const id = customerService.create(db, { name: '华强半导体' });
    expect(id).toBeGreaterThan(0);
    // 首尾空格 + 全角字母变体 → 归一化后重名
    expect(() => customerService.create(db, { name: ' 华强半导体 ' })).toThrowError(/客户名称已存在/);
    expect(() => customerService.create(db, { name: 'ＡＢＣ电子' })).not.toBe(0);
  });

  it('必填校验：仅客户全称必填；类型可选但必须是字典项', () => {
    expect(() => customerService.create(db, { name: '' })).toThrowError(/客户全称不能为空/);
    const id = customerService.create(db, { name: 'A公司', typeId: null });
    expect(id).toBeGreaterThan(0);
  });

  it('编辑客户改名触发唯一性校验（自己除外）', () => {
    const a = customerService.create(db, { name: '客户A' });
    const b = customerService.create(db, { name: '客户B' });
    customerService.update(db, a, { name: '客户A（改）' });
    expect(customerService.get(db, a).name).toBe('客户A（改）');
    expect(() => customerService.update(db, b, { name: '客户A（改）' })).toThrowError(/客户名称已存在/);
  });

  it('软删除返回订单数；删除后 options 与判重均排除', () => {
    const cid = customerService.create(db, { name: '客户A' });
    seedOrder(db, { customerId: cid, statusId: statusByName(db, '进行中') });
    seedOrder(db, { customerId: cid, statusId: statusByName(db, '进行中') });
    const r = customerService.softDelete(db, cid, '2026-10-28');
    expect(r.orderCount).toBe(2);
    expect(customerService.options(db).map((o) => o.id)).not.toContain(cid);
    // 同名可重新创建（软删除客户不参与判重）
    const newId = customerService.create(db, { name: '客户A' });
    expect(newId).not.toBe(cid);
  });

  it('normIndex 与 existingNorms 仅含未删除客户', () => {
    customerService.create(db, { name: '客户A' });
    const b = customerService.create(db, { name: '客户B' });
    customerService.softDelete(db, b, '2026-10-28');
    const index = customerService.normIndex(db);
    expect(index.has('客户a')).toBe(true);
    expect(index.has('客户b')).toBe(false);
  });

  it('拖动排序：list 顺序随 sort_order 变化，且只接受全集', () => {
    const a = customerService.create(db, { name: '客户A' });
    const b = customerService.create(db, { name: '客户B' });
    const c = customerService.create(db, { name: '客户C' });
    customerService.reorder(db, [c, a, b]);
    expect(customerService.list(db, { page: 1, pageSize: 10 }).rows.map((r) => r.name)).toEqual([
      '客户C',
      '客户A',
      '客户B',
    ]);
    expect(() => customerService.reorder(db, [c, a])).toThrowError(/排序列表与当前客户不一致/);
  });
});
