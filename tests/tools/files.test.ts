import { describe, it, beforeEach, afterEach } from 'node:test';
import { expect } from '../test-utils.ts';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import {
  storeAttachment,
  removeStoredFile,
  removeStoredFiles,
  attachmentAbsolutePath,
  MAX_ATTACHMENT_BYTES,
} from '@erp/tools';

let dir: string;
let attachmentsDir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'erp-files-'));
  attachmentsDir = join(dir, 'attachments');
  mkdirSync(attachmentsDir, { recursive: true });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('附件托管（PRD 4.4.2 / data-model 五章）', () => {
  it('上传复制进 attachments/{orderId}/{nodeId}/，保留原文件名与内容', () => {
    const src = join(dir, '报价单.pdf');
    writeFileSync(src, 'PDF-BYTES');
    const r = storeAttachment(attachmentsDir, 12, 34, src, 9);
    expect(r.originalName).toBe('报价单.pdf');
    expect(r.storedPath).toMatch(/^attachments[\\/]12[\\/]34[\\/][0-9a-f-]+\.pdf$/);
    const abs = attachmentAbsolutePath(dir, r.storedPath);
    expect(readFileSync(abs, 'utf8')).toBe('PDF-BYTES');
    expect(basename(abs)).not.toBe('报价单.pdf'); // 存储名用 uuid，原名存库
  });

  it('超过 50MB 拒绝', () => {
    const src = join(dir, 'big.bin');
    writeFileSync(src, 'x');
    expect(() => storeAttachment(attachmentsDir, 1, 1, src, MAX_ATTACHMENT_BYTES + 1)).toThrowError(
      /50MB/,
    );
  });

  it('删除单个与批量删除托管文件', () => {
    const src = join(dir, 'a.txt');
    writeFileSync(src, 'A');
    const r1 = storeAttachment(attachmentsDir, 1, 1, src, 1);
    const r2 = storeAttachment(attachmentsDir, 1, 2, src, 1);
    expect(existsSync(attachmentAbsolutePath(dir, r1.storedPath))).toBe(true);
    removeStoredFile(dir, r1.storedPath);
    expect(existsSync(attachmentAbsolutePath(dir, r1.storedPath))).toBe(false);
    expect(existsSync(attachmentAbsolutePath(dir, r2.storedPath))).toBe(true);
    removeStoredFiles(dir, [r2.storedPath, '不存在的路径']);
    expect(existsSync(attachmentAbsolutePath(dir, r2.storedPath))).toBe(false);
  });
});
