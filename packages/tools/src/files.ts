import {
  copyFileSync,
  mkdirSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { basename, dirname, join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { bizError } from '@erp/shared';

export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024; // 50MB（PRD 4.4.2）

/** 节点附件复制进托管目录（PRD 4.4.2 / data-model 五章），返回相对路径 */
export function storeAttachment(
  attachmentsDir: string,
  orderId: number,
  nodeId: number,
  sourcePath: string,
  size: number,
): { storedPath: string; originalName: string } {
  if (size > MAX_ATTACHMENT_BYTES) {
    throw bizError('VALIDATION', '单个附件不能超过 50MB');
  }
  const originalName = basename(sourcePath);
  const ext = extname(originalName).slice(0, 20);
  const relDir = join('attachments', String(orderId), String(nodeId));
  const absDir = join(dirname(attachmentsDir), relDir);
  mkdirSync(absDir, { recursive: true });
  const storedName = `${randomUUID()}${ext}`;
  const relPath = join(relDir, storedName);
  copyFileSync(sourcePath, join(dirname(attachmentsDir), relPath));
  return { storedPath: relPath, originalName };
}

/** 订单文档（PDF/Word/图片）复制进托管目录：attachments/{orderId}/order/ */
export function storeOrderAttachment(
  attachmentsDir: string,
  orderId: number,
  sourcePath: string,
  size: number,
): { storedPath: string; originalName: string } {
  if (size > MAX_ATTACHMENT_BYTES) {
    throw bizError('VALIDATION', '单个文件不能超过 50MB');
  }
  const originalName = basename(sourcePath);
  const ext = extname(originalName).slice(0, 20);
  const relDir = join('attachments', String(orderId), 'order');
  const absDir = join(dirname(attachmentsDir), relDir);
  mkdirSync(absDir, { recursive: true });
  const storedName = `${randomUUID()}${ext}`;
  const relPath = join(relDir, storedName);
  copyFileSync(sourcePath, join(dirname(attachmentsDir), relPath));
  return { storedPath: relPath, originalName };
}

/** 客户 logo：attachments/customer-logos/{customerId}/{uuid}.ext（≤5MB、仅图片） */
export function storeCustomerLogo(
  attachmentsDir: string,
  customerId: number,
  sourcePath: string,
  size: number,
): { storedPath: string; originalName: string } {
  if (size > 5 * 1024 * 1024) throw bizError('VALIDATION', 'Logo 图片不能超过 5MB');
  const originalName = basename(sourcePath);
  const ext = extname(originalName).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(ext)) {
    throw bizError('VALIDATION', 'Logo 仅支持 png / jpg / jpeg / gif / webp / bmp');
  }
  const relDir = join('attachments', 'customer-logos', String(customerId));
  const absDir = join(dirname(attachmentsDir), relDir);
  mkdirSync(absDir, { recursive: true });
  const storedName = `${randomUUID()}${ext}`;
  const relPath = join(relDir, storedName);
  copyFileSync(sourcePath, join(dirname(attachmentsDir), relPath));
  return { storedPath: relPath, originalName };
}

/** 删除托管附件文件（数据库记录已删后清理实体） */
export function removeStoredFile(dataDir: string, storedPath: string): void {
  const abs = join(dataDir, storedPath);
  if (!existsSync(abs)) return;
  rmSync(abs, { force: true });
}

/** 删除一批托管文件（订单/节点删除时） */
export function removeStoredFiles(dataDir: string, storedPaths: string[]): void {
  for (const p of storedPaths) {
    removeStoredFile(dataDir, p);
  }
}

export function attachmentAbsolutePath(dataDir: string, storedPath: string): string {
  return join(dataDir, storedPath);
}
