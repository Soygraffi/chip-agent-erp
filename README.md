# 芯片代理商客户订单进度管理系统（本地桌面版 V1.2）

以客户为中心的芯片代理商订单全流程管理工具：客户 → 订单 → 进度节点三级数据，替代碎片化的 Excel 记录。
数据 100% 本地存储（SQLite），支持 Excel 导入导出与一键备份恢复（含附件）。

**V1.2 最新能力**

- 客户：只保留全称/简称/类型/地址/备注/重点客户（去掉联系人、电话、邮箱、负责业务员、合作起始日期）
- 客户微信群：一个客户可加多个群（商务交流群、研发交流群…），每群可维护成员的微信号 → 真实姓名 / 岗位
- 订单文档：支持上传 PDF / Word / 图片，随订单一起备份、删除时一并清理
- 订单字段可选：日期/类型/状态等不填即显示「未填写」，不阻断保存；统计与导出统一口径
- 订单可多选该客户的沟通微信群；去掉负责人、币种与汇率
- 升级自动迁移数据库（v2 → v3），原有客户/订单/节点数据完整保留

## 文档

- 产品需求：[docs/PRD-v1.1.md](docs/PRD-v1.1.md)（V1.2 增量：[docs/PRD-v1.2-delta.md](docs/PRD-v1.2-delta.md)）
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
tests/                 领域/仓储/服务/工具/验收/性能 共 179 个测试
scripts/               benchmark.ts（性能基准）、download-electron.mjs（镜像下载 Electron）、verify-migration.mjs
```

## 常用命令

```bash
pnpm install          # 安装依赖（首次需网络）
pnpm build:packages   # 编译 shared/domain/db/tools
pnpm test             # 运行全部测试（179 个）
pnpm typecheck        # 全仓类型检查
pnpm build            # 构建桌面应用（packages + rollup）