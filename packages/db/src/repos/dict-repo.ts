import type { DatabaseSync } from 'node:sqlite';
import type {
  CurrencyRate,
  DictCategory,
  DictItem,
  NodeTemplate,
  OrderStatus,
} from '@erp/shared';

/* ---------------- dict_item ---------------- */

export function listDictItems(db: DatabaseSync, category: DictCategory): DictItem[] {
  return db
    .prepare(
      'SELECT id, category, name, color, sort_order AS sortOrder, is_system AS isSystem, enabled ' +
        'FROM dict_item WHERE category = ? ORDER BY sort_order, id',
    )
    .all(category)
    .map((r) => ({ ...r, isSystem: !!r.isSystem, enabled: !!r.enabled }) as DictItem);
}

export function getDictItem(db: DatabaseSync, id: number): DictItem | null {
  const r = db
    .prepare(
      'SELECT id, category, name, color, sort_order AS sortOrder, is_system AS isSystem, enabled ' +
        'FROM dict_item WHERE id = ?',
    )
    .get(id) as Record<string, unknown> | undefined;
  if (!r) return null;
  return { ...r, isSystem: !!r.isSystem, enabled: !!r.enabled } as DictItem;
}

export function insertDictItem(
  db: DatabaseSync,
  item: { category: DictCategory; name: string; color?: string | null; sortOrder?: number; isSystem?: boolean },
): number {
  const r = db
    .prepare(
      'INSERT INTO dict_item (category, name, color, sort_order, is_system) VALUES (?, ?, ?, ?, ?)',
    )
    .run(item.category, item.name, item.color ?? null, item.sortOrder ?? 0, item.isSystem ? 1 : 0);
  return Number(r.lastInsertRowid);
}

export function updateDictItem(
  db: DatabaseSync,
  id: number,
  patch: { name?: string; color?: string | null; sortOrder?: number; enabled?: boolean },
): boolean {
  const fields: string[] = [];
  const args: (string | number | null)[] = [];
  if (patch.name !== undefined) {
    fields.push('name = ?');
    args.push(patch.name);
  }
  if (patch.color !== undefined) {
    fields.push('color = ?');
    args.push(patch.color);
  }
  if (patch.sortOrder !== undefined) {
    fields.push('sort_order = ?');
    args.push(patch.sortOrder);
  }
  if (patch.enabled !== undefined) {
    fields.push('enabled = ?');
    args.push(patch.enabled ? 1 : 0);
  }
  if (fields.length === 0) return false;
  fields.push("updated_at = datetime('now','localtime')");
  args.push(id);
  return db.prepare(`UPDATE dict_item SET ${fields.join(', ')} WHERE id = ?`).run(...args)
    .changes > 0;
}

/** 被业务数据引用的数量（>0 禁止删除，PRD 4.6.1） */
export function countDictRefs(db: DatabaseSync, item: DictItem): number {
  const sql: Record<DictCategory, string> = {
    customer_type: 'SELECT COUNT(*) AS c FROM customer WHERE type_id = ? AND deleted_at IS NULL',
    order_type: 'SELECT COUNT(*) AS c FROM orders WHERE type_id = ?',
    payment_method: 'SELECT COUNT(*) AS c FROM orders WHERE payment_method_id = ?',
    currency:
      'SELECT (SELECT COUNT(*) FROM orders WHERE currency_id = ?) + ' +
      '(SELECT COUNT(*) FROM currency_rate WHERE currency_id = ?) AS c',
  };
  const args = item.category === 'currency' ? [item.id, item.id] : [item.id];
  const r = db.prepare(sql[item.category]).get(...args) as { c: number };
  return r.c;
}

export function deleteDictItem(db: DatabaseSync, id: number): number {
  return Number(db.prepare('DELETE FROM dict_item WHERE id = ?').run(id).changes);
}

/* ---------------- order_status ---------------- */

export function listStatuses(db: DatabaseSync, enabledOnly = false): OrderStatus[] {
  const where = enabledOnly ? 'WHERE enabled = 1' : '';
  return db
    .prepare(
      `SELECT id, name, color, sort_order AS sortOrder, is_terminal AS isTerminal,
              terminal_result AS terminalResult, is_default_completed AS isDefaultCompleted,
              is_system AS isSystem, enabled
       FROM order_status ${where} ORDER BY sort_order, id`,
    )
    .all()
    .map(
      (r) =>
        ({
          ...r,
          isTerminal: !!r.isTerminal,
          isDefaultCompleted: !!r.isDefaultCompleted,
          isSystem: !!r.isSystem,
          enabled: !!r.enabled,
        }) as OrderStatus,
    );
}

