import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../packages/db/dist/index.js';

const path = process.argv[2] ?? '.tmp-store-probe/v4-test.db';
const db = new DatabaseSync(path);
const before = db.prepare("SELECT value FROM schema_meta WHERE key='schema_version'").get();
migrate(db);
const after = db.prepare("SELECT value FROM schema_meta WHERE key='schema_version'").get();
const hasTable = (name) =>
  !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(name);
const hasCol = (table, col) =>
  !!db.prepare(`SELECT name FROM pragma_table_info('${table}') WHERE name = ?`).get(col);
console.log('schema_version:', before?.value ?? '(none)', '->', after.value);
console.log('material table:', hasTable('material'));
console.log('customer.logo_path:', hasCol('customer', 'logo_path'));
console.log('order_item.material_id:', hasCol('order_item', 'material_id'));
console.log('order_item.price_tax_included:', hasCol('order_item', 'price_tax_included'));
console.log(
  'company_name setting:',
  db.prepare("SELECT value FROM setting WHERE key='company_name'").get(),
);
db.close();
