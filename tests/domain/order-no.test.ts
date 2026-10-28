import { describe, it } from 'node:test';
import { expect } from '../test-utils.ts';
import { nextOrderNo, parseOrderNo, type OrderNoConfig } from '@erp/domain';

const cfg: OrderNoConfig = { prefix: 'XS', dateFormat: 'YYYYMMDD', seqWidth: 4 };
const now = new Date(2026, 9, 28); // 2026-10-28（本地时间）

describe('订单编号生成（按日重置）', () => {
  it('空库生成当天的第一个编号', () => {
    expect(nextOrderNo(cfg, now, [])).toBe('XS202610280001');
  });

  it('当日已有编号时取最大流水 +1', () => {
    expect(nextOrderNo(cfg, now, ['XS202610280001', 'XS202610280007'])).toBe(
      'XS202610280008',
    );
  });

  it('不同日期流水重新从 0001 开始（按日重置）', () => {
    const yesterday = new Date(2026, 9, 27);
    expect(nextOrderNo(cfg, yesterday, ['XS202610280099'])).toBe('XS202610270001');
  });

  it('与手动编号撞号时顺延到下一个可用号', () => {
    // 自动流水到 0003，但 0003、0004 已被手动占用
    const existing = ['XS202610280001', 'XS202610280002', 'XS202610280003', 'XS202610280004'];
    expect(nextOrderNo(cfg, now, existing)).toBe('XS202610280005');
  });

  it('其它日期/前缀的编号不影响当日流水', () => {
    const existing = ['AB202610270042', 'XS202610280001', '手工单号'];
    expect(nextOrderNo(cfg, now, existing)).toBe('XS202610280002');
  });

  it('自定义前缀、日期格式与流水位数', () => {
    const c1: OrderNoConfig = { prefix: 'DD', dateFormat: 'YYMMDD', seqWidth: 3 };
    expect(nextOrderNo(c1, now, [])).toBe('DD261028001');
    const c2: OrderNoConfig = { prefix: 'SO-', dateFormat: 'YYYY-MM-DD', seqWidth: 5 };
    expect(nextOrderNo(c2, now, [])).toBe('SO-2026-10-2800001');
  });

  it('流水位数不足以容纳时按实际位数输出（唯一性由数据库兜底）', () => {
    const existing = Array.from({ length: 9999 }, (_, i) => `XS20261028${String(i + 1).padStart(4, '0')}`);
    expect(nextOrderNo(cfg, now, existing)).toBe('XS2026102810000');
  });

  it('parseOrderNo 解析自动编号结构', () => {
    expect(parseOrderNo(cfg, 'XS202610280042')).toEqual({
      prefix: 'XS',
      dateStr: '20261028',
      seq: 42,
    });
    expect(parseOrderNo(cfg, '手工单号')).toBeNull();
  });
});
