// 本地内置 pinyin-pro（MIT，已随程序分发，无需联网）
// @ts-ignore 该文件为纯 JS，无类型声明
import { pinyin } from '../vendor/pinyin-pro/index.mjs';

/** 生成用于搜索的拼音串：全拼 + 首字母（小写） */
export function pinyinIndex(text: string): string {
  if (!text) return '';
  const full = (pinyin(text, { toneType: 'none', type: 'array' }) as string[]).join('');
  const first = (pinyin(text, { pattern: 'first', toneType: 'none', type: 'array' }) as string[]).join('');
  return `${full} ${first}`.toLowerCase();
}

/** 模糊查询：原文包含 或 拼音/首字母包含，忽略大小写与空格 */
export function matchesPinyin(query: string, ...texts: (string | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase().replace(/\s+/g, '');
  if (!q) return true;
  return texts.some((t) => {
    if (!t) return false;
    const lower = t.toLowerCase();
    if (lower.replace(/\s+/g, '').includes(q)) return true;
    return pinyinIndex(t).replace(/\s+/g, '').includes(q);
  });
}

/** Ant Design Select 的 filterOption 实现 */
export function pinyinFilterOption(
  input: string,
  option?: { label?: unknown; value?: unknown },
): boolean {
  const label = typeof option?.label === 'string' ? option.label : String(option?.label ?? '');
  return matchesPinyin(input, label);
}
