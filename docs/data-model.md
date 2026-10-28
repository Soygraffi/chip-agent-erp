# 数据模型设计（V1.3 · 本地桌面版）

> 本文档是《PRD v1.1》与增量说明（`docs/PRD-v1.2-delta.md`、`docs/PRD-v1.3-delta.md`）的技术配套文档，定义 SQLite 数据库的完整表结构、字典语义、种子数据、目录结构与关键算法。
>
> **V1.2 变更**：移除客户联系人/电话/邮箱/负责业务员/合作起始日期；新增客户微信群与成员、订单文档、订单-微信群关联；订单日期/类型/状态可空；移除订单币种/汇率/负责人与节点负责人。
> **V1.3 变更**：新增物料库（进货价/出货价/含税口径/税率）；订单明细增加物料编码/名称/进货价/含税口径；客户增加 Logo；新增报价单导出。
> **V1.4 变更**：客户增加 sort_order（卡片拖动排序）；进货价/出货价各自独立含税标记（purchase_tax_included）；节点顺序改由模板拖动排序维护。
> **V1.5 变更**：客户增加 contact（联系人，可选）；群成员增加 company（任职公司）。迁移脚本见 packages/db/src/migrations.ts（version 3、4、5、6）。

## 一、实体关系（ER）

```
customer (客户) 1 ──── N orders (订单) 1 ──── N order_item (订单明细)
  │                       │
  │                       ├──── N order_node (进度节点) 1 ──── N node_follow_up (跟进记录)
  │                       │                                    └─── N node_attachment (附件)
  │                       │
  │                       ├──── N order_attachment (订单文档: PDF/Word/图片)
  │                       ├──── N order_wechat_group (沟通群关联) N ──── 1 customer_wechat_group
  │                       ├──── N order_item.material_id ──── 1 material (物料库)
  │                       ├──── dict_item: order_type / payment_method
  │                       ├──── order_status (订单状态字典, 带终态语义；可为空)
  │                       └──── node_template (节点模板, 带语义码) ←─ order_node.template_id
  │
  └──── N customer_wechat_group (客户微信群) 1 ──── N wechat_member (群成员)

material (物料库) 1 ──── N order_item (订单明细)

currency_rate (汇率表，V1.2 起 UI 不再使用) 1 ──── 1 dict_item (category=currency)
```

关系要点：

- 客户软删除（`deleted_at`），订单保留引用，不使用外键级联删除客户
- 删除客户微信群级联删除群成员；删除订单级联删除明细、节点、跟进记录、节点附件、
  订单文档记录、订单-微信群关联（文件实体同步清理）
- 节点删除级联删除：跟进记录、附件（附件实体文件同步删除）
- 订单状态是可配置字典；节点状态是代码内固定枚举
- 订单状态为空表示“未填写”：统计上视为非终态，界面/导出示“未填写”

