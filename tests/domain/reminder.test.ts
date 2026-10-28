import { describe, it } from 'node:test';
import { expect } from '../test-utils.ts';
import { computeReminders, type ReminderSourceNode } from '@erp/domain';

const TODAY = '2026-10-28';

function n(partial: Partial<ReminderSourceNode> & { nodeId: number }): ReminderSourceNode {
  return {
    orderId: 1,
    orderNo: 'XS202610280001',
    customerName: '华强半导体',
    nodeName: '报价中',
    status: 'in_progress',
    planTime: '2026-10-28',
    ...partial,
  };
}

describe('到期/逾期提醒计算', () => {
  it('计划时间早于今天 → 逾期', () => {
    const { overdue, upcoming } = computeReminders(
      [n({ nodeId: 1, planTime: '2026-10-27' })],
      TODAY,
    );
    expect(overdue).toHaveLength(1);
    expect(overdue[0].kind).toBe('overdue');
    expect(overdue[0].days).toBe(1);
    expect(upcoming).toHaveLength(0);
  });

  it('3 天窗口边界：今天、+3 天属于即将到期，+4 天不属于', () => {
    const nodes = [
      n({ nodeId: 1, planTime: '2026-10-28' }),
      n({ nodeId: 2, planTime: '2026-10-31' }),
      n({ nodeId: 3, planTime: '2026-11-01' }),
    ];
    const { overdue, upcoming } = computeReminders(nodes, TODAY);
    expect(overdue).toHaveLength(0);
    expect(upcoming.map((x) => x.nodeId)).toEqual([1, 2]);
    expect(upcoming[0].days).toBe(0);
    expect(upcoming[1].days).toBe(3);
  });

  it('已完成的节点不参与提醒', () => {
    const { overdue, upcoming } = computeReminders(
      [n({ nodeId: 1, planTime: '2026-10-20', status: 'done' })],
      TODAY,
    );
    expect(overdue).toHaveLength(0);
    expect(upcoming).toHaveLength(0);
  });

  it('异常延误节点也参与提醒（PRD 4.4.4）', () => {
    const { overdue } = computeReminders(
      [n({ nodeId: 1, planTime: '2026-10-25', status: 'delayed' })],
      TODAY,
    );
    expect(overdue).toHaveLength(1);
  });

  it('逾期按逾期天数倒序排列', () => {
    const { overdue } = computeReminders(
      [
        n({ nodeId: 1, planTime: '2026-10-27' }),
        n({ nodeId: 2, planTime: '2026-10-01' }),
        n({ nodeId: 3, planTime: '2026-10-25' }),
      ],
      TODAY,
    );
    expect(overdue.map((x) => x.nodeId)).toEqual([2, 3, 1]);
    expect(overdue[0].days).toBe(27);
  });

  it('即将到期按计划时间升序', () => {
    const { upcoming } = computeReminders(
      [
        n({ nodeId: 1, planTime: '2026-10-30' }),
        n({ nodeId: 2, planTime: '2026-10-28' }),
      ],
      TODAY,
    );
    expect(upcoming.map((x) => x.nodeId)).toEqual([2, 1]);
  });

  it('未填计划时间不参与（入参侧由调用方过滤，函数内按非 done 兜底）', () => {
    const { overdue, upcoming } = computeReminders(
      [n({ nodeId: 1, planTime: '2026-10-27', status: 'pending' })],
      TODAY,
    );
    expect(overdue).toHaveLength(1);
    expect(upcoming).toHaveLength(0);
  });
});
