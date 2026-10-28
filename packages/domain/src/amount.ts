import { round2, round4, round6 } from '@erp/shared';

export { round2, round4, round6 };

export interface ItemLike {
  qty: number;
  unitPrice?: number | null;
}

/** 明细小计 = 数量 × 单价，2 位小数（PRD 4.3.1） */
export function itemSubtotal(item: ItemLike): number {
  const price = item.unitPrice ?? 0;
  if (!Number.isFinite(price) || !Number.isFinite(item.qty)) return 0;
  return round2(item.qty * price);
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

/** 折人民币（按订单汇率快照） */
export function toCny(amount: number, exchangeRate: number | null | undefined): number {
  const rate = exchangeRate ?? 1;
  return round2(amount * (Number.isFinite(rate) ? rate : 1));
}
