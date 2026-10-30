/** 渲染层 API：window.api 的强类型封装，统一解包 {ok,data}|{ok:false,...} 信封 */
import type { Api } from '../../preload/index';

declare global {
  interface Window {
    api: Api;
  }
}

interface ApiError extends Error {
  code: string;
}

type Envelope<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const r = (await window.api.invoke<T>(channel, ...args)) as Envelope<T>;
  if (!r.ok) {
    const err = new Error(r.message) as ApiError;
    err.code = r.code;
    throw err;
  }
  return r.data;
}

export interface HealthInfo {
  ok: boolean;
  dataDir: string;
  appVersion: string;
}

export const api = {
  health: (): Promise<HealthInfo> => call<HealthInfo>('health'),

  /* 客户 */
  customers: {
    list: (filter: unknown): Promise<unknown> => call('customers:list', filter),
    options: (): Promise<{ id: number; name: string }[]> => call('customers:options'),
    get: (id: number): Promise<unknown> => call('customers:get', id),
    create: (input: unknown): Promise<number> => call('customers:create', input),
    update: (id: number, input: unknown): Promise<void> => call('customers:update', id, input),
    softDelete: (id: number): Promise<{ orderCount: number }> => call('customers:softDelete', id),
    uploadLogo: (id: number): Promise<{ storedPath: string } | null> =>
      call('customers:uploadLogo', id),
    clearLogo: (id: number): Promise<void> => call('customers:clearLogo', id),
    reorder: (ids: number[]): Promise<void> => call('customers:reorder', ids),
  },

  /* 订单 */
  orders: {
    list: (filter: unknown): Promise<unknown> => call('orders:list', filter),
    get: (id: number): Promise<unknown> => call('orders:get', id),
    items: (id: number): Promise<unknown> => call('orders:items', id),
    overview: (filter: unknown): Promise<unknown> => call('orders:overview', filter),
    create: (input: unknown): Promise<number> => call('orders:create', input),
    update: (id: number, input: unknown): Promise<void> => call('orders:update', id, input),
    restoreAutoAmount: (id: number): Promise<void> => call('orders:restoreAutoAmount', id),
    remove: (id: number): Promise<void> => call('orders:delete', id),
  },

  /* 节点 */
  nodes: {
    listByOrder: (orderId: number): Promise<unknown> => call('nodes:listByOrder', orderId),
    create: (orderId: number, input: unknown): Promise<number> => call('nodes:create', orderId, input),
    update: (id: number, input: unknown): Promise<unknown> => call('nodes:update', id, input),
    updateFields: (id: number, input: unknown): Promise<void> => call('nodes:updateFields', id, input),
    reorder: (orderId: number, ids: number[]): Promise<void> => call('nodes:reorder', orderId, ids),
    remove: (id: number): Promise<void> => call('nodes:delete', id),
    addFollowUp: (nodeId: number, content: string): Promise<number> => call('nodes:addFollowUp', nodeId, content),
    listFollowUps: (nodeId: number): Promise<unknown> => call('nodes:listFollowUps', nodeId),
    addAttachment: (nodeId: number, sourcePath: string): Promise<unknown> => call('nodes:addAttachment', nodeId, sourcePath),
    listAttachments: (nodeId: number): Promise<unknown> => call('nodes:listAttachments', nodeId),
    deleteAttachment: (id: number): Promise<void> => call('nodes:deleteAttachment', id),
  },

  attachments: {
    open: (storedPath: string): Promise<void> => call('attachments:open', storedPath),
    openFolder: (storedPath: string): Promise<void> => call('attachments:openFolder', storedPath),
    pickAndAdd: (nodeId: number): Promise<unknown> => call('attachments:pickAndAdd', nodeId),
    url: (storedPath: string): Promise<{ url: string }> => call('attachments:url', storedPath),
  },

  /* 客户微信群 */
  wechat: {
    listAllGroups: (): Promise<unknown> => call('wechat:listAllGroups'),
    listGroups: (customerId: number): Promise<unknown> => call('wechat:listGroups', customerId),
    createGroup: (customerId: number, input: unknown): Promise<number> => call('wechat:createGroup', customerId, input),
    updateGroup: (id: number, input: unknown): Promise<void> => call('wechat:updateGroup', id, input),
    deleteGroup: (id: number): Promise<void> => call('wechat:deleteGroup', id),
    listMembers: (groupId: number): Promise<unknown> => call('wechat:listMembers', groupId),
    createMember: (groupId: number, input: unknown): Promise<number> => call('wechat:createMember', groupId, input),
    updateMember: (id: number, input: unknown): Promise<void> => call('wechat:updateMember', id, input),
    deleteMember: (id: number): Promise<void> => call('wechat:deleteMember', id),
  },

  /* 订单文档 / 采购合同 */
  orderDocs: {
    list: (orderId: number, kind?: 'file' | 'purchase_contract'): Promise<unknown> =>
      call('orderDocs:list', orderId, kind),
    pickAndAdd: (orderId: number): Promise<unknown> => call('orderDocs:pickAndAdd', orderId),
    pickAndAddImage: (orderId: number): Promise<unknown> => call('orderDocs:pickAndAddImage', orderId),
    remove: (id: number): Promise<void> => call('orderDocs:delete', id),
  },

  /* 物料库 */
  materials: {
    list: (filter: unknown): Promise<unknown> => call('materials:list', filter),
    options: (): Promise<unknown> => call('materials:options'),
    get: (id: number): Promise<unknown> => call('materials:get', id),
    create: (input: unknown): Promise<number> => call('materials:create', input),
    update: (id: number, input: unknown): Promise<void> => call('materials:update', id, input),
    remove: (id: number): Promise<void> => call('materials:delete', id),
    orders: (id: number): Promise<unknown> => call('materials:orders', id),
  },

  /* 供应商 */
  suppliers: {
    list: (filter: unknown): Promise<unknown> => call('suppliers:list', filter),
    options: (): Promise<unknown> => call('suppliers:options'),
    get: (id: number): Promise<unknown> => call('suppliers:get', id),
    create: (input: unknown): Promise<number> => call('suppliers:create', input),
    update: (id: number, input: unknown): Promise<void> => call('suppliers:update', id, input),
    remove: (id: number): Promise<void> => call('suppliers:delete', id),
    orders: (id: number): Promise<unknown> => call('suppliers:orders', id),
    materials: (id: number): Promise<unknown> => call('suppliers:materials', id),
  },

  /* 看板与提醒 */
  stats: {
    dashboard: (): Promise<unknown> => call('stats:dashboard'),
  },
  reminders: {
    list: (): Promise<unknown> => call('reminders:list'),
  },

  /* 字典 */
  dicts: {
    list: (category: string): Promise<unknown> => call('dicts:list', category),
    create: (input: unknown): Promise<number> => call('dicts:create', input),
    update: (id: number, patch: unknown): Promise<void> => call('dicts:update', id, patch),
    remove: (id: number): Promise<void> => call('dicts:delete', id),
    reorder: (category: string, ids: number[]): Promise<void> => call('dicts:reorder', category, ids),
  },
  statuses: {
    list: (enabledOnly?: boolean): Promise<unknown> => call('statuses:list', enabledOnly),
    create: (input: unknown): Promise<number> => call('statuses:create', input),
    update: (id: number, patch: unknown): Promise<void> => call('statuses:update', id, patch),
    remove: (id: number): Promise<void> => call('statuses:delete', id),
    reorder: (ids: number[]): Promise<void> => call('statuses:reorder', ids),
  },
  templates: {
    list: (enabledOnly?: boolean): Promise<unknown> => call('templates:list', enabledOnly),
    create: (input: unknown): Promise<number> => call('templates:create', input),
    update: (id: number, patch: unknown): Promise<void> => call('templates:update', id, patch),
    remove: (id: number): Promise<void> => call('templates:delete', id),
    reorder: (ids: number[]): Promise<void> => call('templates:reorder', ids),
  },
  rates: {
    list: (): Promise<unknown> => call('rates:list'),
    upsert: (currencyId: number, rate: number): Promise<void> => call('rates:upsert', currencyId, rate),
  },

  /* 设置 */
  settings: {
    getOrderNoConfig: (): Promise<unknown> => call('settings:getOrderNoConfig'),
    setOrderNoConfig: (cfg: unknown): Promise<unknown> => call('settings:setOrderNoConfig', cfg),
    getQuoteConfig: (): Promise<unknown> => call('settings:getQuoteConfig'),
    setQuoteConfig: (cfg: unknown): Promise<unknown> => call('settings:setQuoteConfig', cfg),
    getMenuOrder: (): Promise<string> => call('settings:getMenuOrder'),
    setMenuOrder: (order: string[]): Promise<string> => call('settings:setMenuOrder', order),
    storageInfo: (): Promise<unknown> => call('settings:storageInfo'),
    migrateDataDir: (dir: string): Promise<unknown> => call('settings:migrateDataDir', dir),
    setBackupDir: (dir: string): Promise<unknown> => call('settings:setBackupDir', dir),
  },

  /* 导入导出 */
  exportCustomers: (): Promise<string | null> => call('export:customers'),
  exportOrders: (filter: unknown): Promise<string | null> => call('export:orders', filter),
  exportItems: (): Promise<string | null> => call('export:items'),
  exportOrderDetail: (id: number): Promise<string | null> => call('export:orderDetail', id),
  exportQuote: (orderId: number): Promise<string | null> => call('export:quote', orderId),
  exportQuoteDocx: (payload: unknown): Promise<string | null> => call('export:quoteDocx', payload),
  downloadCustomerTemplate: (): Promise<string | null> => call('import:customerTemplate'),
  downloadOrderTemplate: (): Promise<string | null> => call('import:orderTemplate'),
  importCustomers: (): Promise<{ file: string; report: ImportReport } | null> => call('import:customers'),
  importOrders: (): Promise<{ file: string; report: ImportReport } | null> => call('import:orders'),

  /* 备份恢复 */
  backup: {
    create: (customDir?: string): Promise<unknown> => call('backup:create', customDir),
    list: (): Promise<unknown> => call('backup:list'),
    pickAndRestore: (): Promise<unknown> => call('backup:pickAndRestore'),
  },

  relaunch: (): void => {
    void call('system:relaunch');
  },
};

export interface ImportReport {
  successCount: number;
  failCount: number;
  failures: { row: number; reason: string }[];
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
