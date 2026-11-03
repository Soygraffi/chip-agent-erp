import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(process.argv[2]);
const r = db.prepare(`
  SELECT ROUND(COALESCE(SUM(o.total_amount), 0), 2) AS t
  FROM orders o LEFT JOIN order_status s ON o.status_id = s.id
  WHERE COALESCE(o.order_date, substr(o.created_at, 1, 10)) >= '2026-01-01'
    AND COALESCE(o.order_date, substr(o.created_at, 1, 10)) <= '2026-12-31'
    AND NOT (COALESCE(s.is_terminal, 0) = 1 AND s.terminal_result = 'cancelled')
    AND EXISTS (
      SELECT 1 FROM order_node n LEFT JOIN node_template t ON t.id = n.template_id
      WHERE n.order_id = o.id AND n.status = 'done'
        AND (t.code = 'confirm' OR n.name LIKE '客户确认%')
    )
`).get();
console.log('yearConfirmed =', r.t);
db.close();
