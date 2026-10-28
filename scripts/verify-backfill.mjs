import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../packages/db/dist/index.js';

const db = new DatabaseSync(process.argv[2] ?? '.tmp-store-probe/v8-test.db');
const count = (sql) => db.prepare(sql).get().c;
const beforeVersion = db.prepare("SELECT value FROM schema_meta WHERE key='schema_version'").get()?.value;
const before = count('SELECT COUNT(*) AS c FROM order_item WHERE material_id IS NULL');
migrate(db);
const afterVersion = db.prepare("SELECT value FROM schema_meta WHERE key='schema_version'").get()?.value;
const materials = count('SELECT COUNT(*) AS c FROM material');
const linked = count('SELECT COUNT(*) AS c FROM order_item WHERE material_id IS NOT NULL');
const stillNull = count('SELECT COUNT(*) AS c FROM order_item WHERE material_id IS NULL');
console.log(
  `schema ${beforeVersion ?? '(none)'} -> ${afterVersion} | unlinked_before=${before} | materials=${materials} | linked_after=${linked} | still_unlinked=${stillNull}`,
);
const sample = db
  .prepare('SELECT material_code, material_id FROM order_item WHERE material_id IS NOT NULL LIMIT 3')
  .all();
console.log('sample:', sample);
db.close();
