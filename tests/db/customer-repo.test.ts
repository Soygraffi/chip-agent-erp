import { describe, it, beforeEach } from 'node:test';
import { expect } from '../test-utils.ts';
import type { DatabaseSync } from 'node:sqlite';
import {
  insertCustomer,
  getCustomer,
  updateCustomer,
  softDeleteCustomer,
  listCustomers,
  activeNameNorms,
  findActiveCustomerIdByNorm,
  customerOrderCounts,
} from '@erp/db';
import { createTestDb, seedCustomer, seedOrder, statusByName } from './helpers.ts';

describe('客户仓储', () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = createTestDb();
  });

  it('新增与读取', () => {
    const id = insertCustomer(db, {
      name: ' ＡＢＣ 电子 ',
      nameNorm: 'abc 电子',
      contact: '张三',
      phone: '13800000000',
      isKey: true,
    });
    const c = getCustomer(db, id)!;
    expect(c.name).toBe(' ＡＢＣ 电子 '); // 保留原始写法
    expect(c.nameNorm).toBe('abc 电子');
    expect(c.isKey).toBe(true);
    expect(c.deletedAt).toBeNull();
  });

  it('部分唯一索引：未删除客户重名（归一化后）抛错', () => {
    seedCustomer(db, { name: '华强半导体' });
    expect(() =>
      insertCustomer(db, {
        name: ' 华强半导体 ',
        nameNorm: ' 华强半导体 '.trim().normalize('NFKC').toLowerCase(),
        contact: '李四',
        phone: '13900000000',
      }),
    ).toThrow(/UNIQUE/);
  });

  it('软删除后重名可再次注册（判重范围仅未删除客户）', () => {
    const id1 = seedCustomer(db, { name: '华强半导体' });
    expect(softDeleteCustomer(db, id1, '2026-10-28')).toBe(true);
    const id2 = insertCustomer(db, {
      name: '华强半导体',
      nameNorm: '华强半导体',
      contact: '王五',
      phone: '13900000000',
    });
    expect(id2).toBeGreaterThan(id1);
    expect(getCustomer(db, id1)!.deletedAt).toBe('2026-10-28');
  });

  it('编辑客户：历史关联订单不受影响', () => {
    const id = seedCustomer(db);
    seedOrder(db, { customerId: id, statusId: statusByName(db, '进行中') });
    expect(updateCustomer(db, id, { contact: '新联系人' })).toBe(true);
    const o = db.prepare('SELECT customer_id FROM orders').get() as { customer_id: number };
    expect(o.customer_id).toBe(id);
  });

  it('activeNameNorms / findActiveCustomerIdByNorm 排除软删除客户', () => {
    const id1 = seedCustomer(db, { name: '客户A' });
    const id2 = seedCustomer(db, { name: '客户B' });
    softDeleteCustomer(db, id2, '2026-10-28');
    const norms = activeNameNorms(db);
    expect(norms.has('客户a')).toBe(true);
    expect(norms.has('客户b')).toBe(false);
    expect(findActiveCustomerIdByNorm(db, '客户b')).toBeNull();
    expect(findActiveCustomerIdByNorm(db, '客户a')).toBe(id1);
  });

  it('列表检索：搜索/类型/重点筛选 + 订单数统计', () => {
    const active = statusByName(db, '进行中');
    const done = statusByName(db, '已完结');
    const t1 = seedCustomer(db, { name: '华强半导体', contact: '张三', isKey: true });
    const t2 = seedCustomer(db, { name: '深科微电子', contact: '李四' });
    seedOrder(db, { customerId: t1, statusId: active });
    seedOrder(db, { customerId: t1, statusId: active });
    seedOrder(db, { customerId: t1, statusId: done });
    seedOrder(db, { customerId: t2, statusId: active });

    const byName = listCustomers(db, { search: '华强', page: 1, pageSize: 10 });
    expect(byName.total).toBe(1);
    expect(byName.rows[0].orderCount).toBe(3);
    expect(byName.rows[0].activeOrderCount).toBe(2);

    const byKey = listCustomers(db, { isKey: true, page: 1, pageSize: 10 });
    expect(byKey.total).toBe(1);

    const byContact = listCustomers(db, { search: '李四', page: 1, pageSize: 10 });
    expect(byContact.total).toBe(1);
  });

  it('customerOrderCounts 统计正确', () => {
    const id = seedCustomer(db);
    const active = statusByName(db, '进行中');
    const done = statusByName(db, '已完结');
    seedOrder(db, { customerId: id, statusId: active });
    seedOrder(db, { customerId: id, statusId: done });
    const r = customerOrderCounts(db, id);
    expect(r.orderCount).toBe(2);
    expect(r.activeOrderCount).toBe(1);
  });
});
