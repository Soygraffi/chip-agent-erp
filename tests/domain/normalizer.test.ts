import { describe, it } from 'node:test';
import { expect } from '../test-utils.ts';
import { normalizeName, sameName } from '@erp/domain';

describe('客户名称归一化', () => {
  it('去除首尾空格', () => {
    expect(normalizeName('  华强半导体  ')).toBe('华强半导体');
  });

  it('全角转半角（NFKC）', () => {
    expect(normalizeName('ＡＢＣ电子')).toBe('abc电子');
    expect(normalizeName('华强　半导体')).toBe('华强 半导体');
  });

  it('字母忽略大小写', () => {
    expect(normalizeName('ABC Tech')).toBe('abc tech');
  });

  it('内部连续空白压缩为一个空格', () => {
    expect(normalizeName('a   b\t c')).toBe('a b c');
  });

  it('判重等价性（PRD 4.2.1：全角/大小写/空格变体视为重名）', () => {
    expect(sameName('ＡＢＣ 电子', 'abc 电子')).toBe(true);
    expect(sameName('ABC  Tech', 'abc   tech')).toBe(true); // 内部空白压缩后等价
    expect(sameName('华强半导体', '华强半导体 ')).toBe(true);
    expect(sameName('华强半导体', '华强半导体2')).toBe(false);
    expect(sameName('ABC Tech', 'a b c tech')).toBe(false); // 空格不会被删除，仅压缩
  });
});
