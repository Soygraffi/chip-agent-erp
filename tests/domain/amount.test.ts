import { describe, it } from 'node:test';
import { expect } from '../test-utils.ts';
import { itemSubtotal, autoTotal, effectiveTotal, toCny, round2, round4, round6 } from '@erp/domain';

describe('金额计算', () => {
  it('浮点陷阱：0.1 × 3 小计应为 0.3 而不是 0.30000000000000004', () => {
    expect(itemSubtotal({ qty: 3, unitPrice: 0.1 })).toBe(0.3);
  });

  it('小计四舍五入到 2 位小数', () => {
    expect(itemSubtotal({ qty: 7, unitPrice: 0.1234 })).toBe(0.86); // 0.8638 → 0.86
    expect(itemSubtotal({ qty: 7, unitPrice: 0.1236 })).toBe(0.87); // 0.8652 → 0.87
  });

  it('1.005 四舍五入为 1.01（EPSILON 修正）', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
  });

  it('单价为空或非法时小计为 0', () => {
    expect(itemSubtotal({ qty: 10, unitPrice: null })).toBe(0);
    expect(itemSubtotal({ qty: 10, unitPrice: undefined })).toBe(0);
    expect(itemSubtotal({ qty: 10, unitPrice: NaN })).toBe(0);
  });

  it('自动总金额 = Σ小计（2 位），无明细为 0', () => {
    expect(
      autoTotal([
        { qty: 2, unitPrice: 10.55 },
        { qty: 3, unitPrice: 0.1 },
      ]),
    ).toBe(21.4);
    expect(autoTotal([])).toBe(0);
  });

  it('有效总金额：手改取手改值、未手改取自动值', () => {
    expect(effectiveTotal(false, 99, 21.4)).toBe(21.4);
    expect(effectiveTotal(true, 88.8, 21.4)).toBe(88.8);
    expect(effectiveTotal(true, null, 21.4)).toBe(21.4);
  });

  it('折人民币：按汇率快照四舍五入，汇率空视为 1', () => {
    expect(toCny(100, 7.2)).toBe(720);
    expect(toCny(100.5, 7.123456)).toBe(715.91); // 715.907... → 715.91
    expect(toCny(55, null)).toBe(55);
  });

  it('精度工具：round4 / round6', () => {
    expect(round4(0.12345)).toBe(0.1235);
    expect(round6(7.1234567)).toBe(7.123457);
  });
});
