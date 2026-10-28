/**
 * 数据库迁移脚本（对应 docs/data-model.md 二章 DDL 与四章种子数据）
 * 采用 TS 内嵌 SQL 而非独立 .sql 文件，避免打包/测试路径问题；版本号与语义不变。
 */

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

const DDL = `
CREATE TABLE dict_item (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category    TEXT    NOT NULL,
  name        TEXT    NOT NULL,
  color       TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_system   INTEGER NOT NULL DEFAULT 0,
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_dict_category ON dict_item(category, sort_order);

CREATE TABLE order_status (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  name                 TEXT    NOT NULL,
  color                TEXT    NOT NULL,
  sort_order           INTEGER NOT NULL DEFAULT 0,
  is_terminal          INTEGER NOT NULL DEFAULT 0,
  terminal_result      TEXT,
  is_default_completed INTEGER NOT NULL DEFAULT 0,
  is_system            INTEGER NOT NULL DEFAULT 0,
  enabled              INTEGER NOT NULL DEFAULT 1,
  created_at           TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at           TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE node_template (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  code       TEXT    UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_system  INTEGER NOT NULL DEFAULT 0,
  enabled    INTEGER NOT NULL DEFAULT 1,
  remark     TEXT
);

CREATE TABLE currency_rate (
  currency_id INTEGER PRIMARY KEY REFERENCES dict_item(id),
  rate        REAL    NOT NULL,
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE customer (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT    NOT NULL,
  name_norm         TEXT    NOT NULL,
  short_name        TEXT,
  type_id           INTEGER REFERENCES dict_item(id),
  contact           TEXT    NOT NULL,
  phone             TEXT    NOT NULL,
  email             TEXT,
  address           TEXT,
  sales_owner       TEXT,
  cooperation_start TEXT,
  is_key            INTEGER NOT NULL DEFAULT 0,
  remark            TEXT,
  deleted_at        TEXT,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE UNIQUE INDEX ux_customer_name ON customer(name_norm) WHERE deleted_at IS NULL;
CREATE INDEX idx_customer_type    ON customer(type_id);
CREATE INDEX idx_customer_deleted ON customer(deleted_at);

CREATE TABLE orders (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no               TEXT    NOT NULL UNIQUE,
  customer_id            INTEGER NOT NULL REFERENCES customer(id),
  order_date             TEXT    NOT NULL,
  type_id                INTEGER REFERENCES dict_item(id),
  status_id              INTEGER NOT NULL REFERENCES order_status(id),
  expected_delivery_date TEXT,
  actual_delivery_date   TEXT,
  currency_id            INTEGER REFERENCES dict_item(id),
  exchange_rate          REAL,
  total_amount           REAL,
  amount_manual          INTEGER NOT NULL DEFAULT 0,
  payment_method_id      INTEGER REFERENCES dict_item(id),
  owner                  TEXT,
  is_key                 INTEGER NOT NULL DEFAULT 0,
  remark                 TEXT,
  created_at             TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at             TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status   ON orders(status_id);
CREATE INDEX idx_orders_date     ON orders(order_date);
CREATE INDEX idx_orders_delivery ON orders(expected_delivery_date);

CREATE TABLE order_item (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  chip_model   TEXT    NOT NULL,
  brand        TEXT,
  package_spec TEXT,
  qty          INTEGER NOT NULL DEFAULT 0,
  unit_price   REAL,
  subtotal     REAL,
  customer_pn  TEXT,
  remark       TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_item_order ON order_item(order_id);
CREATE INDEX idx_item_model ON order_item(chip_model);

CREATE TABLE order_node (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  template_id INTEGER REFERENCES node_template(id),
  name        TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','in_progress','done','delayed')),
  plan_time   TEXT,
  actual_time TEXT,
  owner       TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_node_order ON order_node(order_id, sort_order);
CREATE INDEX idx_node_plan  ON order_node(plan_time) WHERE status IN ('pending','in_progress','delayed');

CREATE TABLE node_follow_up (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id    INTEGER NOT NULL REFERENCES order_node(id) ON DELETE CASCADE,
  content    TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_follow_up_node ON node_follow_up(node_id, created_at);

CREATE TABLE node_attachment (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id       INTEGER NOT NULL REFERENCES order_node(id) ON DELETE CASCADE,
  original_name TEXT    NOT NULL,
  stored_path   TEXT    NOT NULL,
  size          INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_attachment_node ON node_attachment(node_id);

CREATE TABLE setting (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`;