## 二、建表 DDL

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- 通用字典：客户类型 / 订单类型 / 付款方式 / 币种
CREATE TABLE dict_item (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category    TEXT    NOT NULL,             -- customer_type | order_type | payment_method | currency
  name        TEXT    NOT NULL,
  color       TEXT,                         -- 可选颜色（如客户类型、订单类型标签）
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_system   INTEGER NOT NULL DEFAULT 0,   -- 1=系统预置（不可删除）
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_dict_category ON dict_item(category, sort_order);

-- 订单状态字典（带统计与自动化所需的语义标记）
CREATE TABLE order_status (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  name                 TEXT    NOT NULL,
  color                TEXT    NOT NULL,
  sort_order           INTEGER NOT NULL DEFAULT 0,
  is_terminal          INTEGER NOT NULL DEFAULT 0,   -- 是否终态（非终态计入跟进中/逾期/待发货）
  terminal_result      TEXT,                         -- 终态结果: completed | cancelled | NULL
  is_default_completed INTEGER NOT NULL DEFAULT 0,   -- 自动完结写入的状态（全局唯一）
  is_system            INTEGER NOT NULL DEFAULT 0,
  enabled              INTEGER NOT NULL DEFAULT 1,
  created_at           TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at           TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 节点模板（语义码供统计口径使用，自定义模板无语义码）
CREATE TABLE node_template (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  code       TEXT    UNIQUE,                -- demand/quote/confirm/purchase/stock/arrival/ship/sign/invoice/payment
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_system  INTEGER NOT NULL DEFAULT 0,
  enabled    INTEGER NOT NULL DEFAULT 1,
  remark     TEXT
);

-- 汇率表：每种币种一条，折合人民币
CREATE TABLE currency_rate (
  currency_id INTEGER PRIMARY KEY REFERENCES dict_item(id),
  rate        REAL    NOT NULL,             -- 1 单位外币 = rate 人民币（6 位小数）
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 客户（V1.2：移除联系人/电话/邮箱/负责业务员/合作起始日期）
CREATE TABLE customer (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT    NOT NULL,       -- 客户全称（保留原始写法）
  name_norm         TEXT    NOT NULL,       -- 归一化名称，唯一性判重依据（见 4.3）
  short_name        TEXT,
  type_id           INTEGER REFERENCES dict_item(id),
  address           TEXT,
  contact           TEXT,                   -- V1.5 联系人（可选）
  is_key            INTEGER NOT NULL DEFAULT 0,  -- 重点客户
  remark            TEXT,
  logo_path         TEXT,                   -- V1.3 客户 Logo 相对路径
  sort_order        INTEGER NOT NULL DEFAULT 0, -- V1.4 客户卡片拖动排序
  deleted_at        TEXT,                   -- 软删除时间；NULL=未删除
  created_at        TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
-- 部分唯一索引：仅未删除客户内全称唯一
CREATE UNIQUE INDEX ux_customer_name ON customer(name_norm) WHERE deleted_at IS NULL;
CREATE INDEX idx_customer_type    ON customer(type_id);
CREATE INDEX idx_customer_deleted ON customer(deleted_at);

-- 客户微信群（V1.2：一个客户可有多群，如商务交流群/研发交流群）
CREATE TABLE customer_wechat_group (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,              -- 群名称（必填）
  remark      TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_wechat_group_customer ON customer_wechat_group(customer_id);

-- 微信群成员：群内微信号 → 真实姓名 / 岗位
CREATE TABLE wechat_member (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id   INTEGER NOT NULL REFERENCES customer_wechat_group(id) ON DELETE CASCADE,
  wechat_id  TEXT    NOT NULL,               -- 群内微信号/ID（必填）
  real_name  TEXT,                           -- 真实姓名
  company    TEXT,                           -- V1.5 任职公司
  position   TEXT,                           -- 岗位
  remark     TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_wechat_member_group ON wechat_member(group_id);

-- 订单（V1.2：日期/类型/状态可空；移除币种/汇率/负责人）
CREATE TABLE orders (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no               TEXT    NOT NULL UNIQUE,
  customer_id            INTEGER NOT NULL REFERENCES customer(id),
  order_date             TEXT,               -- YYYY-MM-DD（可空 = 未填写）
  type_id                INTEGER REFERENCES dict_item(id),
  status_id              INTEGER REFERENCES order_status(id),  -- 可空 = 未填写（统计视为非终态）
  expected_delivery_date TEXT,               -- YYYY-MM-DD（逾期口径依据）
  actual_delivery_date   TEXT,
  total_amount           REAL,               -- 有效总金额（自动汇总或手改后的值）
  amount_manual          INTEGER NOT NULL DEFAULT 0,  -- 1=已手改，不再随明细变化
  payment_method_id      INTEGER REFERENCES dict_item(id),
  is_key                 INTEGER NOT NULL DEFAULT 0,  -- 重点跟进
  remark                 TEXT,
  created_at             TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at             TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status   ON orders(status_id);
CREATE INDEX idx_orders_date     ON orders(order_date);
CREATE INDEX idx_orders_delivery ON orders(expected_delivery_date);

-- 订单文档（V1.2：PDF/Word/图片，文件托管，库内只存相对路径）
CREATE TABLE order_attachment (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  original_name TEXT    NOT NULL,            -- 上传时的原文件名
  stored_path   TEXT    NOT NULL,            -- 相对数据目录：attachments/{orderId}/order/{uuid}.ext
  size          INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_order_attachment_order ON order_attachment(order_id);

-- 订单 ↔ 沟通微信群（多对多，群必须属于订单客户）
CREATE TABLE order_wechat_group (
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES customer_wechat_group(id) ON DELETE CASCADE,
  PRIMARY KEY (order_id, group_id)
);

-- 物料库（V1.3）
CREATE TABLE material (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  code               TEXT    NOT NULL,        -- 物料编码（唯一）
  code_norm          TEXT    NOT NULL,        -- 归一化编码（判重依据）
  name               TEXT    NOT NULL,        -- 物料名称
  spec               TEXT,                    -- 料号规格
  brand              TEXT,
  purchase_price     REAL,                    -- 进货价
  purchase_tax_included INTEGER NOT NULL DEFAULT 1, -- V1.4 1=进货价含税
  sale_price         REAL,                    -- 出货价（默认报价）
  price_tax_included INTEGER NOT NULL DEFAULT 1, -- 1=出货价含税
  tax_rate           REAL    NOT NULL DEFAULT 13,
  remark             TEXT,
  is_active          INTEGER NOT NULL DEFAULT 1,
  created_at         TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at         TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE UNIQUE INDEX ux_material_code ON material(code_norm);
CREATE INDEX idx_material_active ON material(is_active);

-- 订单物料明细（V1.3：物料库关联、进货价/出货价、含税口径）
CREATE TABLE order_item (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id           INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  material_id        INTEGER REFERENCES material(id),  -- 物料库关联（可空=手工录入）
  material_code      TEXT,                   -- 物料编码（快照）
  material_name      TEXT,                   -- 物料名称（快照）
  chip_model         TEXT    NOT NULL,       -- 料号规格（如 GD32F407ZGT6）
  brand              TEXT,
  package_spec       TEXT,                   -- 封装规格（选填补充）
  qty                INTEGER NOT NULL DEFAULT 0,
  unit_price         REAL,                   -- 出货价（4 位小数）
  purchase_price     REAL,                   -- 进货价（4 位小数）
  price_tax_included INTEGER NOT NULL DEFAULT 1, -- 1=出货价含税
  purchase_tax_included INTEGER NOT NULL DEFAULT 1, -- V1.4 1=进货价含税
  tax_rate           REAL    NOT NULL DEFAULT 13, -- 税率 %
  subtotal           REAL,                   -- 含税金额 = 数量 × 含税单价（2 位小数）
  customer_pn        TEXT,
  remark             TEXT,
  sort_order         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_item_order ON order_item(order_id);
CREATE INDEX idx_item_model ON order_item(chip_model);
CREATE INDEX idx_item_material ON order_item(material_id);

-- 进度节点（V1.2：移除 owner）
CREATE TABLE order_node (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  template_id INTEGER REFERENCES node_template(id),  -- NULL=用户自定义节点
  name        TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','in_progress','done','delayed')),
  plan_time   TEXT,                          -- 计划完成时间 YYYY-MM-DD（可空，空则不参与提醒）
  actual_time TEXT,                          -- 实际完成时间 YYYY-MM-DD
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_node_order ON order_node(order_id, sort_order);
CREATE INDEX idx_node_plan  ON order_node(plan_time) WHERE status IN ('pending','in_progress','delayed');

-- 节点跟进记录（历史，可多次追加）
CREATE TABLE node_follow_up (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id    INTEGER NOT NULL REFERENCES order_node(id) ON DELETE CASCADE,
  content    TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_follow_up_node ON node_follow_up(node_id, created_at);

-- 节点附件（文件复制进托管目录，库存相对路径）
CREATE TABLE node_attachment (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id       INTEGER NOT NULL REFERENCES order_node(id) ON DELETE CASCADE,
  original_name TEXT    NOT NULL,
  stored_path   TEXT    NOT NULL,   -- 相对数据目录的路径，如 attachments/12/34/uuid.pdf
  size          INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_attachment_node ON node_attachment(node_id);

-- 应用设置（键值对）
CREATE TABLE setting (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- 数据模型版本
CREATE TABLE schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
-- 初始: schema_version=1, app_version, created_at
```

## 三、枚举与字典语义

### 3.1 节点状态（代码内固定枚举，不可配置）

| 存储值 | 显示名 | 时间线颜色 |
|---|---|---|
| pending | 未开始 | 灰 |
| in_progress | 进行中 | 蓝 |
| done | 已完成 | 绿 |
| delayed | 异常延误 | 红 |

### 3.2 订单状态字典语义

| 属性 | 取值 | 用途 |
|---|---|---|
| is_terminal | 0/1 | 终态订单不计入“跟进中/逾期/待发货”等非终态口径 |
| terminal_result | completed / cancelled / NULL | 客户详情 Tab 分组、本月金额统计（取消不计金额） |
| is_default_completed | 0/1 | 全部节点完成时自动写入的状态（全局仅一个启用） |

### 3.3 节点模板语义码

| 顺序 | 名称 | code |
|---|---|---|
| 1 | 需求沟通 | demand |
| 2 | 报价中 | quote |
| 3 | 客户确认 | confirm |
| 4 | 下达采购 | purchase |
| 5 | 供应商备货/排产 | stock |
| 6 | 到货入库 | arrival |
| 7 | 发货中 | ship |
| 8 | 客户签收 | sign |
| 9 | 对账开票 | invoice |
| 10 | 收款完成 | payment |

“待发货”统计依赖 `arrival`/`ship` 语义码：用户删除或停用这两个模板后，指标自然归零（预期行为，PRD 已注明）。

## 四、种子数据

```sql
-- 订单状态（内置，可改名改色，不可删除）
INSERT INTO order_status (name, color, sort_order, is_terminal, terminal_result, is_default_completed, is_system) VALUES
  ('待确认', '#8C8C8C', 10, 0, NULL,      0, 1),
  ('进行中', '#1677FF', 20, 0, NULL,      0, 1),
  ('已发货', '#13C2C2', 30, 0, NULL,      0, 1),
  ('已完结', '#52C41A', 40, 1, 'completed', 1, 1),
  ('已取消', '#595959', 50, 1, 'cancelled', 0, 1);

-- 客户类型
INSERT INTO dict_item (category, name, sort_order, is_system) VALUES
  ('customer_type', '终端',   10, 1),
  ('customer_type', '方案商', 20, 1),
  ('customer_type', '贸易商', 30, 1),
  ('customer_type', '其他',   40, 1);

-- 订单类型
INSERT INTO dict_item (category, name, sort_order, is_system) VALUES
  ('order_type', '样品单',   10, 1),
  ('order_type', '批量订单', 20, 1),
  ('order_type', '备货订单', 30, 1),
  ('order_type', '返单',     40, 1);

-- 付款方式
INSERT INTO dict_item (category, name, sort_order, is_system) VALUES
  ('payment_method', '款到发货', 10, 1),
  ('payment_method', '月结',     20, 1),
  ('payment_method', '其他',     30, 1);

-- 币种与汇率
INSERT INTO dict_item (category, name, sort_order, is_system) VALUES
  ('currency', '人民币 CNY', 10, 1),
  ('currency', '美元 USD',   20, 1);
INSERT INTO currency_rate (currency_id, rate) VALUES
  ((SELECT id FROM dict_item WHERE category='currency' AND name='人民币 CNY'), 1.0),
  ((SELECT id FROM dict_item WHERE category='currency' AND name='美元 USD'),   7.200000);

-- 节点模板（内置 10 个）
INSERT INTO node_template (name, code, sort_order, is_system) VALUES
  ('需求沟通',       'demand',   10, 1),
  ('报价中',         'quote',    20, 1),
  ('客户确认',       'confirm',  30, 1),
  ('下达采购',       'purchase', 40, 1),
  ('供应商备货/排产', 'stock',   50, 1),
  ('到货入库',       'arrival',  60, 1),
  ('发货中',         'ship',     70, 1),
  ('客户签收',       'sign',     80, 1),
  ('对账开票',       'invoice',  90, 1),
  ('收款完成',       'payment',  100, 1);

-- 默认设置
INSERT INTO setting (key, value) VALUES
  ('order_no_prefix', 'XS'),
  ('order_no_date_format', 'YYYYMMDD'),
  ('order_no_seq_width', '4'),
  ('backup_dir', '');
-- schema_meta
INSERT INTO schema_meta (key, value) VALUES ('schema_version', '1');
```

## 五、目录结构与附件托管

```
<数据目录>                          -- 默认 %APPDATA%\ChipAgentERP\data，可在设置中迁移
├── erp.db                          -- SQLite 主库（WAL 模式，附 -wal/-shm 文件）
├── attachments/
│   ├── customer-logos/             -- V1.3 客户 Logo
│   │   └── {customer_id}/
│   │       └── {uuid}.png
│   └── {order_id}/
│       ├── order/                  -- V1.2 订单文档（PDF/Word/图片）
│       │   └── {uuid}.{扩展名}
│       └── {node_id}/
│           └── {uuid}.{扩展名}      -- 节点附件；上传时复制；原文件名存数据库 original_name
└── backups/
    ├── backup_20261028_153000.zip  -- 手动备份
    └── pre_restore_*.zip           -- 恢复前自动备份
```

备份 zip 内容：`erp.db`（含 WAL 合并后的完整库）、`attachments/` 整目录、`manifest.json`（应用版本、schema_version、备份时间、数据库校验值）。

附件规则：

- 上传即复制进托管目录，数据库只存相对路径（`stored_path`），换电脑/换数据目录后依然有效
- 删除节点/订单时，删除数据库记录并删除对应实体文件
- 单文件 ≤ 50MB，每节点可多个，不限类型

## 六、关键算法

### 6.1 客户名称归一化（判重）

```
name_norm = lower(压缩内部连续空白(NFKC(trim(name))))
```

- 去首尾空格；NFKC 归一（全角→半角）；字母小写；内部连续空白压成一个
- 判重范围仅限 `deleted_at IS NULL` 的客户（部分唯一索引兜底）
- 显示与存储均保留用户原始输入

### 6.2 订单编号生成

```
格式: {前缀}{按格式化的今天日期}{流水}，例: XS202610280001
步骤:
  1. today = 按 order_no_date_format 格式化当天日期
  2. 取 orders 中 order_no LIKE '{前缀}{today}%' 的最大尾缀数字 n
  3. next = n + 1，若撞上既有手录编号则继续 +1 直至唯一
  4. order_no = 前缀 + today + 左补零(next, 流水位数)
唯一性由 order_no 唯一索引最终兜底。
```

### 6.3 金额计算（V1.3：含税/不含税口径）

```
含税单价 = price_tax_included ? unit_price : round4(unit_price × (1 + tax_rate/100))
明细金额 subtotal = round(qty × 含税单价, 2)              -- 数量整数、含税单价 4 位小数
自动总金额 auto_total = round(SUM(subtotal), 2)           -- 无明细时为 0
有效总金额 total_amount = amount_manual ? 手改值 : auto_total
毛利 = round(qty × (含税出货价 − 含税进货价), 2)          -- 仅展示/导出，不落库
```

### 6.4 订单自动完结（单向联动）

```
触发条件: 订单下节点数量 > 0，且全部节点 status = 'done'
动作: 将订单 status_id 更新为启用中的 is_default_completed=1 状态（预置「已完结」）
单向: 自动置完结后用户可手动改回；改回后再次全节点完成仍会再触发
```

### 6.5 节点“自动进入下一节点”

```
节点标记为 done 时:
  找到同一订单中 sort_order 大于该节点的第一个 status='pending' 节点，
  若订单非终态，将其置为 'in_progress'；无下一节点则触发订单自动完结检查。
标记 done 时 actual_time 为空则自动填当天日期。
```

### 6.6 首页指标 SQL 口径（V1.2：单币种、状态可空）

```sql
-- 客户总数
SELECT COUNT(*) FROM customer WHERE deleted_at IS NULL;

-- 跟进中订单数（非终态；状态为空视为非终态）
SELECT COUNT(*) FROM orders o LEFT JOIN order_status s ON o.status_id = s.id
WHERE (s.is_terminal = 0 OR o.status_id IS NULL);

-- 本月新增订单数 / 本月订单总金额（V1.2 无币种兑换，取消不计、状态为空计入）
SELECT COUNT(*), ROUND(COALESCE(SUM(o.total_amount), 0), 2)
FROM orders o LEFT JOIN order_status s ON o.status_id = s.id
WHERE o.order_date >= :月初 AND o.order_date <= :月末
  AND NOT (COALESCE(s.is_terminal, 0) = 1 AND s.terminal_result = 'cancelled');

-- 逾期订单数（交期已过且非终态，状态为空也计入）
SELECT COUNT(*) FROM orders o LEFT JOIN order_status s ON o.status_id = s.id
WHERE (s.is_terminal = 0 OR o.status_id IS NULL)
  AND o.expected_delivery_date IS NOT NULL
  AND o.expected_delivery_date < date('now','localtime');

-- 待发货订单数（到货入库已完成 且 发货中未完成）
SELECT COUNT(DISTINCT o.id) FROM orders o LEFT JOIN order_status s ON o.status_id = s.id
WHERE (s.is_terminal = 0 OR o.status_id IS NULL)
  AND EXISTS (SELECT 1 FROM order_node n JOIN node_template t ON n.template_id = t.id
              WHERE n.order_id = o.id AND t.code = 'arrival' AND n.status = 'done')
  AND EXISTS (SELECT 1 FROM order_node n JOIN node_template t ON n.template_id = t.id
              WHERE n.order_id = o.id AND t.code = 'ship'
                AND n.status IN ('pending','in_progress','delayed'));

-- 重点跟进订单数
SELECT COUNT(*) FROM orders o LEFT JOIN order_status s ON o.status_id = s.id
WHERE o.is_key = 1 AND (s.is_terminal = 0 OR o.status_id IS NULL);

-- 状态分布（各状态计数 + 状态为空的“未填写”扇区）
SELECT s.id, s.name, s.color, COUNT(o.id) FROM order_status s
LEFT JOIN orders o ON o.status_id = s.id GROUP BY s.id ORDER BY s.sort_order;
SELECT COUNT(*) FROM orders WHERE status_id IS NULL;  -- 前端合成“未填写”扇区（灰色）
```

### 6.7 到期/逾期节点提醒

```sql
-- 提醒对象: 非终态订单（含状态为空） + 节点状态∈{未开始,进行中,异常延误} + 已填计划时间
-- 逾期:      plan_time < 今天
-- 即将到期:  今天 ≤ plan_time ≤ 今天+3天（含今天）
SELECT n.*, o.order_no, c.name AS customer_name
FROM order_node n
JOIN orders o ON n.order_id = o.id
LEFT JOIN order_status s ON o.status_id = s.id
JOIN customer c ON o.customer_id = c.id
WHERE (s.is_terminal = 0 OR o.status_id IS NULL)
  AND n.status IN ('pending','in_progress','delayed')
  AND n.plan_time IS NOT NULL
  AND date(n.plan_time) < date('now','localtime','+3 days');  -- 两类的并集，前端分组
```

### 6.8 数据目录迁移

```
1. 暂停应用内写入
2. 将整个数据目录（erp.db + attachments/）复制到新路径
3. 校验: 新库可打开 + PRAGMA integrity_check 通过 + 文件清单一致
4. 更新 setting.data_dir，切换连接；旧目录保留不删除（回退用）
```

## 七、数据安全与迁移预留

- **外键与级联**：`foreign_keys=ON`；订单→明细/节点为 `ON DELETE CASCADE`；客户删除不级联（软删除）
- **软删除**：仅 `customer.deleted_at`；无硬删除入口
- **WAL 模式**：默认开启，配合备份时 `wal_checkpoint(TRUNCATE)` 保证备份一致
- **schema_version**：`schema_meta` 中维护，启动时对比应用要求版本，不一致时按迁移脚本升级
- **Web 版预留**：所有表含自增主键与 `created_at/updated_at`；后续加用户体系时仅需在 orders 等表补 `created_by` 列，业务主键（customer/orders）可原样迁移 MySQL（SQLite 与 MySQL 均为关系型，DDL 差异集中在类型与部分索引语法）
