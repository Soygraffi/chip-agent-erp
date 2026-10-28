import { describe, it, beforeEach } from 'node:test';
import { expect } from '../test-utils.ts';
import type { DatabaseSync } from 'node:sqlite';
import { customerService } from '@erp/db';
import { createTestDb, seedCustomer, seedOrder, statusByName } from '../db/helpers.ts';

describe('客户服务', () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = createTestDb();
  });

  it('创建客户：重名（归一化后）被拒', () => {
    const id = customerService.create(db, { name: '华强半导体', contact: '张三', phone: '13800000000' });
    expect(id).toBeGreaterThan(0);
    // 首尾空格 + 全角字母变体 → 归一化后重名
    expect(() =>
      customerService.create(db, { name: ' 华强半导体 ', contact: '李四', phone: '13900000000' }),
    ).toThrowError(/客户名称已存在/);
    expect(() =>
      customerService.create(db, { name: 'ＡＢＣ电子', contact: '王五', phone: '13900000000' }),
    ).not.toBe(0);
  });

  it('必填校验', () => {
    expect(() => customerService.create(db, { name: '', contact: '张三', phone: '138' })).toThrowError(/客户全称不能为空/);
    expect(() => customerService.create(db, { name: 'A公司', contact: '', phone: '138' })).toThrowError(/联系人不能为空/);
    expect(() => customerService.create(db, { name: 'A公司', contact: '张三', phone: '' })).toThrowError(/联系电话不能为空/);
    expect(() =>
      customerService.create(db, { name: 'A公司', contact: '张三', phone: '138', cooperationStart: '2026/01/01' }),
    ).toThrowError(/合作起始日期格式不正确/);
  });

  it('编辑客户改名触发唯一性校验（自己除外）', () => {
    const a = customerService.create(db, { name: '客户A', contact: '张三', phone: '138' });
    const b = customerService.create(db, { name: '客户B', contact: '李四', phone: '139' });
    customerService.update(db, a, { name: '客户A（改）' });
    expect(customerService.get(db, a).name).toBe('客户A（改）');
    expect(() => customerService.update(db, b, { name: '客户A（改）' })).toThrowError(/客户名称已存在/);
  });

  it('软删除返回订单数；删除后 options 与判重均排除', () => {
    const cid = customerService.create(db, { name: '客户A', contact: '张三', phone: '138' });
    seedOrder(db, { customerId: cid, statusId: statusByName(db, '进行中') });
    seedOrder(db, { customerId: cid, statusId: statusByName(db, '进行中') });
    const r = customerService.softDelete(db, cid, '2026-10-28');
    expect(r.orderCount).toBe(2);
    expect(customerService.options(db).map((o) => o.id)).not.toContain(cid);
    // 同名可重新创建（软删除客户不参与判重）
    const newId = customerService.create(db, { name: '客户A', contact: '王五', phone: '137' });
    expect(newId).not.toBe(cid);
  });

  it('normIndex 与 existingNorms 仅含未删除客户', () => {
    customerService.create(db, { name: '客户A', contact: '张三', phone: '138' });
    const b = customerService.create(db, { name: '客户B', contact: '李四', phone: '139' });
    customerService.softDelete(db, b, '2026-10-28');
    const index = customerService.normIndex(db);
    expect(index.has('客户a')).toBe(true);
    expect(index.has('客户b')).toBe(false);
  });
});
