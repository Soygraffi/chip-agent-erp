import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(process.argv[2]);
const rows = db.prepare(`
  SELECT o.id, o.order_no, o.order_date, o.total_amount,
    (SELECT COUNT(*) FROM order_node n WHERE n.order_id = o.id) AS nodeCount,
    (SELECT COUNT(*) FROM order_node n WHERE n.order_id = o.id AND n.name LIKE '客户确认%') AS confirmByName,
    (SELECT COUNT(*) FROM order_node n WHERE n.order_id = o.id AND n.status = 'done') AS doneCount,
    (SELECT COUNT(*) FROM order_node n WHERE n.order_id = o.id AND n.status='done' AND (n.name LIKE '客户确认%' OR EXISTS (SELECT 1 FROM node_template t WHERE t.id=n.template_id AND t.code='confirm'))) AS confirmDone
  FROM orders o ORDER BY o.order_date DESC
`).all();
console.log('orders', rows.length);
for (const r of rows) console.log(JSON.stringify(r));
console.log('confirm nodes', JSON.stringify(db.prepare(`SELECT n.id,n.order_id,n.name,n.status,n.template_id,t.code FROM order_node n LEFT JOIN node_template t ON t.id=n.template_id WHERE n.name LIKE '客户确认%' LIMIT 20`).all()));
db.close();
