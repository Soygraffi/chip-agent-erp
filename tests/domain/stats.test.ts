import { describe, it } from 'node:test';
import { expect } from '../test-utils.ts';
import {
  orderIsOverdue,
  overdueDays,
  isPendingShipOrder,
  isNonTerminal,
} from '@erp/domain';
import type { OrderStatus } from '@erp/shared';

const TODAY = '2026-10-28';

function st(partial: Partial<OrderStatus>): OrderStatus {
  return {
    id: 1,
    name: '进行中',
    color: '#1677FF',
    sortOrder: 1,
    isTerminal: false,
    terminalResult: null,
    isDefaultCompleted: false,
    isSystem: true,
    enabled: true,
    ...partial,
  };
}

describe('口径判定（PRD 4.1.3）', () => {
  it('逾期订单：交期已过且非终态', () => {
    expect(orderIsOverdue({ expectedDeliveryDate: '2026-10-27' }, st({}), TODAY)).toBe(true);
  });

  it('交期等于今天不算逾期', () => {
    expect(orderIsOverdue({ expectedDeliveryDate: '2026-10-28' }, st({}), TODAY)).toBe(false);
  });

  it('终态订单不参与逾期', () => {
    expect(
      orderIsOverdue(
        { expectedDeliveryDate: '2026-10-01' },
        st({ isTerminal: true, terminalResult: 'completed' }),
        TODAY,
      ),
    ).toBe(false);
  });

  it('未填预计交货日期不参与逾期', () => {
    expect(orderIsOverdue({ expectedDeliveryDate: null }, st({}), TODAY)).toBe(false);
  });

  it('已发货（非终态）且交期已过仍算逾期（PRD 附录 A 决策 3）', () => {
    expect(
      orderIsOverdue({ expectedDeliveryDate: '2026-10-20' }, st({ name: '已发货' }), TODAY),
    ).toBe(true);
    expect(overdueDays({ expectedDeliveryDate: '2026-10-20' }, st({ name: '已发货' }), TODAY)).toBe(8);
  });

  it('待发货：到货入库已完成 且 发货中未完成 且 非终态', () => {
    const nodes = [
      { code: 'arrival', status: 'done' },
      { code: 'ship', status: 'pending' },
    ];
    expect(isPendingShipOrder(st({}), nodes)).toBe(true);
  });

  it('发货中已完成 → 不再是待发货', () => {
    const nodes = [
      { code: 'arrival', status: 'done' },
      { code: 'ship', status: 'done' },
    ];
    expect(isPendingShipOrder(st({}), nodes)).toBe(false);
  });

  it('到货入库未完成 → 不是待发货', () => {
    const nodes = [
      { code: 'arrival', status: 'in_progress' },
      { code: 'ship', status: 'pending' },
    ];
    expect(isPendingShipOrder(st({}), nodes)).toBe(false);
  });

  it('终态订单不是待发货', () => {
    const nodes = [
      { code: 'arrival', status: 'done' },
      { code: 'ship', status: 'pending' },
    ];
    expect(isPendingShipOrder(st({ isTerminal: true }), nodes)).toBe(false);
  });

  it('自定义节点（无语义码）不影响待发货判定', () => {
    const nodes = [{ code: null, status: 'done' }];
    expect(isPendingShipOrder(st({}), nodes)).toBe(false);
  });

  it('isNonTerminal：停用状态视为不参与（安全兜底）', () => {
    expect(isNonTerminal(st({}))).toBe(true);
    expect(isNonTerminal(st({ enabled: false }))).toBe(false);
  });
});
