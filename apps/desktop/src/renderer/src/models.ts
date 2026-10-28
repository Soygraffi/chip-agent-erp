/** 渲染层用到的领域模型（与 @erp/shared 一致的类型别名） */
import type {
  Customer,
  CustomerListRow,
  DashboardStats,
  NodeAttachment,
  NodeFollowUp,
  Order,
  OrderItem,
  OrderListRow,
  OrderNode,
  ReminderItem,
} from '@erp/shared';

export type {
  Customer,
  CustomerListRow,
  DashboardStats,
  NodeAttachment,
  NodeFollowUp,
  Order,
  OrderItem,
  OrderListRow,
  OrderNode,
  ReminderItem,
};

export type Page<T> = { rows: T[]; total: number };

export interface OrderDetail extends Order {
  items: OrderItem[];
  nodes: OrderNode[];
}

export const NODE_STATUS_LABELS: Record<string, string> = {
  pending: '未开始',
  in_progress: '进行中',
  done: '已完成',
  delayed: '异常延误',
};

export const NODE_STATUS_COLORS: Record<string, string> = {
  pending: '#8C8C8C',
  in_progress: '#1677FF',
  done: '#52C41A',
  delayed: '#FF4D4F',
};
