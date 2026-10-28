import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(process.env.APPDATA + '/ChipAgentERP/data/erp.db');
const rows = db
  .prepare(
    `SELECT o.order_no AS no, s.name AS status,
            (SELECT COUNT(*) FROM order_item i WHERE i.order_id = o.id) AS items,
            (SELECT COUNT(*) FROM order_item i WHERE i.order_id = o.id AND i.material_id IS NOT NULL) AS linked
     FROM orders o LEFT JOIN order_status s ON s.id = o.status_id
     ORDER BY o.id DESC LIMIT 5`,
  )
  .all();
console.log(rows);
const m = db.prepare('SELECT COUNT(*) AS c FROM material').get();
const v = db.prepare("SELECT value FROM schema_meta WHERE key='schema_version'").get();
console.log('materials:', m.c, 'schema:', v.value);
db.close();