const SEED = `
INSERT INTO order_status (name, color, sort_order, is_terminal, terminal_result, is_default_completed, is_system) VALUES
  ('待确认', '#8C8C8C', 10, 0, NULL,      0, 1),
  ('进行中', '#1677FF', 20, 0, NULL,      0, 1),
  ('已发货', '#13C2C2', 30, 0, NULL,      0, 1),
  ('已完结', '#52C41A', 40, 1, 'completed', 1, 1),
  ('已取消', '#595959', 50, 1, 'cancelled', 0, 1);

INSERT INTO dict_item (category, name, sort_order, is_system) VALUES
  ('customer_type', '终端',   10, 1),
  ('customer_type', '方案商', 20, 1),
  ('customer_type', '贸易商', 30, 1),
  ('customer_type', '其他',   40, 1);

INSERT INTO dict_item (category, name, sort_order, is_system) VALUES
  ('order_type', '样品单',   10, 1),
  ('order_type', '批量订单', 20, 1),
  ('order_type', '备货订单', 30, 1),
  ('order_type', '返单',     40, 1);

INSERT INTO dict_item (category, name, sort_order, is_system) VALUES
  ('payment_method', '款到发货', 10, 1),
  ('payment_method', '月结',     20, 1),
  ('payment_method', '其他',     30, 1);

INSERT INTO dict_item (category, name, sort_order, is_system) VALUES
  ('currency', '人民币 CNY', 10, 1),
  ('currency', '美元 USD',   20, 1);

INSERT INTO currency_rate (currency_id, rate) VALUES
  ((SELECT id FROM dict_item WHERE category='currency' AND name='人民币 CNY'), 1.0),
  ((SELECT id FROM dict_item WHERE category='currency' AND name='美元 USD'),   7.200000);

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

INSERT INTO setting (key, value) VALUES
  ('order_no_prefix', 'XS'),
  ('order_no_date_format', 'YYYYMMDD'),
  ('order_no_seq_width', '4'),
  ('backup_dir', '');
`;

/**
 * V1.2：客户精简（去掉联系人/电话/邮箱/负责业务员/合作起始日期）；
 * 客户微信群 + 成员；订单文档；订单日期/状态可选；去掉币种/汇率/负责人。
 */
const V12 = `
CREATE TABLE customer_wechat_group (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  remark      TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_wechat_group_customer ON customer_wechat_group(customer_id);

CREATE TABLE wechat_member (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id   INTEGER NOT NULL REFERENCES customer_wechat_group(id) ON DELETE CASCADE,
  wechat_id  TEXT    NOT NULL,
  real_name  TEXT,
  position   TEXT,
  remark     TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_wechat_member_group ON wechat_member(group_id);

CREATE TABLE order_attachment (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  original_name TEXT    NOT NULL,
  stored_path   TEXT    NOT NULL,
  size          INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_order_attachment_order ON order_attachment(order_id);

CREATE TABLE order_wechat_group (
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES customer_wechat_group(id) ON DELETE CASCADE,
  PRIMARY KEY (order_id, group_id)
);

CREATE TABLE customer_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  name_norm   TEXT    NOT NULL,
  short_name  TEXT,
  type_id     INTEGER REFERENCES dict_item(id),
  address     TEXT,
  is_key      INTEGER NOT NULL DEFAULT 0,
  remark      TEXT,
  deleted_at  TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
INSERT INTO customer_new (id, name, name_norm, short_name, type_id, address, is_key, remark, deleted_at, created_at, updated_at)
  SELECT id, name, name_norm, short_name, type_id, address, is_key, remark, deleted_at, created_at, updated_at FROM customer;
DROP TABLE customer;
ALTER TABLE customer_new RENAME TO customer;
CREATE UNIQUE INDEX ux_customer_name ON customer(name_norm) WHERE deleted_at IS NULL;
CREATE INDEX idx_customer_type    ON customer(type_id);
CREATE INDEX idx_customer_deleted ON customer(deleted_at);

CREATE TABLE orders_new (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no               TEXT    NOT NULL UNIQUE,
  customer_id            INTEGER NOT NULL REFERENCES customer(id),
  order_date             TEXT,
  type_id                INTEGER REFERENCES dict_item(id),
  status_id              INTEGER REFERENCES order_status(id),
  expected_delivery_date TEXT,
  actual_delivery_date   TEXT,
  total_amount           REAL,
  amount_manual          INTEGER NOT NULL DEFAULT 0,
  payment_method_id      INTEGER REFERENCES dict_item(id),
  is_key                 INTEGER NOT NULL DEFAULT 0,
  remark                 TEXT,
  created_at             TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at             TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
INSERT INTO orders_new (id, order_no, customer_id, order_date, type_id, status_id, expected_delivery_date, actual_delivery_date, total_amount, amount_manual, payment_method_id, is_key, remark, created_at, updated_at)
  SELECT id, order_no, customer_id, order_date, type_id, status_id, expected_delivery_date, actual_delivery_date, total_amount, amount_manual, payment_method_id, is_key, remark, created_at, updated_at FROM orders;
DROP TABLE orders;
ALTER TABLE orders_new RENAME TO orders;
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status   ON orders(status_id);
CREATE INDEX idx_orders_date     ON orders(order_date);
CREATE INDEX idx_orders_delivery ON orders(expected_delivery_date);

CREATE TABLE order_node_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  template_id INTEGER REFERENCES node_template(id),
  name        TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','in_progress','done','delayed')),
  plan_time   TEXT,
  actual_time TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
INSERT INTO order_node_new (id, order_id, template_id, name, status, plan_time, actual_time, sort_order, created_at, updated_at)
  SELECT id, order_id, template_id, name, status, plan_time, actual_time, sort_order, created_at, updated_at FROM order_node;
DROP TABLE order_node;
ALTER TABLE order_node_new RENAME TO order_node;
CREATE INDEX idx_node_order ON order_node(order_id, sort_order);
CREATE INDEX idx_node_plan  ON order_node(plan_time) WHERE status IN ('pending','in_progress','delayed');
`;

