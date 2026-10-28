import { formatDateForOrderNo, type OrderNoDateFormat } from '@erp/shared';

export interface OrderNoConfig {
  prefix: string;
  dateFormat: OrderNoDateFormat;
  seqWidth: number; // 2-6
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 生成下一个订单编号（PRD 4.3.1 / data-model 6.2）
 * 格式：{前缀}{按格式化的今天日期}{流水}，按日重置、撞号顺延
 * @param existingNos 全库订单编号（用于取当日最大流水与撞号顺延）
 */
export function nextOrderNo(
  config: OrderNoConfig,
  now: Date,
  existingNos: string[],
): string {
  const dateStr = formatDateForOrderNo(now, config.dateFormat);
  const fullPrefix = config.prefix + dateStr;
  const re = new RegExp('^' + escapeRegExp(fullPrefix) + '(\\d+)$');
  let max = 0;
  for (const no of existingNos) {
    const m = re.exec(no);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  let next = max + 1;
  const existing = new Set(existingNos);
  let candidate = fullPrefix + String(next).padStart(config.seqWidth, '0');
  // 撞上既有手录编号则顺延
  while (existing.has(candidate)) {
    next += 1;
    candidate = fullPrefix + String(next).padStart(config.seqWidth, '0');
  }
  return candidate;
}

/** 解析自动生成的编号结构；若不是自动格式返回 null */
export function parseOrderNo(
  config: OrderNoConfig,
  orderNo: string,
): { prefix: string; dateStr: string; seq: number } | null {
  const re = new RegExp(
    '^(' + escapeRegExp(config.prefix) + ')(\\d{4}-?\\d{2}-?\\d{2}|\\d{6})(\\d{' + config.seqWidth + '})$',
  );
  const m = re.exec(orderNo);
  if (!m) return null;
  return { prefix: m[1], dateStr: m[2], seq: parseInt(m[3], 10) };
}
