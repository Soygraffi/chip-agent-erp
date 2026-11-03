import type { DatabaseSync } from 'node:sqlite';
import type { DashboardStats, OrderListRow, ReminderItem, StatusDistributionItem } from '@erp/shared';
import { monthRange } from '@erp/shared';
import { listOrders, UNFILLED_STATUS_COLOR } from './order-repo.js';

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

  // 本年订单金额（取消不计，与本月口径一致）
  const year = today.slice(0, 4);
  const yearTotalAmount = (
    db
      .prepare(
        'SELECT ROUND(COALESCE(SUM(o.total_amount), 0), 2) AS totalAmount ' +
          'FROM orders o LEFT JOIN order_status s ON o.status_id = s.id ' +
          'WHERE o.order_date >= ? AND o.order_date <= ? ' +
          "AND NOT (COALESCE(s.is_terminal, 0) = 1 AND s.terminal_result = 'cancelled')",
      )
      .get(`${year}-01-01`, `${year}-12-31`) as { totalAmount: number }
  ).totalAmount;

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

  // V1.10.4：状态分布按每张订单当前进行到的节点统计（不再使用订单状态字段）
  const nodeRows = db
    .prepare(
      `SELECT o.id,
        (SELECT COUNT(*) FROM order_node n WHERE n.order_id = o.id) AS nodeCount,
        (SELECT COUNT(*) FROM order_node n WHERE n.order_id = o.id AND n.status = 'none') AS noneCount,
        (SELECT n.name FROM order_node n WHERE n.order_id = o.id AND n.status != 'done' ORDER BY n.sort_order LIMIT 1) AS currentNodeName,
        (SELECT n.sort_order FROM order_node n WHERE n.order_id = o.id AND n.status != 'done' ORDER BY n.sort_order LIMIT 1) AS currentNodeSort
       FROM orders o`,
    )
    .all() as {
    nodeCount: number;
    noneCount: number;
    currentNodeName: string | null;
    currentNodeSort: number | null;
  }[];

  // 柔和且区分度高的节点配色（按进度顺序）
  const STAGE_PALETTE = [
    '#5B8FF9', '#61DDAA', '#65789B', '#F6BD16', '#7262FD',
    '#78D3F8', '#9661BC', '#F6903D', '#008685',
  ];

  const distMap = new Map<string, { statusName: string; color: string; count: number }>();
  for (const r of nodeRows) {
    let name: string;
    let color: string;
    if (r.nodeCount === 0) {
      name = '未填写';
      color = UNFILLED_STATUS_COLOR;
    } else if (r.noneCount > 0) {
      name = '未下单';
      color = '#E8684A';
    } else if (!r.currentNodeName) {
      name = '已完结';
      color = '#52C41A';
    } else {
      name = r.currentNodeName;
      const idx = Math.max(0, (r.currentNodeSort ?? 1) - 1);
      color = STAGE_PALETTE[idx % STAGE_PALETTE.length];
    }
    const cur = distMap.get(name) ?? { statusName: name, color, count: 0 };
    cur.count += 1;
    distMap.set(name, cur);
  }
  const statusDistribution: StatusDistributionItem[] = [...distMap.values()]
    .sort((a, b) => b.count - a.count || a.statusName.localeCompare(b.statusName, 'zh-CN'))
    .map((v, i) => ({ statusId: i + 1, ...v }));

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
    yearTotalAmount,
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
