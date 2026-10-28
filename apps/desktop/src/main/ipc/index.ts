import { BrowserWindow, dialog, ipcMain, shell, app } from 'electron';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BizError, todayStr } from '@erp/shared';
import type { NodeStatus, DictCategory } from '@erp/shared';
import {
  customerService,
  dictService,
  nodeService,
  orderService,
  orderAttachmentService,
  wechatService,
  rateService,
  statsService,
  statusDictService,
  templateService,
  getOrderNoConfig,
  setSetting,
  type OrderFilter,
} from '@erp/db';
import type { AppContext } from '../bootstrap';
import { migrateDataDir, effectiveBackupsDir, dataDirSize } from '../migrate-dir';
import {
  storeAttachment,
  storeOrderAttachment,
  removeStoredFile,
  removeStoredFiles,
  attachmentAbsolutePath,
  customerTemplate,
  exportCustomers,
  exportFileName,
  exportItems,
  exportOrderDetail,
  exportOrders,
  importCustomers,
  importOrders,
  orderTemplate,
  createBackup,
  listBackups,
  restoreBackup,
  validateBackup,
  APP_VERSION,
} from '@erp/tools';

type Result<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

/**
 * 跨包副本安全的结构化 BizError 识别：
 * hoisted 布局下 @erp/tools 内部持有自己的 @erp/shared 副本，
 * instanceof 会跨副本失效，改用 code 字段 + 名称判断。
 */
function isBizError(e: unknown): e is { code: string; message: string } {
  return (
    e instanceof Error &&
    e.name === 'BizError' &&
    typeof (e as { code?: unknown }).code === 'string'
  );
}

function wrap<T>(fn: () => T): Result<T> {
  try {
    return { ok: true, data: fn() };
  } catch (e) {
    if (isBizError(e)) return { ok: false, code: e.code, message: e.message };
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[ipc]', e);
    return { ok: false, code: 'INTERNAL', message: msg };
  }
}

async function wrapAsync<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (isBizError(e)) return { ok: false, code: e.code, message: e.message };
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[ipc]', e);
    return { ok: false, code: 'INTERNAL', message: msg };
  }
}

export function notifyDataChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('data-changed');
  }
}

/** 每次写操作后广播；读操作不广播 */
const changed = (): void => notifyDataChanged();

