import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(process.argv[2]);
const row = db.prepare("SELECT value FROM setting WHERE key = 'company_name'").get();
console.log('company_name =', JSON.stringify(row?.value));
db.close();
