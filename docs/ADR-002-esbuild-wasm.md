# ADR-002：测试与构建工具链的沙箱适配（Rollup 构建 + node --test）

- 状态：已采纳
- 日期：2026-10-28
- 修订：2026-10-28（构建器由 electron-vite 改为 Rollup）

## 背景

本开发会话运行在受限沙箱中，两条硬约束：

1. **Node 子进程以管道捕获输出一律 EPERM**（child_process spawn/exec 默认 stdio）
2. pnpm 11 不再读取 package.json 的 `pnpm` 字段，配置迁至 `pnpm-workspace.yaml`

原计划（dev-plan 1.1）的 vite/electron-vite/vitest 均依赖 esbuild，而 **esbuild 原生版与
esbuild-wasm 在 Node 端都通过 spawn 子进程（pipe stdio）工作**，沙箱内全部不可用。

## 决策

1. **构建器改用 Rollup + 官方插件（node-resolve / commonjs / typescript）**：
   - 全部为纯 JS 进程内实现，无任何子进程；沙箱与用户真机行为一致
   - main/preload 输出 CJS（external 仅 electron 与 node: 内置模块，@erp/* 与三方依赖打入 bundle）
   - renderer 输出单文件 ESM bundle + 复制 index.html / antd reset.css / styles.css
   - 构建脚本：`apps/desktop/build.mjs`（programmatic API），替代 electron-vite
2. **测试运行器改用 Node 内置 `node --test`**（Node ≥23.6 原生 TS 类型剥离）：
   - `pnpm test` → `node --test --test-isolation=none "tests/**/*.test.ts"`
   - vitest 从依赖中移除；断言使用 `tests/test-utils.ts` 的轻量 expect（基于 node:assert/strict）
   - packages 编译为 dist/*.js（tsc，NodeNext），包内相对导入显式 `.js` 扩展名；
     测试文件（tests/ 下 .ts）由 Node 类型剥离直接执行
3. `onlyBuiltDependencies: [electron]` 置于 `pnpm-workspace.yaml`（pnpm 11 新位置），
   允许 electron 下载二进制。

## 影响

- 测试完全运行在 Node 内置能力上；构建（rollup）在沙箱内可用
- 开发热更新（HMR）不再提供：`pnpm dev` = 构建后启动 electron（用户真机终端可用）
- 不改变任何业务代码、测试断言内容与验收标准

## 备注

- 打包（electron-builder）依赖子进程，仅限无沙箱终端使用；
  沙箱内以「测试 + 类型检查 + 构建产物 + 无头冒烟」验证
- vitest 可随时按 dev-plan 恢复（无沙箱环境），测试文件仅需改回 vitest 导入与 expect