export function registerIpc(ctxRef: { ctx: AppContext }): void {
  const db = (): AppContext['db'] => ctxRef.ctx.db;

  ipcMain.handle('health', () => ({
    ok: true,
    dataDir: ctxRef.ctx.dataDir,
    appVersion: APP_VERSION,
  }));

  /* ---------------- 客户 ---------------- */
  ipcMain.handle('customers:list', (_e, filter) =>
    wrap(() => customerService.list(db(), filter)),
  );
  ipcMain.handle('customers:options', () => wrap(() => customerService.options(db())));
  ipcMain.handle('customers:get', (_e, id: number) => wrap(() => customerService.get(db(), id)));
  ipcMain.handle('customers:create', (_e, input) => {
    const r = wrap(() => customerService.create(db(), input));
    if (r.ok) changed();
    return r;
  });
  ipcMain.handle('customers:update', (_e, id: number, input) => {
    const r = wrap(() => customerService.update(db(), id, input));
    if (r.ok) changed();
    return r;
  });
  ipcMain.handle('customers:softDelete', (_e, id: number) => {
    const r = wrap(() => customerService.softDelete(db(), id, todayStr()));
    if (r.ok) changed();
    return r;
  });

  /* ---------------- 订单 ---------------- */
  ipcMain.handle('orders:list', (_e, filter: OrderFilter) =>
    wrap(() => orderService.list(db(), { ...filter, today: todayStr() })),
  );
  ipcMain.handle('orders:get', (_e, id: number) => wrap(() => orderService.get(db(), id)));
  ipcMain.handle('orders:create', (_e, input) => {
    const r = wrap(() => orderService.create(db(), input));
    if (r.ok) changed();
    return r;
  });
  ipcMain.handle('orders:update', (_e, id: number, input) => {
    const r = wrap(() => orderService.update(db(), id, input));
    if (r.ok) changed();
    return r;
  });
  ipcMain.handle('orders:restoreAutoAmount', (_e, id: number) => {
    const r = wrap(() => orderService.restoreAutoAmount(db(), id));
    if (r.ok) changed();
    return r;
  });
  ipcMain.handle('orders:delete', (_e, id: number) => {
    const r = wrap(() => {
      const { attachmentPaths } = orderService.delete(db(), id);
      const orderDocPaths = orderAttachmentService.pathsByOrder(db(), id);
      removeStoredFiles(ctxRef.ctx.dataDir, [...attachmentPaths, ...orderDocPaths]);
      return { id };
    });
    if (r.ok) changed();
    return r;
  });

  /* ---------------- 客户微信群 ---------------- */
  ipcMain.handle('wechat:listGroups', (_e, customerId: number) =>
    wrap(() => wechatService.listGroups(db(), customerId)),
  );
  ipcMain.handle('wechat:createGroup', (_e, customerId: number, input: { name: string; remark?: string | null }) => {
    const r = wrap(() => wechatService.createGroup(db(), customerId, input));
    if (r.ok) changed();
    return r;
  });
  ipcMain.handle('wechat:updateGroup', (_e, id: number, input) => {
    const r = wrap(() => wechatService.updateGroup(db(), id, input));
    if (r.ok) changed();
    return r;
  });
  ipcMain.handle('wechat:deleteGroup', (_e, id: number) => {
    const r = wrap(() => wechatService.deleteGroup(db(), id));
    if (r.ok) changed();
    return r;
  });
  ipcMain.handle('wechat:listMembers', (_e, groupId: number) =>
    wrap(() => wechatService.listMembers(db(), groupId)),
  );
  ipcMain.handle('wechat:createMember', (_e, groupId: number, input) => {
    const r = wrap(() => wechatService.createMember(db(), groupId, input));
    if (r.ok) changed();
    return r;
  });
  ipcMain.handle('wechat:updateMember', (_e, id: number, input) => {
    const r = wrap(() => wechatService.updateMember(db(), id, input));
    if (r.ok) changed();
    return r;
  });
  ipcMain.handle('wechat:deleteMember', (_e, id: number) => {
    const r = wrap(() => wechatService.deleteMember(db(), id));
    if (r.ok) changed();
    return r;
  });

  /* ---------------- 订单文档（PDF/Word/图片） ---------------- */
  ipcMain.handle('orderDocs:list', (_e, orderId: number) =>
    wrap(() => orderAttachmentService.list(db(), orderId)),
  );
  ipcMain.handle('orderDocs:pickAndAdd', (_e, orderId: number) =>
    wrapAsync(async () => {
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      if (!win) throw new BizError('IO_ERROR', '没有可用窗口');
      const r = await dialog.showOpenDialog(win, {
        title: '上传订单文档（PDF / Word / 图片）',
        filters: [
          { name: '文档', extensions: ['pdf', 'doc', 'docx'] },
          { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] },
          { name: '所有文件', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });
      if (r.canceled || r.filePaths.length === 0) return null;
      const sourcePath = r.filePaths[0];
      const { size } = statSync(sourcePath);
      const { storedPath, originalName } = storeOrderAttachment(
        ctxRef.ctx.attachmentsDir,
        orderId,
        sourcePath,
        size,
      );
      const id = orderAttachmentService.add(db(), orderId, { originalName, storedPath, size });
      changed();
      return { id, originalName, storedPath, size };
    }),
  );
  ipcMain.handle('orderDocs:delete', (_e, id: number) => {
    const r = wrap(() => {
      const { storedPath } = orderAttachmentService.remove(db(), id);
      removeStoredFile(ctxRef.ctx.dataDir, storedPath);
      return { id };
    });
    if (r.ok) changed();
    return r;
  });

  /* ---------------- 节点 ---------------- */
  ipcMain.handle('nodes:listByOrder', (_e, orderId: number) =>
    wrap(() => nodeService.listByOrder(db(), orderId)),
  );
  ipcMain.handle('nodes:create', (_e, orderId: number, input) => {
    const r = wrap(() => nodeService.create(db(), orderId, input));
    if (r.ok) changed();
    return r;
  });
  ipcMain.handle('nodes:update', (_e, id: number, input: { name?: string; status?: NodeStatus; planTime?: string | null; actualTime?: string | null }) => {
    const r = wrap(() => nodeService.update(db(), id, input));
    if (r.ok) changed();
    return r;
  });
  ipcMain.handle('nodes:updateFields', (_e, id: number, input) => {
    const r = wrap(() => nodeService.updateFields(db(), id, input));
    if (r.ok) changed();
    return r;
  });
  ipcMain.handle('nodes:reorder', (_e, orderId: number, ids: number[]) => {
    const r = wrap(() => nodeService.reorder(db(), orderId, ids));
    if (r.ok) changed();
    return r;
  });
  ipcMain.handle('nodes:delete', (_e, id: number) => {
    const r = wrap(() => {
      const { attachmentPaths } = nodeService.delete(db(), id);
      removeStoredFiles(ctxRef.ctx.dataDir, attachmentPaths);
      return { id };
    });
    if (r.ok) changed();
    return r;
  });
  ipcMain.handle('nodes:addFollowUp', (_e, nodeId: number, content: string) => {
    const r = wrap(() => nodeService.addFollowUp(db(), nodeId, content));
    if (r.ok) changed();
    return r;
  });
  ipcMain.handle('nodes:listFollowUps', (_e, nodeId: number) =>
    wrap(() => nodeService.listFollowUps(db(), nodeId)),
  );
  ipcMain.handle('nodes:addAttachment', (_e, nodeId: number, sourcePath: string) => {
    const r = wrap(() => {
      const node = db()
        .prepare('SELECT order_id AS orderId FROM order_node WHERE id = ?')
        .get(nodeId) as { orderId: number } | undefined;
      if (!node) throw new BizError('NODE_NOT_FOUND', '进度节点不存在');
      const { size } = statSync(sourcePath);
      const { storedPath, originalName } = storeAttachment(
        ctxRef.ctx.attachmentsDir,
        node.orderId,
        nodeId,
        sourcePath,
        size,
      );
      const id = nodeService.addAttachment(db(), nodeId, { originalName, storedPath, size });
      return { id, originalName, storedPath, size };
    });
    if (r.ok) changed();
    return r;
  });
  ipcMain.handle('nodes:listAttachments', (_e, nodeId: number) =>
    wrap(() => nodeService.listAttachments(db(), nodeId)),
  );
  ipcMain.handle('attachments:pickAndAdd', (_e, nodeId: number) =>
    wrapAsync(async () => {
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      if (!win) throw new BizError('IO_ERROR', '没有可用窗口');
      const r = await dialog.showOpenDialog(win, {
        title: '选择附件',
        properties: ['openFile'],
      });
      if (r.canceled || r.filePaths.length === 0) return null;
      const sourcePath = r.filePaths[0];
      const node = db()
        .prepare('SELECT order_id AS orderId FROM order_node WHERE id = ?')
        .get(nodeId) as { orderId: number } | undefined;
      if (!node) throw new BizError('NODE_NOT_FOUND', '进度节点不存在');
      const { size } = statSync(sourcePath);
      const { storedPath, originalName } = storeAttachment(
        ctxRef.ctx.attachmentsDir,
        node.orderId,
        nodeId,
        sourcePath,
        size,
      );
      const id = nodeService.addAttachment(db(), nodeId, { originalName, storedPath, size });
      changed();
      return { id, originalName, storedPath, size };
    }),
  );
  ipcMain.handle('nodes:deleteAttachment', (_e, id: number) => {
    const r = wrap(() => {
      const { storedPath } = nodeService.deleteAttachment(db(), id);
      removeStoredFile(ctxRef.ctx.dataDir, storedPath);
      return { id };
    });
    if (r.ok) changed();
    return r;
  });
  ipcMain.handle('attachments:open', (_e, storedPath: string) =>
    wrap(async () => {
      const abs = attachmentAbsolutePath(ctxRef.ctx.dataDir, storedPath);
      const err = await shell.openPath(abs);
      if (err) throw new BizError('IO_ERROR', `无法打开文件：${err}`);
      return true;
    }),
  );
  ipcMain.handle('attachments:openFolder', (_e, storedPath: string) =>
    wrap(() => {
      shell.showItemInFolder(attachmentAbsolutePath(ctxRef.ctx.dataDir, storedPath));
      return true;
    }),
  );

  /* ---------------- 看板与提醒 ---------------- */
  ipcMain.handle('stats:dashboard', () => wrap(() => statsService.dashboard(db(), todayStr())));
  ipcMain.handle('reminders:list', () => wrap(() => statsService.reminders(db(), todayStr())));

  /* ---------------- 字典 ---------------- */
  ipcMain.handle('dicts:list', (_e, category: DictCategory) =>
    wrap(() => dictService.list(db(), category)),
  );
  ipcMain.handle('dicts:create', (_e, input) => {
    const r = wrap(() => dictService.create(db(), input));
    if (r.ok) changed();
    return r;
  });
  ipcMain.handle('dicts:update', (_e, id: number, patch) => {
    const r = wrap(() => dictService.update(db(), id, patch));
    if (r.ok) changed();
    return r;
  });
  ipcMain.handle('dicts:delete', (_e, id: number) => {
    const r = wrap(() => dictService.delete(db(), id));
    if (r.ok) changed();
    return r;
  });
  ipcMain.handle('statuses:list', (_e, enabledOnly?: boolean) =>
    wrap(() => statusDictService.list(db(), enabledOnly)),
  );
  ipcMain.handle('statuses:create', (_e, input) => {
    const r = wrap(() => statusDictService.create(db(), input));
    if (r.ok) changed();
    return r;
  });
  ipcMain.handle('statuses:update', (_e, id: number, patch) => {
    const r = wrap(() => statusDictService.update(db(), id, patch));
    if (r.ok) changed();
    return r;
  });
  ipcMain.handle('statuses:delete', (_e, id: number) => {
    const r = wrap(() => statusDictService.delete(db(), id));
    if (r.ok) changed();
    return r;
  });
  ipcMain.handle('templates:list', (_e, enabledOnly?: boolean) =>
    wrap(() => templateService.list(db(), enabledOnly)),
  );
  ipcMain.handle('templates:create', (_e, input) => {
    const r = wrap(() => templateService.create(db(), input));
    if (r.ok) changed();
    return r;
  });
  ipcMain.handle('templates:update', (_e, id: number, patch) => {
    const r = wrap(() => templateService.update(db(), id, patch));
    if (r.ok) changed();
    return r;
  });
  ipcMain.handle('templates:delete', (_e, id: number) => {
    const r = wrap(() => templateService.delete(db(), id));
    if (r.ok) changed();
    return r;
  });
  ipcMain.handle('rates:list', () => wrap(() => rateService.list(db())));
  ipcMain.handle('rates:upsert', (_e, currencyId: number, rate: number) => {
    const r = wrap(() => rateService.upsert(db(), currencyId, rate));
    if (r.ok) changed();
    return r;
  });

  /* ---------------- 设置 ---------------- */
  ipcMain.handle('settings:getOrderNoConfig', () => wrap(() => getOrderNoConfig(db())));
  ipcMain.handle('settings:setOrderNoConfig', (_e, cfg: { prefix: string; dateFormat: string; seqWidth: number }) => {
    const r = wrap(() => {
      if (!cfg.prefix || cfg.prefix.trim() === '') throw new BizError('VALIDATION', '编号前缀不能为空');
      if (!['YYYYMMDD', 'YYMMDD', 'YYYY-MM-DD'].includes(cfg.dateFormat))
        throw new BizError('VALIDATION', '日期格式不合法');
      if (!Number.isInteger(cfg.seqWidth) || cfg.seqWidth < 2 || cfg.seqWidth > 6)
        throw new BizError('VALIDATION', '流水位数需为 2-6');
      setSetting(db(), 'order_no_prefix', cfg.prefix.trim());
      setSetting(db(), 'order_no_date_format', cfg.dateFormat);
      setSetting(db(), 'order_no_seq_width', String(cfg.seqWidth));
      return getOrderNoConfig(db());
    });
    if (r.ok) changed();
    return r;
  });
  ipcMain.handle('settings:storageInfo', () =>
    wrap(() => ({
      dataDir: ctxRef.ctx.dataDir,
      backupsDir: effectiveBackupsDir(ctxRef.ctx),
      dbSize: dataDirSize(join(ctxRef.ctx.dataDir, 'erp.db')) || statSizeSafe(join(ctxRef.ctx.dataDir, 'erp.db')),
      attachmentsSize: dataDirSize(ctxRef.ctx.attachmentsDir),
    })),
  );
  ipcMain.handle('settings:migrateDataDir', (_e, newDir: string) => {
    const r = wrap(() => {
      const next = migrateDataDir(ctxRef, newDir);
      return { dataDir: next.dataDir };
    });
    if (r.ok) changed();
    return r;
  });
  ipcMain.handle('settings:setBackupDir', (_e, dir: string) => {
    const r = wrap(() => {
      setSetting(db(), 'backup_dir', dir.trim());
      return effectiveBackupsDir(ctxRef.ctx);
    });
    if (r.ok) changed();
    return r;
  });

  /* ---------------- 导入导出 ---------------- */
  ipcMain.handle('export:customers', () =>
    wrapAsync(async () => {
      const buf = await exportCustomers(db());
      return saveBufferWithDialog(`客户列表_${exportFileName('customers')}`, buf);
    }),
  );
  ipcMain.handle('export:orders', (_e, filter: OrderFilter) =>
    wrapAsync(async () => {
      const buf = await exportOrders(db(), { ...filter, today: todayStr() });
      return saveBufferWithDialog(`订单列表_${exportFileName('orders')}`, buf);
    }),
  );
  ipcMain.handle('export:items', () =>
    wrapAsync(async () => {
      const buf = await exportItems(db());
      return saveBufferWithDialog(`订单明细_${exportFileName('items')}`, buf);
    }),
  );
  ipcMain.handle('export:orderDetail', (_e, id: number) =>
    wrapAsync(async () => {
      const buf = await exportOrderDetail(db(), id);
      return saveBufferWithDialog(`订单详情_${exportFileName('order-detail')}`, buf);
    }),
  );
  ipcMain.handle('import:customerTemplate', () =>
    wrapAsync(async () => {
      const buf = await customerTemplate();
      return saveBufferWithDialog('客户导入模板.xlsx', buf);
    }),
  );
  ipcMain.handle('import:orderTemplate', () =>
    wrapAsync(async () => {
      const buf = await orderTemplate(db());
      return saveBufferWithDialog('订单导入模板.xlsx', buf);
    }),
  );
  ipcMain.handle('import:customers', () =>
    wrapAsync(async () => {
      const file = await pickXlsx();
      if (!file) return null;
      const report = await importCustomers(db(), readFileSync(file));
      if (report.successCount > 0) changed();
      return { file, report };
    }),
  );
  ipcMain.handle('import:orders', () =>
    wrapAsync(async () => {
      const file = await pickXlsx();
      if (!file) return null;
      const report = await importOrders(db(), readFileSync(file));
      if (report.successCount > 0) changed();
      return { file, report };
    }),
  );

  /* ---------------- 备份恢复 ---------------- */
  ipcMain.handle('backup:create', (_e, customDir?: string) =>
    wrap(() => {
      const dir = customDir && customDir.trim() !== '' ? customDir.trim() : effectiveBackupsDir(ctxRef.ctx);
      const r = createBackup({ db: db(), dataDir: ctxRef.ctx.dataDir, backupsDir: dir });
      return { ...r, dir };
    }),
  );
  ipcMain.handle('backup:list', () => wrap(() => listBackups(effectiveBackupsDir(ctxRef.ctx))));
  ipcMain.handle('backup:validate', (_e, zipPath: string) =>
    wrap(() => {
      const manifest = validateBackup(zipPath);
      return { manifest };
    }),
  );
  ipcMain.handle('backup:restore', (_e, zipPath: string) =>
    wrap(() => {
      const result = restoreBackup({
        db: db(),
        dataDir: ctxRef.ctx.dataDir,
        backupsDir: effectiveBackupsDir(ctxRef.ctx),
        zipPath,
      });
      return { preRestorePath: result.preRestorePath, manifest: result.manifest };
    }),
  );
  ipcMain.handle('backup:pickAndRestore', () =>
    wrap(async () => {
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      const r = await dialog.showOpenDialog(win ?? undefined!, {
        title: '选择备份文件',
        filters: [{ name: '备份文件', extensions: ['zip'] }],
        properties: ['openFile'],
      });
      if (r.canceled || r.filePaths.length === 0) return null;
      const zipPath = r.filePaths[0];
      const result = restoreBackup({
        db: db(),
        dataDir: ctxRef.ctx.dataDir,
        backupsDir: effectiveBackupsDir(ctxRef.ctx),
        zipPath,
      });
      return { preRestorePath: result.preRestorePath, manifest: result.manifest };
    }),
  );

  ipcMain.handle('system:relaunch', () => {
    app.relaunch();
    app.exit(0);
    return true;
  });
}

function statSizeSafe(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

async function saveBufferWithDialog(defaultName: string, buf: Buffer): Promise<string | null> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (!win) throw new BizError('IO_ERROR', '没有可用窗口');
  const r = await dialog.showSaveDialog(win, {
    title: '导出',
    defaultPath: defaultName,
    filters: [{ name: 'Excel 文件', extensions: ['xlsx'] }],
  });
  if (r.canceled || !r.filePath) return null;
  writeFileSync(r.filePath, buf);
  return r.filePath;
}

async function pickXlsx(): Promise<string | null> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (!win) throw new BizError('IO_ERROR', '没有可用窗口');
  const r = await dialog.showOpenDialog(win, {
    title: '选择要导入的 Excel 文件',
    filters: [{ name: 'Excel 文件', extensions: ['xlsx'] }],
    properties: ['openFile'],
  });
  if (r.canceled || r.filePaths.length === 0) return null;
  return r.filePaths[0];
}