/**
 * V1.3：物料库（进货价/出货价/含税标记）；明细增加物料编码、名称、进货价、含税口径；
 * 客户增加 logo。
 */
const V13 = `
ALTER TABLE customer ADD COLUMN logo_path TEXT;

CREATE TABLE material (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  code               TEXT    NOT NULL,        -- 物料编码
  code_norm          TEXT    NOT NULL,        -- 归一化编码（唯一性依据）
  name               TEXT    NOT NULL,        -- 物料名称
  spec               TEXT,                    -- 料号规格
  brand              TEXT,
  purchase_price     REAL,                    -- 进货价
  sale_price         REAL,                    -- 出货价（默认报价）
  price_tax_included INTEGER NOT NULL DEFAULT 1, -- 1=价格含税
  tax_rate           REAL    NOT NULL DEFAULT 13,
  remark             TEXT,
  is_active          INTEGER NOT NULL DEFAULT 1,
  created_at         TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at         TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE UNIQUE INDEX ux_material_code ON material(code_norm);
CREATE INDEX idx_material_active ON material(is_active);

ALTER TABLE order_item ADD COLUMN material_id INTEGER REFERENCES material(id);
ALTER TABLE order_item ADD COLUMN material_code TEXT;
ALTER TABLE order_item ADD COLUMN material_name TEXT;
ALTER TABLE order_item ADD COLUMN purchase_price REAL;
ALTER TABLE order_item ADD COLUMN price_tax_included INTEGER NOT NULL DEFAULT 1;
ALTER TABLE order_item ADD COLUMN tax_rate REAL NOT NULL DEFAULT 13;

INSERT INTO setting (key, value) VALUES ('company_name', '')
  ON CONFLICT(key) DO NOTHING;
INSERT INTO setting (key, value) VALUES
  ('quote_terms', '1、交货周期：具体交货时间以合同约定时间为准
2、付款方式：票到月结30天付现')
  ON CONFLICT(key) DO NOTHING;
INSERT INTO setting (key, value) VALUES
  ('quote_footer', '如果对上述条款有任何问题，请随时向我们垂询。')
  ON CONFLICT(key) DO NOTHING;
`;

/**
 * V1.4：客户卡片可拖动排序（sort_order）；进货价/出货价各自可选含税口径。
 */
const V14 = `
ALTER TABLE customer ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
UPDATE customer SET sort_order = id;

ALTER TABLE material ADD COLUMN purchase_tax_included INTEGER NOT NULL DEFAULT 1;
ALTER TABLE order_item ADD COLUMN purchase_tax_included INTEGER NOT NULL DEFAULT 1;
`;

/**
 * V1.5：客户联系人（可选）；群成员增加任职公司；订单总览支持（无结构变更）。
 */
const V15 = `
ALTER TABLE customer ADD COLUMN contact TEXT;
ALTER TABLE wechat_member ADD COLUMN company TEXT;
`;

/**
 * V1.6：供应商管理（供应芯片的公司）；物料可关联供应商；菜单顺序设置。
 */
const V16 = `
CREATE TABLE supplier (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  name_norm  TEXT    NOT NULL,
  short_name TEXT,
  contact    TEXT,
  phone      TEXT,
  address    TEXT,
  remark     TEXT,
  deleted_at TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE UNIQUE INDEX ux_supplier_name ON supplier(name_norm) WHERE deleted_at IS NULL;

ALTER TABLE material ADD COLUMN supplier_id INTEGER REFERENCES supplier(id);

INSERT INTO setting (key, value) VALUES ('menu_order', '')
  ON CONFLICT(key) DO NOTHING;
`;

export const MIGRATIONS: Migration[] = [
  { version: 1, name: 'init', sql: DDL },
  { version: 2, name: 'seed', sql: SEED },
  { version: 3, name: 'v1.2 customer wechat & optional order fields', sql: V12 },
  { version: 4, name: 'v1.3 material library, tax-aware item prices, customer logo', sql: V13 },
  { version: 5, name: 'v1.4 customer sort order & per-price tax flags', sql: V14 },
  { version: 6, name: 'v1.5 customer contact & member company', sql: V15 },
  { version: 7, name: 'v1.6 supplier management & menu order', sql: V16 },
];

