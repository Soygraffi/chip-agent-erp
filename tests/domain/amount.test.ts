import { describe, it } from 'node:test';
import { expect } from '../test-utils.ts';
import {
  itemSubtotal,
  autoTotal,
  effectiveTotal,
  taxIncludedPrice,
  itemGrossProfit,
  taxExcludedTotal,
  toCny,
  round2,
  round4,
  round6,
} from '@erp/domain';

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

  it('含税/不含税：不含税价按税率换算为含税单价，再算金额', () => {
    // 含税价：直接用
    expect(taxIncludedPrice({ unitPrice: 29.24, priceTaxIncluded: true, taxRate: 13 })).toBe(29.24);
    // 不含税价 100 × 1.13 = 113
    expect(taxIncludedPrice({ unitPrice: 100, priceTaxIncluded: false, taxRate: 13 })).toBe(113);
    // 不含税 9.9 × 1.06 = 10.494
    expect(taxIncludedPrice({ unitPrice: 9.9, priceTaxIncluded: false, taxRate: 6 })).toBe(10.494);
    expect(itemSubtotal({ qty: 5, unitPrice: 100, priceTaxIncluded: false, taxRate: 13 })).toBe(565);
    // 未传含税标记时默认按含税处理（兼容历史数据）
    expect(itemSubtotal({ qty: 2, unitPrice: 10 })).toBe(20);
  });

  it('毛利 = 数量 ×（含税出货价 − 含税进货价）', () => {
    expect(
      itemGrossProfit({ qty: 5, unitPrice: 29.24, purchasePrice: 12.5, priceTaxIncluded: true, taxRate: 13 }),
    ).toBe(83.7); // (29.24-12.5)*5
    expect(
      itemGrossProfit({ qty: 2, unitPrice: 100, purchasePrice: 80, priceTaxIncluded: false, taxRate: 13 }),
    ).toBe(45.2); // (113-90.4)*2
  });

  it('不含税合计（从含税金额反算）', () => {
    expect(taxExcludedTotal([{ qty: 1, unitPrice: 113, priceTaxIncluded: true, taxRate: 13 }])).toBe(100);
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

  it('折人民币：按汇率快照四舍五入，汇率空视为 1（历史能力保留）', () => {
    expect(toCny(100, 7.2)).toBe(720);
    expect(toCny(100.5, 7.123456)).toBe(715.91); // 715.907... → 715.91
    expect(toCny(55, null)).toBe(55);
  });

  it('精度工具：round4 / round6', () => {
    expect(round4(0.12345)).toBe(0.1235);
    expect(round6(7.1234567)).toBe(7.123457);
  });
});
