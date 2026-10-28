# ADR-001：数据库驱动改用 node:sqlite（替代 better-sqlite3）

- 状态：已采纳
- 日期：2026-10-28

## 背景

开发计划（docs/dev-plan.md 1.1）原定 better-sqlite3。开发机经检查：
网络可用（Node HTTPS 正常），但**未安装 Visual Studio Build Tools**，better-sqlite3 为
原生模块，Electron ABI 版本必须本地编译（prebuild 若缺失则安装失败），且每次升级
Electron 都需重编。

## 决策

使用 **Node 内置 `node:sqlite`（DatabaseSync）** 替代 better-sqlite3：

- Node ≥22.13 / Electron ≥36 均内置该模块（无实验 flag），本机 Node 24 与目标 Electron 37 都满足
- 同步 API 与 better-sqlite3 同构（prepare/run/get/all），仓储层几乎零改动
- 零原生依赖：无编译、无下载、无 ABI 匹配问题，安装与打包更可靠
- 仓储层接口不变，将来如需要可无痛换回 better-sqlite3 或迁 MySQL

## 影响

- packages/db/src/connection.ts 的 `openDatabase` 用 node:sqlite 实现
- 命名参数不可用，全部用位置参数 `?`；`run()` 的 lastInsertRowid 显式 `Number()` 转换
- 其余架构（领域层/仓储接口/迁移器/种子/口径 SQL）与 dev-plan 完全一致

## 备选方案（未采纳）

- better-sqlite3 + 安装 VS Build Tools：依赖外部工具链，本机不可行
- 数据库 BLOB 自研存储：可靠性风险大，违背“标准 SQLite 便于迁移”的 PRD 要求
