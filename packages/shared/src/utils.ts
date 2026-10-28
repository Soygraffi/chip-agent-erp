/** 日期与通用小工具（纯函数，无依赖） */

/** 返回本地时区的今天，格式 YYYY-MM-DD */
export function todayStr(now: Date = new Date()): string {
  return toDateStr(now);
}

export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 校验 YYYY-MM-DD 且为真实日期 */
export function isValidDateStr(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** 两个 YYYY-MM-DD 的天数差：a - b（可为负） */
export function dateDiffDays(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const ta = Date.UTC(ay, am - 1, ad);
  const tb = Date.UTC(by, bm - 1, bd);
  return Math.round((ta - tb) / 86400000);
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + days * 86400000);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/** 某日期所在自然月的 [月初, 月末] */
export function monthRange(dateStr: string): [string, string] {
  const [y, m] = dateStr.split('-').map(Number);
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return [start, end];
}

/** 日期字符串比较（字典序即时间序，要求均为 YYYY-MM-DD） */
export function cmpDate(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 金额四舍五入（避免浮点误差：加 EPSILON 后四舍五入） */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
export function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}
export function round6(n: number): number {
  return Math.round((n + Number.EPSILON) * 1e6) / 1e6;
}

/** 订单编号日期格式（PRD 4.6.2 支持三种） */
export type OrderNoDateFormat = 'YYYYMMDD' | 'YYMMDD' | 'YYYY-MM-DD';
export const ORDER_NO_DATE_FORMATS: OrderNoDateFormat[] = ['YYYYMMDD', 'YYMMDD', 'YYYY-MM-DD'];

export function formatDateForOrderNo(d: Date, fmt: OrderNoDateFormat): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  if (fmt === 'YYYYMMDD') return `${y}${m}${day}`;
  if (fmt === 'YYMMDD') return `${String(y).slice(2)}${m}${day}`;
  return `${y}-${m}-${day}`;
}
