import { DatabaseSync } from 'node:sqlite';
const [orig, migrated] = process.argv.slice(2);
function counts(p) {
  const db = new DatabaseSync(p);
  const q = (t) => db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c;
  const r = {
    nodes: q('order_node'),
    followUps: q('node_follow_up'),
    attachments: q('node_attachment'),
    fkViolations: db.prepare('PRAGMA foreign_key_check').all().length,
  };
  db.close();
  return r;
}
console.log('orig   ', JSON.stringify(counts(orig)));
console.log('migrated', JSON.stringify(counts(migrated)));
