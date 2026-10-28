# 芯片代理商客户订单进度管理系统（本地桌面版）

以客户为中心的芯片代理商订单全流程管理工具：客户 → 订单 → 进度节点三级数据，替代碎片化的 Excel 记录。
数据 100% 本地存储（SQLite），支持 Excel 导入导出与一键备份恢复（含附件）。

## 文档

- 产品需求：[docs/PRD-v1.1.md](docs/PRD-v1.1.md)
- 数据模型：[docs/data-model.md](docs/data-model.md)
- 开发计划：[docs/dev-plan.md](docs/dev-plan.md)
- 使用说明：[docs/USAGE.md](docs/USAGE.md)
- 架构决策：[docs/ADR-001-node-sqlite.md](docs/ADR-001-node-sqlite.md)、[docs/ADR-002-esbuild-wasm.md](docs/ADR-002-esbuild-wasm.md)

## 技术栈

- Electron + React 18 + TypeScript + Ant Design 5 + ECharts
- 数据库：node:sqlite（Node/Electron 内置，零原生依赖）
- 工具：exceljs（Excel）、adm-zip（备份压缩）
- 测试：node --test（Node ≥23.6 原生 TS 类型剥离，零第三方测试框架）

## 目录结构

```
apps/desktop/          Electron 应用（主进程 IPC 路由 / 渲染层页面 / 构建脚本 build.mjs）
packages/shared/       共享类型与工具（纯 TS）
packages/domain/       领域逻辑（编号/金额/状态机/口径/提醒/导入校验，纯函数可单测）
packages/db/           数据访问层（node:sqlite 迁移/种子/仓储）+ 应用服务层
packages/tools/        Excel 导入导出 / 附件托管 / 备份恢复
tests/                 领域/仓储/服务/工具/验收/性能 共 166 个测试
scripts/               benchmark.ts（性能基准）、download-electron.mjs（镜像下载 Electron）
```

## 常用命令

```bash
pnpm install          # 安装依赖（首次需网络）
pnpm build:packages   # 编译 shared/domain/db/tools
pnpm test             # 运行全部测试（166 个）
pnpm typecheck        # 全仓类型检查
pnpm build            # 构建桌面应用（packages + rollup）
pnpm dev              # 构建后启动 Electron（开发无热更新，见 ADR-002）
pnpm smoke            # 无头冒烟测试（ELECTRON_RUN_AS_NODE）
```

## 开发环境要求

- Windows 10/11 64 位
- Node.js ≥ 23.6（推荐 24.x；Electron 运行环境内置，用户机器无需安装）
- pnpm ≥ 10（本仓库使用 pnpm 11，配置在 pnpm-workspace.yaml）

## 打包发布（用户真机执行）

```bash
pnpm add -D electron-builder -w
cd apps/desktop && npx electron-builder --config electron-builder.yml
```

产物在 `apps/desktop/release/`（NSIS 安装包 + portable 免安装版）。
注意：electron-builder 依赖子进程调用 7z 等工具，无法在受限沙箱内执行（ADR-002）。

## 数据位置

- 默认数据目录：`%APPDATA%\ChipAgentERP\data`（erp.db + attachments/ + backups/）
- 可在「系统设置 → 存储设置」中迁移数据目录（旧目录保留作回退）
- 卸载/重装不会删除数据；重装后用备份文件即可完整恢复（含附件）
