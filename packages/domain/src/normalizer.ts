/**
 * 客户名称归一化（PRD 4.2.1 / data-model 6.1）
 * 规则：去首尾空格 → NFKC（全角转半角等）→ 字母小写 → 内部连续空白压成一个空格
 */
export function normalizeName(name: string): string {
  const trimmed = name.trim();
  const nfkc = trimmed.normalize('NFKC');
  const lower = nfkc.toLowerCase();
  return lower.replace(/[ \t\u00a0]+/g, ' ');
}

/** 两个名称按归一化后判重 */
export function sameName(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b);
}
