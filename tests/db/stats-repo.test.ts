import { describe, it, beforeEach } from 'node:test';
import { expect } from '../test-utils.ts';
import type { DatabaseSync } from 'node:sqlite';
import { dashboard, reminderCandidates } from '@erp/db';
import {
  createTestDb,
  seedCustomer,
  seedOrder,
  seedNode,
  statusByName,
  dictIdByName,
  templateIdByCode,
} from './helpers.ts';

const TODAY = '2026-10-28';

describe('首页看板口径（SQL 实现，对照 PRD 4.1.3 / data-model 6.6）', () => {
  let db: DatabaseSync;
  let custA: number; // 活跃客户
  let custB: number; // 将被软删除
  let custC: number; // 活跃客户

  beforeEach(() => {
    db = createTestDb();
    custA = seedCustomer(db, { name: '客户A' });
    custB = seedCustomer(db, { name: '客户B' });
    custC = seedCustomer(db, { name: '客户C' });

    const inProg = statusByName(db, '进行中');
    const shipped = statusByName(db, '已发货');
    const done = statusByName(db, '已完结');
    const cancelled = statusByName(db, '已取消');
    const cny = dictIdByName(db, 'currency', '人民币 CNY');
    const usd = dictIdByName(db, 'currency', '美元 USD');
    const arrival = templateIdByCode(db, 'arrival');
    const ship = templateIdByCode(db, 'ship');

    // O1：进行中、本月、逾期（10-20）、重点、待发货（到货入库完成+发货中未完成）
    const o1 = seedOrder(db, {
      customerId: custA, statusId: inProg, orderDate: '2026-10-05',
      currencyId: cny, exchangeRate: 1, totalAmount: 100, expectedDeliveryDate: '2026-10-20', isKey: true,
    });
    seedNode(db, o1, { templateId: arrival, name: '到货入库', status: 'done', sortOrder: 1 });
    seedNode(db, o1, { templateId: ship, name: '发货中', status: 'pending', sortOrder: 2 });

    // O2：已发货（非终态）、本月、美元 50 → 折 360，无交期 → 不逾期；发货已完成 → 不待发货
    const o2 = seedOrder(db, {
      customerId: custA, statusId: shipped, orderDate: '2026-10-10',
      currencyId: usd, exchangeRate: 7.2, totalAmount: 50, expectedDeliveryDate: null,
    });
    seedNode(db, o2, { templateId: arrival, name: '到货入库', status: 'done', sortOrder: 1 });
    seedNode(db, o2, { templateId: ship, name: '发货中', status: 'done', sortOrder: 2 });

    // O3：软删除客户名下、进行中、本月、逾期（10-01）→ 仍计入统计
    const o3 = seedOrder(db, {
      customerId: custB, statusId: inProg, orderDate: '2026-10-10',
      currencyId: cny, exchangeRate: 1, totalAmount: 200, expectedDeliveryDate: '2026-10-01',
    });
    void o3;

    // O4：已完结、上月 → 不计入本月新增与金额
    const o4 = seedOrder(db, {
      customerId: custC, statusId: done, orderDate: '2026-09-30',
      currencyId: cny, exchangeRate: 1, totalAmount: 999, expectedDeliveryDate: null,
    });
    void o4;

    // O5：已取消、本月 → 计入本月新增数，不计入本月金额
    const o5 = seedOrder(db, {
      customerId: custC, statusId: cancelled, orderDate: '2026-10-11',
      currencyId: cny, exchangeRate: 1, totalAmount: 500, expectedDeliveryDate: null,
    });
    void o5;

    // 软删除客户B
    db.prepare("UPDATE customer SET deleted_at = ? WHERE id = ?").run(TODAY, custB);
  });

  it('七项指标与口径一致', () => {
    const s = dashboard(db, TODAY);
    expect(s.customerCount).toBe(2); // 客户B已软删除
    expect(s.activeOrderCount).toBe(3); // O1(进行中) O2(已发货) O3(进行中)
    expect(s.monthNewOrderCount).toBe(4); // O1 O2 O3 O5
    expect(s.monthTotalCny).toBe(660); // 100 + 50*7.2 + 200；取消(O5)不计
    expect(s.pendingShipCount).toBe(1); // 仅 O1
    expect(s.overdueOrderCount).toBe(2); // O1(10-20)、O3(10-01)
    expect(s.keyOrderCount).toBe(1); // O1
  });

  it('状态分布饼图数据（含 0 单状态）', () => {
    const s = dashboard(db, TODAY);
    const byName = Object.fromEntries(s.statusDistribution.map((x) => [x.statusName, x.count]));
    expect(byName).toEqual({ 待确认: 0, 进行中: 2, 已发货: 1, 已完结: 1, 已取消: 1 });
  });

  it('逾期订单列表：按逾期天数倒序（交期越早越靠前）', () => {
    const s = dashboard(db, TODAY);
    expect(s.overdueOrders).toHaveLength(2);
    expect(s.overdueOrders[0].customerName).toBe('客户B'); // 交期 10-01，逾期 27 天
    expect(s.overdueOrders[0].daysOverdue).toBe(27);
    expect(s.overdueOrders[1].daysOverdue).toBe(8); // 交期 10-20
    expect(s.overdueOrders[0].statusIsTerminal).toBe(false);
  });

  it('重点跟进订单列表只含非终态重点单', () => {
    const s = dashboard(db, TODAY);
    expect(s.keyOrders).toHaveLength(1);
    expect(s.keyOrders[0].orderNo).toBeTruthy();
  });
});

describe('提醒候选查询（PRD 4.4.4 / data-model 6.7）', () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = createTestDb();
    const cid = seedCustomer(db, { name: '提醒客户' });
    const inProg = statusByName(db, '进行中');
    const done = statusByName(db, '已完结');

    const o1 = seedOrder(db, { customerId: cid, statusId: inProg, orderNo: 'O1' });
    seedNode(db, o1, { name: '逾期节点', status: 'pending', planTime: '2026-10-27', sortOrder: 1 }); // 逾期
    seedNode(db, o1, { name: '已完成节点', status: 'done', planTime: '2026-10-01', sortOrder: 2 }); // done 排除
    seedNode(db, o1, { name: '无计划节点', status: 'in_progress', planTime: null, sortOrder: 3 }); // 无计划排除
    seedNode(db, o1, { name: '三天内节点', status: 'delayed', planTime: '2026-10-31', sortOrder: 4 }); // 即将到期

    const o2 = seedOrder(db, { customerId: cid, statusId: done, orderNo: 'O2' });
    seedNode(db, o2, { name: '终态订单节点', status: 'pending', planTime: '2026-10-01', sortOrder: 1 }); // 终态排除
  });

  it('候选集 = 非终态 × 三状态 × 已填计划 × 计划时间在窗口内', () => {
    const rows = reminderCandidates(db, TODAY);
    const names = rows.map((r) => r.nodeName).sort();
    expect(names).toEqual(['三天内节点', '逾期节点']);
    const row = rows.find((r) => r.nodeName === '逾期节点')!;
    expect(row.orderNo).toBe('O1');
    expect(row.customerName).toBe('提醒客户');
  });
});