export function getStatus(db: DatabaseSync, id: number): OrderStatus | null {
  const r = db
    .prepare(
      'SELECT id, name, color, sort_order AS sortOrder, is_terminal AS isTerminal, ' +
        'terminal_result AS terminalResult, is_default_completed AS isDefaultCompleted, ' +
        'is_system AS isSystem, enabled FROM order_status WHERE id = ?',
    )
    .get(id) as Record<string, unknown> | undefined;
  if (!r) return null;
  return {
    ...r,
    isTerminal: !!r.isTerminal,
    isDefaultCompleted: !!r.isDefaultCompleted,
    isSystem: !!r.isSystem,
    enabled: !!r.enabled,
  } as OrderStatus;
}

export function getStatusByName(db: DatabaseSync, name: string): OrderStatus | null {
  const r = db
    .prepare('SELECT id FROM order_status WHERE name = ?')
    .get(name) as { id: number } | undefined;
  return r ? getStatus(db, r.id) : null;
}

export function insertStatus(
  db: DatabaseSync,
  s: {
    name: string;
    color: string;
    sortOrder?: number;
    isTerminal?: boolean;
    terminalResult?: 'completed' | 'cancelled' | null;
    isDefaultCompleted?: boolean;
    isSystem?: boolean;
  },
): number {
  const r = db
    .prepare(
      'INSERT INTO order_status (name, color, sort_order, is_terminal, terminal_result, is_default_completed, is_system) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      s.name,
      s.color,
      s.sortOrder ?? 0,
      s.isTerminal ? 1 : 0,
      s.terminalResult ?? null,
      s.isDefaultCompleted ? 1 : 0,
      s.isSystem ? 1 : 0,
    );
  return Number(r.lastInsertRowid);
}

export function updateStatus(
  db: DatabaseSync,
  id: number,
  patch: {
    name?: string;
    color?: string;
    sortOrder?: number;
    isTerminal?: boolean;
    terminalResult?: 'completed' | 'cancelled' | null;
    isDefaultCompleted?: boolean;
    enabled?: boolean;
  },
): boolean {
  const fields: string[] = [];
  const args: (string | number | null)[] = [];
  if (patch.name !== undefined) {
    fields.push('name = ?');
    args.push(patch.name);
  }
  if (patch.color !== undefined) {
    fields.push('color = ?');
    args.push(patch.color);
  }
  if (patch.sortOrder !== undefined) {
    fields.push('sort_order = ?');
    args.push(patch.sortOrder);
  }
  if (patch.isTerminal !== undefined) {
    fields.push('is_terminal = ?');
    args.push(patch.isTerminal ? 1 : 0);
  }
  if (patch.terminalResult !== undefined) {
    fields.push('terminal_result = ?');
    args.push(patch.terminalResult);
  }
  if (patch.isDefaultCompleted !== undefined) {
    fields.push('is_default_completed = ?');
    args.push(patch.isDefaultCompleted ? 1 : 0);
  }
  if (patch.enabled !== undefined) {
    fields.push('enabled = ?');
    args.push(patch.enabled ? 1 : 0);
  }
  if (fields.length === 0) return false;
  fields.push("updated_at = datetime('now','localtime')");
  args.push(id);
  return db.prepare(`UPDATE order_status SET ${fields.join(', ')} WHERE id = ?`).run(...args)
    .changes > 0;
}

export function countStatusRefs(db: DatabaseSync, id: number): number {
  const r = db.prepare('SELECT COUNT(*) AS c FROM orders WHERE status_id = ?').get(id) as {
    c: number;
  };
  return r.c;
}

export function deleteStatus(db: DatabaseSync, id: number): number {
  return Number(db.prepare('DELETE FROM order_status WHERE id = ?').run(id).changes);
}

/* ---------------- node_template ---------------- */

export function listTemplates(db: DatabaseSync, enabledOnly = false): NodeTemplate[] {
  const where = enabledOnly ? 'WHERE enabled = 1' : '';
  return db
    .prepare(
      `SELECT id, name, code, sort_order AS sortOrder, is_system AS isSystem, enabled, remark
       FROM node_template ${where} ORDER BY sort_order, id`,
    )
    .all()
    .map(
      (r) =>
        ({
          ...r,
          isSystem: !!r.isSystem,
          enabled: !!r.enabled,
          remark: r.remark ?? null,
        }) as NodeTemplate,
    );
}

