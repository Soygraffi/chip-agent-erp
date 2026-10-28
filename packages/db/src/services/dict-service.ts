import type { DatabaseSync } from 'node:sqlite';
import type { CurrencyRate, DictCategory, DictItem, NodeTemplate, OrderStatus, TerminalResult } from '@erp/shared';
import { bizError, round6 } from '@erp/shared';
import {
  countDictRefs,
  countStatusRefs,
  countTemplateRefs,
  deleteDictItem,
  deleteStatus,
  deleteTemplate,
  getDictItem,
  getStatus,
  getTemplate,
  insertDictItem,
  insertStatus,
  insertTemplate,
  listDictItems,
  listRates,
  listStatuses,
  listTemplates,
  updateDictItem,
  updateStatus,
  updateTemplate,
  upsertRate,
} from '../repos/index.js';
import { withTransaction } from '../connection.js';

/* ---------------- 通用字典（客户类型/订单类型/付款方式/币种） ---------------- */

export const dictService = {
  list(db: DatabaseSync, category: DictCategory): DictItem[] {
    return listDictItems(db, category);
  },

  create(db: DatabaseSync, input: { category: DictCategory; name: string; color?: string | null; sortOrder?: number }): number {
    if (!input.name || !input.name.trim()) throw bizError('VALIDATION', '名称不能为空');
    return insertDictItem(db, {
      category: input.category,
      name: input.name.trim(),
      color: input.color ?? null,
      sortOrder: input.sortOrder ?? 0,
      isSystem: false,
    });
  },

  update(db: DatabaseSync, id: number, patch: { name?: string; color?: string | null; sortOrder?: number; enabled?: boolean }): void {
    if (!getDictItem(db, id)) throw bizError('NOT_FOUND', '字典项不存在');
    if (patch.name !== undefined && (!patch.name || !patch.name.trim()))
      throw bizError('VALIDATION', '名称不能为空');
    updateDictItem(db, id, patch.name !== undefined ? { ...patch, name: patch.name.trim() } : patch);
  },

  /** 删除保护：被业务数据引用即禁止（PRD 4.6.1） */
  delete(db: DatabaseSync, id: number): void {
    const item = getDictItem(db, id);
    if (!item) throw bizError('NOT_FOUND', '字典项不存在');
    const refs = countDictRefs(db, item);
    if (refs > 0) throw bizError('DICT_IN_USE', `被 ${refs} 条业务数据引用`);
    deleteDictItem(db, id);
  },
};

/* ---------------- 订单状态字典（带终态/结果/默认完成语义） ---------------- */

export const statusDictService = {
  list(db: DatabaseSync, enabledOnly = false): OrderStatus[] {
    return listStatuses(db, enabledOnly);
  },

  create(
    db: DatabaseSync,
    input: {
      name: string;
      color: string;
      sortOrder?: number;
      isTerminal?: boolean;
      terminalResult?: TerminalResult;
      isDefaultCompleted?: boolean;
    },
  ): number {
    if (!input.name || !input.name.trim()) throw bizError('VALIDATION', '状态名称不能为空');
    if (input.isTerminal && !input.terminalResult) throw bizError('VALIDATION', '终态必须指定结果（完成/取消）');
    if (!input.isTerminal && input.terminalResult) throw bizError('VALIDATION', '非终态不能指定结果');
    const id = withTransaction(db, () => {
      if (input.isDefaultCompleted) {
        db.prepare('UPDATE order_status SET is_default_completed = 0 WHERE is_default_completed = 1').run();
      }
      return insertStatus(db, {
        name: input.name.trim(),
        color: input.color,
        sortOrder: input.sortOrder ?? 0,
        isTerminal: !!input.isTerminal,
        terminalResult: input.terminalResult ?? null,
        isDefaultCompleted: !!input.isDefaultCompleted,
        isSystem: false,
      });
    });
    return id;
  },

  update(
    db: DatabaseSync,
    id: number,
    patch: {
      name?: string;
      color?: string;
      sortOrder?: number;
      isTerminal?: boolean;
      terminalResult?: TerminalResult;
      isDefaultCompleted?: boolean;
      enabled?: boolean;
    },
  ): void {
    const existing = getStatus(db, id);
    if (!existing) throw bizError('NOT_FOUND', '状态不存在');
    if (patch.name !== undefined && (!patch.name || !patch.name.trim()))
      throw bizError('VALIDATION', '状态名称不能为空');
    const mergedTerminal = patch.isTerminal !== undefined ? patch.isTerminal : existing.isTerminal;
    const mergedResult =
      patch.terminalResult !== undefined ? patch.terminalResult : existing.terminalResult;
    if (mergedTerminal && !mergedResult) throw bizError('VALIDATION', '终态必须指定结果（完成/取消）');
    if (!mergedTerminal && mergedResult) throw bizError('VALIDATION', '非终态不能指定结果');
    withTransaction(db, () => {
      if (patch.isDefaultCompleted) {
        db.prepare(
          'UPDATE order_status SET is_default_completed = 0 WHERE is_default_completed = 1 AND id != ?',
        ).run(id);
      }
      updateStatus(db, id, patch);
    });
  },

  /** 删除保护：系统预置不可删；被订单引用不可删（PRD 4.6.1 / 附录 A 决策 18） */
  delete(db: DatabaseSync, id: number): void {
    const existing = getStatus(db, id);
    if (!existing) throw bizError('NOT_FOUND', '状态不存在');
    if (existing.isSystem) throw bizError('STATUS_SYSTEM');
    const refs = countStatusRefs(db, id);
    if (refs > 0) throw bizError('STATUS_IN_USE', `被 ${refs} 个订单引用`);
    deleteStatus(db, id);
  },
};

