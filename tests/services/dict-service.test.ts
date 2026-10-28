import { describe, it, beforeEach } from 'node:test';
import { expect } from '../test-utils.ts';
import type { DatabaseSync } from 'node:sqlite';
import {
  dictService,
  statusDictService,
  templateService,
  rateService,
  customerService,
  orderService,
} from '@erp/db';
import { createTestDb, statusByName, dictIdByName } from '../db/helpers.ts';

describe('字典服务', () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = createTestDb();
  });

  it('通用字典增改与删除保护（被引用禁止删除）', () => {
    const id = dictService.create(db, { category: 'customer_type', name: '代理商' });
    expect(id).toBeGreaterThan(0);
    const cid = customerService.create(db, {
      name: '某客户', contact: '张三', phone: '138', typeId: id,
    });
    void cid;
    expect(() => dictService.delete(db, id)).toThrowError(/被 1 条业务数据引用/);
    dictService.update(db, id, { name: '代理商（改）' });
    expect(dictService.list(db, 'customer_type').find((d) => d.id === id)!.name).toBe('代理商（改）');
  });

  it('订单类型被订单引用时禁止删除；未引用可删', () => {
    const batchId = dictIdByName(db, 'order_type', '批量订单');
    const cid = customerService.create(db, { name: '客户', contact: '张三', phone: '138' });
    orderService.create(db, {
      customerId: cid, orderDate: '2026-10-28', typeId: batchId,
      statusId: statusByName(db, '进行中'), items: [],
    });
    expect(() => dictService.delete(db, batchId)).toThrowError(/被 1 条业务数据引用/);
    const newId = dictService.create(db, { category: 'order_type', name: '预订单' });
    dictService.delete(db, newId);
    expect(dictService.list(db, 'order_type').some((d) => d.id === newId)).toBe(false);
  });

  it('状态字典：终态必须指定结果、非终态不能有结果', () => {
    expect(() =>
      statusDictService.create(db, { name: '怪状态', color: '#000', isTerminal: true, terminalResult: null }),
    ).toThrowError(/终态必须指定结果/);
    expect(() =>
      statusDictService.create(db, { name: '怪状态2', color: '#000', isTerminal: false, terminalResult: 'completed' }),
    ).toThrowError(/非终态不能指定结果/);
  });

  it('默认完成状态全局唯一：新建时自动取消旧默认', () => {
    const id = statusDictService.create(db, {
      name: '新完结', color: '#111111', isTerminal: true, terminalResult: 'completed', isDefaultCompleted: true,
    });
    const statuses = statusDictService.list(db);
    expect(statuses.filter((s) => s.isDefaultCompleted).map((s) => s.id)).toEqual([id]);
  });

  it('系统预置状态不可删除；被引用状态不可删除；自定义可删', () => {
    const doneId = statusByName(db, '已完结');
    expect(() => statusDictService.delete(db, doneId)).toThrowError(/系统预置状态不可删除/);
    const custom = statusDictService.create(db, { name: '临时状态', color: '#000' });
    const cid = customerService.create(db, { name: '客户', contact: '张三', phone: '138' });
    const oid = orderService.create(db, {
      customerId: cid, orderDate: '2026-10-28', statusId: custom, items: [],
    });
    void oid;
    expect(() => statusDictService.delete(db, custom)).toThrowError(/被 1 个订单引用/);
  });

  it('节点模板：语义码唯一、被引用禁止删除', () => {
    expect(() => templateService.create(db, { name: '重复码', code: 'ship' })).toThrowError(/语义码已被其他模板占用/);
    // 先建订单（自动生成节点不引用自定义模板），再建自定义模板并挂节点制造引用
    const cid = customerService.create(db, { name: '客户', contact: '张三', phone: '138' });
    const oid = orderService.create(db, {
      customerId: cid, orderDate: '2026-10-28', statusId: statusByName(db, '进行中'), items: [],
    });
    const custom = templateService.create(db, { name: '自定义阶段', code: 'custom_stage' });
    db.prepare(
      'INSERT INTO order_node (order_id, template_id, name, status, sort_order) VALUES (?, ?, ?, ?, ?)',
    ).run(oid, custom, '自定义阶段', 'pending', 99);
    expect(() => templateService.delete(db, custom)).toThrowError(/被 1 个订单节点引用/);
    // 删除引用后可删除
    db.prepare('DELETE FROM order_node WHERE template_id = ?').run(custom);
    templateService.delete(db, custom);
    expect(templateService.list(db).some((t) => t.id === custom)).toBe(false);
  });

  it('汇率：必须为正数、四舍五入 6 位；不存在币种被拒', () => {
    const cny = dictIdByName(db, 'currency', '人民币 CNY');
    rateService.upsert(db, cny, 1.2345678);
    expect(rateService.list(db).find((r) => r.currencyId === cny)!.rate).toBe(1.234568);
    expect(() => rateService.upsert(db, cny, 0)).toThrowError(/必须为正数/);
    expect(() => rateService.upsert(db, cny, -1)).toThrowError(/必须为正数/);
    expect(() => rateService.upsert(db, 99999, 7)).toThrowError(/币种不存在/);
  });
});
