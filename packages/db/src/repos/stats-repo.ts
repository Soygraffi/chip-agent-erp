import type { DatabaseSync } from 'node:sqlite';
import type { DashboardStats, OrderListRow, ReminderItem, StatusDistributionItem } from '@erp/shared';
import { monthRange } from '@erp/shared';
import { listOrders, UNFILLED_STATUS_COLOR, UNFILLED_STATUS_NAME } from './order-repo.js';

/** 非终态判定（状态为空视为未结束） */
const NON_TERMINAL = '(s.is_terminal = 0 OR o.status_id IS NULL)';

/**
 * 首页看板与提醒查询（SQL 口径对应 data-model.md 6.6、6.7）
 * V1.2：订单状态可选，状态为空按“未填写”统计。
 */
export function dashboard(db: DatabaseSync, today: string): DashboardStats {
  const customerCount = (
    db.prepare('SELECT COUNT(*) AS c FROM customer WHERE deleted_at IS NULL').get() as { c: number }
  ).c;

  const activeOrderCount = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM orders o LEFT JOIN order_status s ON s.id = o.status_id WHERE ${NON_TERMINAL}`,
      )
      .get() as { c: number }
  ).c;

  const [monthStart, monthEnd] = monthRange(today);
  // 本月新增订单数：订单日期在本月（含取消）；本月金额：取消不计（PRD 4.1.3）
  const monthRow = db
    .prepare(
      'SELECT ' +
        '(SELECT COUNT(*) FROM orders o2 WHERE o2.order_date >= ? AND o2.order_date <= ?) AS cnt, ' +
        'ROUND(COALESCE(SUM(o.total_amount), 0), 2) AS totalAmount ' +
        'FROM orders o LEFT JOIN order_status s ON o.status_id = s.id ' +
        'WHERE o.order_date >= ? AND o.order_date <= ? ' +
        "AND NOT (COALESCE(s.is_terminal, 0) = 1 AND s.terminal_result = 'cancelled')",
    )
    .get(monthStart, monthEnd, monthStart, monthEnd) as { cnt: number; totalAmount: number };

  const overdueOrderCount = (
    db
      .prepare(
        'SELECT COUNT(*) AS c FROM orders o LEFT JOIN order_status s ON o.status_id = s.id ' +
          `WHERE ${NON_TERMINAL} AND o.expected_delivery_date IS NOT NULL AND o.expected_delivery_date < ?`,
      )
      .get(today) as { c: number }
  ).c;

  // 待发货：到货入库(arrival)已完成 且 发货中(ship)未完成（语义码识别）
  const pendingShipCount = (
    db
      .prepare(
        'SELECT COUNT(DISTINCT o.id) AS c FROM orders o LEFT JOIN order_status s ON o.status_id = s.id ' +
          `WHERE ${NON_TERMINAL} ` +
          'AND EXISTS (SELECT 1 FROM order_node n JOIN node_template t ON n.template_id = t.id ' +
          "  WHERE n.order_id = o.id AND t.code = 'arrival' AND n.status = 'done') " +
          'AND EXISTS (SELECT 1 FROM order_node n JOIN node_template t ON n.template_id = t.id ' +
          "  WHERE n.order_id = o.id AND t.code = 'ship' AND n.status IN ('pending','in_progress','delayed'))",
      )
      .get() as { c: number }
  ).c;

  const keyOrderCount = (
    db
      .prepare(
        'SELECT COUNT(*) AS c FROM orders o LEFT JOIN order_status s ON o.status_id = s.id ' +
          `WHERE o.is_key = 1 AND ${NON_TERMINAL}`,
      )
      .get() as { c: number }
  ).c;

  const statusDistribution = db
    .prepare(
      'SELECT s.id AS statusId, s.name AS statusName, s.color, COUNT(o.id) AS count ' +
        'FROM order_status s LEFT JOIN orders o ON o.status_id = s.id ' +
        'GROUP BY s.id ORDER BY s.sort_order, s.id',
    )
    .all()
    .map((r) => ({ ...r, count: r.count ?? 0 }) as unknown as StatusDistributionItem);

  // 状态未填写的订单单独作为一个扇区
  const unfilledCount = (
    db.prepare('SELECT COUNT(*) AS c FROM orders WHERE status_id IS NULL').get() as { c: number }
  ).c;
  if (unfilledCount > 0) {
    statusDistribution.push({
      statusId: 0,
      statusName: UNFILLED_STATUS_NAME,
      color: UNFILLED_STATUS_COLOR,
      count: unfilledCount,
    });
  }

  const overdueOrders = listOrders(db, {
    onlyOverdue: true,
    sortField: 'expected_delivery_date',
    sortDir: 'asc',
    page: 1,
    pageSize: 50,
    today,
  }).rows;

  const keyOrders = listOrders(db, {
    onlyKey: true,
    sortField: 'order_date',
    sortDir: 'desc',
    page: 1,
    pageSize: 50,
    today,
  }).rows;

  return {
    customerCount,
    activeOrderCount,
    monthNewOrderCount: monthRow.cnt,
    monthTotalAmount: monthRow.totalAmount,
    pendingShipCount,
    overdueOrderCount,
    keyOrderCount,
    statusDistribution,
    overdueOrders,
    keyOrders,
  };
}

export interface ReminderNodeRow {
  nodeId: number;
  orderId: number;
  orderNo: string;
  customerName: string;
  nodeName: string;
  status: string;
  planTime: string;
}

/** 提醒候选节点：非终态订单 × {未开始,进行中,异常延误} × 已填计划时间（PRD 4.4.4） */
export function reminderCandidates(db: DatabaseSync, today: string): ReminderNodeRow[] {
  return db
    .prepare(
      'SELECT n.id AS nodeId, o.id AS orderId, o.order_no AS orderNo, c.name AS customerName, ' +
        'n.name AS nodeName, n.status, n.plan_time AS planTime ' +
        'FROM order_node n ' +
        'JOIN orders o ON o.id = n.order_id ' +
        'LEFT JOIN order_status s ON s.id = o.status_id ' +
        'JOIN customer c ON c.id = o.customer_id ' +
        `WHERE ${NON_TERMINAL} ` +
        "AND n.status IN ('pending','in_progress','delayed') " +
        'AND n.plan_time IS NOT NULL ' +
        "AND date(n.plan_time) <= date(?, '+3 days')",
    )
    .all(today) as unknown as ReminderNodeRow[];
}

/** 提醒列表（含分组、排序）由 domain computeReminders 完成；此函数只负责取候选集 */
export type { ReminderItem };
