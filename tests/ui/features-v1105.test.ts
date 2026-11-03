import { describe, it } from 'node:test';
import { expect } from '../test-utils.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestDb } from '../db/helpers.ts';
import { supplierService } from '@erp/db';

const root = process.cwd();
const read = (p: string): string => readFileSync(join(root, p), 'utf8');

describe('V1.10.5 供应商 Logo', () => {
  it('供应商可保存/清除 Logo 路径', () => {
    const db = createTestDb();
    const id = supplierService.create(db, { name: '深圳华强电子' });
    supplierService.update(db, id, { logoPath: 'attachments/supplier-logos/1/a.png' });
    expect(supplierService.get(db, id).logoPath).toBe('attachments/supplier-logos/1/a.png');
    supplierService.update(db, id, { logoPath: null });
    expect(supplierService.get(db, id).logoPath).toBe(null);
    db.close();
  });

  it('供应商页面提供上传 Logo 的入口', () => {
    const src = read('apps/desktop/src/renderer/src/pages/SuppliersPage.tsx');
    expect(src.includes('uploadLogo')).toBe(true);
    expect(src.includes('上传/更换 Logo')).toBe(true);
    expect(src.includes('logoUrls')).toBe(true);
    const ipc = read('apps/desktop/src/main/ipc/index.ts');
    expect(ipc.includes('suppliers:uploadLogo')).toBe(true);
    expect(ipc.includes('storeSupplierLogo')).toBe(true);
  });
});
