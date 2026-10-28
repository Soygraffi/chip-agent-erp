/** 字典类别（可配置字典） */
export type DictCategory = 'customer_type' | 'order_type' | 'payment_method' | 'currency';

export const DICT_CATEGORIES: DictCategory[] = [
  'customer_type',
  'order_type',
  'payment_method',
];

/** 节点状态（代码内固定枚举，不可配置） */
export type NodeStatus = 'pending' | 'in_progress' | 'done' | 'delayed';

export const NODE_STATUS_VALUES: NodeStatus[] = ['pending', 'in_progress', 'done', 'delayed'];

export const NODE_STATUS_LABELS: Record<NodeStatus, string> = {
  pending: '未开始',
  in_progress: '进行中',
  done: '已完成',
  delayed: '异常延误',
};

export const NODE_STATUS_COLORS: Record<NodeStatus, string> = {
  pending: '#8C8C8C',
  in_progress: '#1677FF',
  done: '#52C41A',
  delayed: '#FF4D4F',
};

export type TerminalResult = 'completed' | 'cancelled' | null;

/** 内置节点模板语义码 */
export const TEMPLATE_CODES = {
  demand: 'demand',
  quote: 'quote',
  confirm: 'confirm',
  purchase: 'purchase',
  stock: 'stock',
  arrival: 'arrival',
  ship: 'ship',
  sign: 'sign',
  invoice: 'invoice',
  payment: 'payment',
} as const;

export interface DictItem {
  id: number;
  category: DictCategory;
  name: string;
  color: string | null;
  sortOrder: number;
  isSystem: boolean;
  enabled: boolean;
}

export interface OrderStatus {
  id: number;
  name: string;
  color: string;
  sortOrder: number;
  isTerminal: boolean;
  terminalResult: TerminalResult;
  isDefaultCompleted: boolean;
  isSystem: boolean;
  enabled: boolean;
}

export interface NodeTemplate {
  id: number;
  name: string;
  code: string | null;
  sortOrder: number;
  isSystem: boolean;
  enabled: boolean;
  remark: string | null;
}

/** 客户（V1.2：移除联系人/电话/邮箱/负责业务员/合作起始日期；V1.3：客户 logo） */
export interface Customer {
  id: number;
  name: string;
  nameNorm: string;
  shortName: string | null;
  typeId: number | null;
  address: string | null;
  isKey: boolean;
  remark: string | null;
  logoPath: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 物料库（V1.3）：报价/订单明细的物料主数据 */
export interface Material {
  id: number;
  code: string;          // 物料编码（唯一，归一化后判重）
  codeNorm: string;
  name: string;          // 物料名称
  spec: string | null;   // 料号规格
  brand: string | null;
  purchasePrice: number | null; // 进货价
  salePrice: number | null;     // 出货价（默认报价）
  priceTaxIncluded: boolean;    // true=价格为含税价
  taxRate: number;              // 税率（%），默认 13
  remark: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialListRow extends Material {
  orderItemCount: number;
  orderCount: number;
  lastOrderDate: string | null;
}

/** 客户微信群（同一客户可有多个群：商务交流群、研发交流群…） */
export interface WechatGroup {
  id: number;
  customerId: number;
  name: string;
  remark: string | null;
  sortOrder: number;
  createdAt: string;
}

/** 微信群成员：群内微信号 → 真实姓名 / 岗位 */
export interface WechatMember {
  id: number;
  groupId: number;
  wechatId: string;
  realName: string | null;
  position: string | null;
  remark: string | null;
  sortOrder: number;
  createdAt: string;
}

/** 订单（V1.2：日期/类型/状态可选；移除币种/汇率/负责人） */
export interface Order {
  id: number;
  orderNo: string;
  customerId: number;
  orderDate: string | null;
  typeId: number | null;
  statusId: number | null;
  expectedDeliveryDate: string | null;
  actualDeliveryDate: string | null;
  totalAmount: number | null;
  amountManual: boolean;
  paymentMethodId: number | null;
  isKey: boolean;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: number;
  orderId: number;
  materialId: number | null;   // 关联物料库（可空，手工录入的行）
  materialCode: string | null; // 物料编码
  materialName: string | null; // 物料名称
  chipModel: string;           // 料号规格（如 GD32F407ZGT6）
  brand: string | null;
  packageSpec: string | null;  // 封装规格（选填的补充说明）
  qty: number;
  unitPrice: number | null;    // 出货价
  purchasePrice: number | null; // 进货价
  priceTaxIncluded: boolean;   // 单价是否为含税价
  taxRate: number;             // 税率（%）
  subtotal: number | null;     // 含税金额 = 数量 × 含税单价
  customerPn: string | null;
  remark: string | null;
  sortOrder: number;
}

export interface OrderNode {
  id: number;
  orderId: number;
  templateId: number | null;
  templateCode: string | null;
  name: string;
  status: NodeStatus;
  planTime: string | null;
  actualTime: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface NodeFollowUp {
  id: number;
  nodeId: number;
  content: string;
  createdAt: string;
}

export interface NodeAttachment {
  id: number;
  nodeId: number;
  originalName: string;
  storedPath: string;
  size: number;
  createdAt: string;
}

/** 订单文档（PDF / Word / 图片） */
export interface OrderAttachment {
  id: number;
  orderId: number;
  originalName: string;
  storedPath: string;
  size: number;
  createdAt: string;
}

export interface CurrencyRate {
  currencyId: number;
  rate: number;
  updatedAt: string;
}

/** 列表视图的订单行（含关联展示字段；状态为空时显示“未填写”） */
export interface OrderListRow extends Order {
  customerName: string;
  customerDeleted: boolean;
  typeName: string | null;
  statusName: string;
  statusColor: string;
  statusIsTerminal: boolean;
  daysOverdue: number; // 0=未逾期
}

export interface CustomerListRow extends Customer {
  typeName: string | null;
  orderCount: number;
  activeOrderCount: number;
  wechatGroupCount: number;
}
export interface ReminderItem {
  nodeId: number;
  orderId: number;
  orderNo: string;
  customerName: string;
  nodeName: string;
  planTime: string;
  kind: 'overdue' | 'upcoming';
  days: number; // overdue: 逾期天数(正)；upcoming: 剩余天数(0-3)
}

export interface StatusDistributionItem {
  statusId: number;
  statusName: string;
  color: string;
  count: number;
}

export interface DashboardStats {
  customerCount: number;
  activeOrderCount: number;
  monthNewOrderCount: number;
  monthTotalAmount: number;
  pendingShipCount: number;
  overdueOrderCount: number;
  keyOrderCount: number;
  statusDistribution: StatusDistributionItem[];
  overdueOrders: OrderListRow[];
  keyOrders: OrderListRow[];
}

export interface Page<T> {
  rows: T[];
  total: number;
}

export interface ImportReport {
  successCount: number;
  failCount: number;
  failures: { row: number; reason: string }[];
}