/* ---------------- 节点模板 ---------------- */

export const templateService = {
  list(db: DatabaseSync, enabledOnly = false): NodeTemplate[] {
    return listTemplates(db, enabledOnly);
  },

  create(
    db: DatabaseSync,
    input: { name: string; code?: string | null; sortOrder?: number; remark?: string | null },
  ): number {
    if (!input.name || !input.name.trim()) throw bizError('VALIDATION', '节点名称不能为空');
    if (input.code) {
      const dup = db
        .prepare('SELECT id FROM node_template WHERE code = ?')
        .get(input.code) as { id: number } | undefined;
      if (dup) throw bizError('TEMPLATE_CODE_DUPLICATE');
    }
    return insertTemplate(db, {
      name: input.name.trim(),
      code: input.code ?? null,
      sortOrder: input.sortOrder ?? 0,
      isSystem: false,
      remark: input.remark ?? null,
    });
  },

  update(
    db: DatabaseSync,
    id: number,
    patch: { name?: string; code?: string | null; sortOrder?: number; enabled?: boolean; remark?: string | null },
  ): void {
    if (!getTemplate(db, id)) throw bizError('NOT_FOUND', '节点模板不存在');
    if (patch.name !== undefined && (!patch.name || !patch.name.trim()))
      throw bizError('VALIDATION', '节点名称不能为空');
    if (patch.code) {
      const dup = db
        .prepare('SELECT id FROM node_template WHERE code = ? AND id != ?')
        .get(patch.code, id) as { id: number } | undefined;
      if (dup) throw bizError('TEMPLATE_CODE_DUPLICATE');
    }
    updateTemplate(db, id, patch);
  },

  /** 删除保护：被订单节点引用即禁止；系统预置模板可删（PRD 允许自定义增删改） */
  delete(db: DatabaseSync, id: number): void {
    if (!getTemplate(db, id)) throw bizError('NOT_FOUND', '节点模板不存在');
    const refs = countTemplateRefs(db, id);
    if (refs > 0) throw bizError('TEMPLATE_IN_USE', `被 ${refs} 个订单节点引用`);
    deleteTemplate(db, id);
  },
};

/* ---------------- 汇率 ---------------- */

export const rateService = {
  list(db: DatabaseSync): (CurrencyRate & { currencyName: string })[] {
    return listRates(db);
  },

  upsert(db: DatabaseSync, currencyId: number, rate: number): void {
    const currency = getDictItem(db, currencyId);
    if (!currency || currency.category !== 'currency') throw bizError('CURRENCY_NOT_FOUND');
    if (!Number.isFinite(rate) || rate <= 0) throw bizError('VALIDATION', '汇率必须为正数');
    upsertRate(db, currencyId, round6(rate));
  },
};
