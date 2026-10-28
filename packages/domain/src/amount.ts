import { round2, round4, round6 } from '@erp/shared';

export { round2, round4, round6 };

export interface ItemLike {
  qty: number;
  /** 出货价 */
  unitPrice?: number | null;
  /** 进货价 */
  purchasePrice?: number | null;
  /** true=单价为含税价（默认 true） */
  priceTaxIncluded?: boolean | null;
  /** 税率（%），默认 13 */
  taxRate?: number | null;
}

export function normalizeTaxRate(rate: number | null | undefined): number {
  const r = rate ?? 13;
  return Number.isFinite(r) && r >= 0 ? r : 13;
}

/** 含税单价：含税价直接用；不含税价按税率换算（4 位小数） */
export function taxIncludedPrice(item: ItemLike): number {
  const price = item.unitPrice ?? 0;
  if (!Number.isFinite(price)) return 0;
  if (item.priceTaxIncluded === false) {
    return round4(price * (1 + normalizeTaxRate(item.taxRate) / 100));
  }
  return price;
}

/** 单据金额（含税金额）= 数量 × 含税单价，2 位小数 */
export function itemSubtotal(item: ItemLike): number {
  const price = taxIncludedPrice(item);
  if (!Number.isFinite(price) || !Number.isFinite(item.qty)) return 0;
  return round2(item.qty * price);
}

/** 毛利 = 数量 × (含税出货价 − 含税进货价)，按相同税率口径计算 */
export function itemGrossProfit(item: ItemLike): number {
  const sale = taxIncludedPrice(item);
  const purchase = taxIncludedPrice({ ...item, unitPrice: item.purchasePrice ?? 0 });
  return round2(item.qty * (sale - purchase));
}

/** 自动总金额 = Σ小计（round2 汇总），无明细为 0 */
export function autoTotal(items: ItemLike[]): number {
  const sum = items.reduce((acc, it) => acc + itemSubtotal(it), 0);
  return round2(sum);
}

/** 有效总金额：手改则取手改值，否则取自动值 */
export function effectiveTotal(
  amountManual: boolean,
  totalAmount: number | null | undefined,
  auto: number,
): number {
  if (amountManual) {
    return round2(totalAmount ?? auto);
  }
  return auto;
}

/** 不含税金额（从含税金额反算），用于报表/对账 */
export function taxExcludedTotal(items: ItemLike[]): number {
  const sum = items.reduce((acc, it) => {
    const gross = itemSubtotal(it);
    const rate = normalizeTaxRate(it.taxRate) / 100;
    return acc + gross / (1 + rate);
  }, 0);
  return round2(sum);
}

/** 折人民币（历史遗留函数，V1.2 起订单不再使用汇率） */
export function toCny(amount: number, exchangeRate: number | null | undefined): number {
  const rate = exchangeRate ?? 1;
  return round2(amount * (Number.isFinite(rate) ? rate : 1));
}
