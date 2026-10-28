import type { ReminderItem } from '@erp/shared';
import { addDays, cmpDate } from '@erp/shared';

export interface ReminderSourceNode {
  nodeId: number;
  orderId: number;
  orderNo: string;
  customerName: string;
  nodeName: string;
  status: string; // pending | in_progress | delayed（done 不参与）
  planTime: string; // 已填计划时间
}

/**
 * 到期/逾期提醒计算（PRD 4.4.4）
 * 入参只含：非终态订单 + 状态∈{未开始,进行中,异常延误} + 已填计划时间的节点
 * 逾期：planTime < today；即将到期：today ≤ planTime ≤ today+3（含今天）
 */
export function computeReminders(
  nodes: ReminderSourceNode[],
  today: string,
): { overdue: ReminderItem[]; upcoming: ReminderItem[] } {
  const overdue: ReminderItem[] = [];
  const upcoming: ReminderItem[] = [];
  const dayAfter3 = addDays(today, 3);
  for (const n of nodes) {
    if (n.status === 'done') continue;
    if (cmpDate(n.planTime, today) < 0) {
      overdue.push({
        nodeId: n.nodeId,
        orderId: n.orderId,
        orderNo: n.orderNo,
        customerName: n.customerName,
        nodeName: n.nodeName,
        planTime: n.planTime,
        kind: 'overdue',
        days: diffDays(today, n.planTime),
      });
    } else if (cmpDate(n.planTime, today) >= 0 && cmpDate(n.planTime, dayAfter3) <= 0) {
      upcoming.push({
        nodeId: n.nodeId,
        orderId: n.orderId,
        orderNo: n.orderNo,
        customerName: n.customerName,
        nodeName: n.nodeName,
        planTime: n.planTime,
        kind: 'upcoming',
        days: diffDays(n.planTime, today),
      });
    }
  }
  overdue.sort((a, b) => b.days - a.days || cmpDate(a.planTime, b.planTime));
  upcoming.sort((a, b) => cmpDate(a.planTime, b.planTime));
  return { overdue, upcoming };
}

function diffDays(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000);
}
