import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../packages/db/dist/index.js';

const db = new DatabaseSync('D:/Programming Projects/ERP for me/.tmp-store-probe/migrate-test.db');
const before = db.prepare('SELECT name FROM pragma_table_info(\'customer\')').all().map((c) => c.name);
const countBefore = db.prepare('SELECT COUNT(*) AS c FROM customer').get().c;
migrate(db);
const v = db.prepare("SELECT value FROM schema_meta WHERE key='schema_version'").get();
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('customer_wechat_group','wechat_member','order_attachment','order_wechat_group')").all().map((t) => t.name);
const after = db.prepare('SELECT name FROM pragma_table_info(\'customer\')').all().map((c) => c.name);
const countAfter = db.prepare('SELECT COUNT(*) AS c FROM customer').get().c;
const ordersCount = db.prepare('SELECT COUNT(*) AS c FROM orders').get().c;
console.log('schema_version:', v.value);
console.log('new tables:', tables.join(','));
console.log('customer count before/after:', countBefore, countAfter);
console.log('orders count:', ordersCount);
console.log('contact column removed:', !after.includes('contact'));
db.close();
