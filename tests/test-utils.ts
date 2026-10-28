/**
 * 轻量 expect 断言（基于 node:assert/strict），覆盖测试中用到的 matcher 子集。
 * ADR-002：沙箱内测试运行器为 node --test，不再依赖 vitest。
 */
import assert from 'node:assert/strict';

function toPlain(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(toPlain);
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === null) {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[k] = toPlain(val);
    return out;
  }
  return v;
}

function contains(actual: unknown, s: string): boolean {
  if (typeof actual === 'string') return actual.includes(s);
  if (Array.isArray(actual)) return actual.some((x) => x === s);
  return false;
}

export function expect(actual: unknown): {
  toBe: (expected: unknown) => void;
  toEqual: (expected: unknown) => void;
  toHaveLength: (n: number) => void;
  toBeNull: () => void;
  toBeUndefined: () => void;
  toBeTruthy: () => void;
  toBeGreaterThan: (n: number) => void;
  toBeLessThan: (n: number) => void;
  toContain: (s: string) => void;
  toMatch: (re: RegExp) => void;
  toThrowError: (re: RegExp | string) => void;
  toThrow: (re: RegExp | string) => void;
  not: { toBe: (expected: unknown) => void; toContain: (s: string) => void };
} {
  return {
    toBe(expected: unknown): void {
      assert.strictEqual(actual, expected);
    },
    toEqual(expected: unknown): void {
      assert.deepStrictEqual(toPlain(actual), toPlain(expected));
    },
    toHaveLength(n: number): void {
      assert.strictEqual((actual as { length: number }).length, n);
    },
    toBeNull(): void {
      assert.strictEqual(actual, null);
    },
    toBeUndefined(): void {
      assert.strictEqual(actual, undefined);
    },
    toBeTruthy(): void {
      assert.ok(actual);
    },
    toBeGreaterThan(n: number): void {
      assert.ok(
        (actual as number) > n,
        `expected ${String(actual)} to be greater than ${n}`,
      );
    },
    toBeLessThan(n: number): void {
      assert.ok(
        (actual as number) < n,
        `expected ${String(actual)} to be less than ${n}`,
      );
    },
    toContain(s: string): void {
      assert.ok(
        contains(actual, s),
        `expected ${JSON.stringify(actual)} to contain ${JSON.stringify(s)}`,
      );
    },
    toMatch(re: RegExp): void {
      assert.match(String(actual), re);
    },
    toThrowError(re: RegExp | string): void {
      assert.throws(() => (actual as () => unknown)(), re);
    },
    toThrow(re: RegExp | string): void {
      assert.throws(() => (actual as () => unknown)(), re);
    },
    not: {
      toBe(expected: unknown): void {
        assert.notStrictEqual(actual, expected);
      },
      toContain(s: string): void {
        assert.ok(
          !contains(actual, s),
          `expected ${JSON.stringify(actual)} NOT to contain ${JSON.stringify(s)}`,
        );
      },
    },
  };
}
