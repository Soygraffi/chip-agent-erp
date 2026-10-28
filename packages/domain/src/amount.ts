import { round2, round4, round6 } from '@erp/shared';

export { round2, round4, round6 };

export interface ItemLike {
  qty: number;
  /** 出货价 */
  unitPrice?: number | null;
  /** 出货价是否含税（默认 true） */
  priceTaxIncluded?: boolean | null;
  /** 进货价 */
  purchasePrice?: number | null;
  /** 进货价是否含税（默认 true） */
  purchaseTaxIncluded?: boolean | null;
  /** 税率（%），默认 13 */
  taxRate?: number | null;
}

export function normalizeTaxRate(rate: number | null | undefined): number {
  const r = rate ?? 13;
  return Number.isFinite(r) && r >= 0 ? r : 13;
}

function grossPrice(price: number | null | undefined, taxIncluded: boolean | null | undefined, rate: number): number {
  const p = price ?? 0;
  if (!Number.isFinite(p)) return 0;
  return taxIncluded === false ? round4(p * (1 + rate / 100)) : p;
}

/** 含税出货单价：含税价直接用；不含税价按税率换算（4 位小数） */
export function taxIncludedPrice(item: ItemLike): number {
  return grossPrice(item.unitPrice, item.priceTaxIncluded, normalizeTaxRate(item.taxRate));
}

/** 含税进货单价：含税价直接用；不含税价按税率换算（未指定进货口径时沿用出货口径，兼容历史数据） */
export function purchaseTaxIncludedPrice(item: ItemLike): number {
  const flag =
    item.purchaseTaxIncluded !== undefined && item.purchaseTaxIncluded !== null
      ? item.purchaseTaxIncluded
      : item.priceTaxIncluded;
  return grossPrice(item.purchasePrice, flag, normalizeTaxRate(item.taxRate));
}

/** 单据金额（含税金额）= 数量 × 含税出货单价，2 位小数 */
export function itemSubtotal(item: ItemLike): number {
  const price = taxIncludedPrice(item);
  if (!Number.isFinite(price) || !Number.isFinite(item.qty)) return 0;
  return round2(item.qty * price);
}

/** 毛利 = 数量 × (含税出货价 − 含税进货价) */
export function itemGrossProfit(item: ItemLike): number {
  const sale = taxIncludedPrice(item);
  const purchase = purchaseTaxIncludedPrice(item);
  return round2(item.qty * (sale - purchase));
}

/** 利润率（%）= (含税出货价 − 含税进货价) / 含税进货价 × 100；进货价为 0 时返回 null */
export function marginRate(item: ItemLike): number | null {
  const sale = taxIncludedPrice(item);
  const purchase = purchaseTaxIncludedPrice(item);
  if (!purchase) return null;
  return round2(((sale - purchase) / purchase) * 100);
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
