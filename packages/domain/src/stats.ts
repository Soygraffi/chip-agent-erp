import type { OrderStatus } from '@erp/shared';
import { dateDiffDays } from '@erp/shared';

/** 非终态判定（跟进中/逾期/待发货等口径的前提，PRD 4.1.3） */
export function isNonTerminal(status: OrderStatus): boolean {
  return status.enabled && !status.isTerminal;
}

/** 订单级逾期：预计交货日期 < today 且非终态 */
export function orderIsOverdue(
  order: { expectedDeliveryDate: string | null },
  status: OrderStatus,
  today: string,
): boolean {
  return (
    isNonTerminal(status) &&
    !!order.expectedDeliveryDate &&
    order.expectedDeliveryDate < today
  );
}

/** 逾期天数（仅当逾期时 > 0） */
export function overdueDays(
  order: { expectedDeliveryDate: string | null },
  status: OrderStatus,
  today: string,
): number {
  if (!orderIsOverdue(order, status, today)) return 0;
  return dateDiffDays(today, order.expectedDeliveryDate!);
}

export interface NodeWithCode {
  code: string | null;
  status: string;
}

/**
 * 待发货订单判定（PRD 4.1.3 / data-model 6.6）：
 * 非终态 + 「到货入库」(arrival) 已完成 + 「发货中」(ship) 未完成
 */
export function isPendingShipOrder(
  status: OrderStatus,
  nodes: NodeWithCode[],
): boolean {
  if (!isNonTerminal(status)) return false;
  const arrivalDone = nodes.some((n) => n.code === 'arrival' && n.status === 'done');
  const shipUndone = nodes.some(
    (n) => n.code === 'ship' && ['pending', 'in_progress', 'delayed'].includes(n.status),
  );
  return arrivalDone && shipUndone;
}