export function getTemplate(db: DatabaseSync, id: number): NodeTemplate | null {
  const r = db
    .prepare(
      'SELECT id, name, code, sort_order AS sortOrder, is_system AS isSystem, enabled, remark ' +
        'FROM node_template WHERE id = ?',
    )
    .get(id) as Record<string, unknown> | undefined;
  if (!r) return null;
  return {
    ...r,
    isSystem: !!r.isSystem,
    enabled: !!r.enabled,
    remark: (r.remark as string | null) ?? null,
  } as NodeTemplate;
}

export function insertTemplate(
  db: DatabaseSync,
  t: { name: string; code?: string | null; sortOrder?: number; isSystem?: boolean; remark?: string | null },
): number {
  const r = db
    .prepare(
      'INSERT INTO node_template (name, code, sort_order, is_system, remark) VALUES (?, ?, ?, ?, ?)',
    )
    .run(t.name, t.code ?? null, t.sortOrder ?? 0, t.isSystem ? 1 : 0, t.remark ?? null);
  return Number(r.lastInsertRowid);
}

export function updateTemplate(
  db: DatabaseSync,
  id: number,
  patch: { name?: string; code?: string | null; sortOrder?: number; enabled?: boolean; remark?: string | null },
): boolean {
  const fields: string[] = [];
  const args: (string | number | null)[] = [];
  if (patch.name !== undefined) {
    fields.push('name = ?');
    args.push(patch.name);
  }
  if (patch.code !== undefined) {
    fields.push('code = ?');
    args.push(patch.code);
  }
  if (patch.sortOrder !== undefined) {
    fields.push('sort_order = ?');
    args.push(patch.sortOrder);
  }
  if (patch.enabled !== undefined) {
    fields.push('enabled = ?');
    args.push(patch.enabled ? 1 : 0);
  }
  if (patch.remark !== undefined) {
    fields.push('remark = ?');
    args.push(patch.remark);
  }
  if (fields.length === 0) return false;
  args.push(id);
  return db.prepare(`UPDATE node_template SET ${fields.join(', ')} WHERE id = ?`).run(...args)
    .changes > 0;
}

export function countTemplateRefs(db: DatabaseSync, id: number): number {
  const r = db.prepare('SELECT COUNT(*) AS c FROM order_node WHERE template_id = ?').get(id) as {
    c: number;
  };
  return r.c;
}

export function deleteTemplate(db: DatabaseSync, id: number): number {
  return Number(db.prepare('DELETE FROM node_template WHERE id = ?').run(id).changes);
}

/* ---------------- currency_rate ---------------- */

export function listRates(db: DatabaseSync): (CurrencyRate & { currencyName: string })[] {
  return db
    .prepare(
      'SELECT cr.currency_id AS currencyId, cr.rate, cr.updated_at AS updatedAt, d.name AS currencyName ' +
        "FROM currency_rate cr JOIN dict_item d ON d.id = cr.currency_id AND d.category = 'currency' " +
        'ORDER BY d.sort_order',
    )
    .all() as unknown as (CurrencyRate & { currencyName: string })[];
}

export function getRate(db: DatabaseSync, currencyId: number): CurrencyRate | null {
  const r = db
    .prepare(
      'SELECT currency_id AS currencyId, rate, updated_at AS updatedAt FROM currency_rate WHERE currency_id = ?',
    )
    .get(currencyId) as CurrencyRate | undefined;
  return r ?? null;
}

export function upsertRate(db: DatabaseSync, currencyId: number, rate: number): void {
  db.prepare(
    "INSERT INTO currency_rate (currency_id, rate) VALUES (?, ?) " +
      'ON CONFLICT(currency_id) DO UPDATE SET rate = excluded.rate, updated_at = datetime(\'now\',\'localtime\')',
  ).run(currencyId, rate);
}

/* ---------------- 拖动排序（V1.4） ---------------- */

function applySortOrder(db: DatabaseSync, table: string, ids: number[]): void {
  const stmt = db.prepare(`UPDATE ${table} SET sort_order = ? WHERE id = ?`);
  ids.forEach((id, i) => stmt.run(i + 1, id));
}

export function reorderDictItems(db: DatabaseSync, ids: number[]): void {
  applySortOrder(db, 'dict_item', ids);
}

export function reorderStatuses(db: DatabaseSync, ids: number[]): void {
  applySortOrder(db, 'order_status', ids);
}

export function reorderTemplates(db: DatabaseSync, ids: number[]): void {
  applySortOrder(db, 'node_template', ids);
}
