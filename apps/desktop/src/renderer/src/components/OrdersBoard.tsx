import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  Modal,
  Pagination,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  message,
} from 'antd';
import { EditOutlined, FileWordOutlined, ReloadOutlined, WechatOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { api, errorMessage } from '../api';
import type { OrderItem, OrderNode, OrderWithDetails, Page } from '../models';
import { ITEM_STAGES, NODE_STATUS_COLORS, NODE_STATUS_LABELS } from '../models';
import { NodeStepper } from './NodeStepper';
import { QuoteModal } from './QuoteModal';
import type { QuoteModalItem } from './QuoteModal';

interface OptionItem {
  id: number;
  name: string;
}

interface OrdersBoardProps {
  showFilters?: boolean;
  pageSize?: number;
  /** 只显示重点跟进订单 */
  onlyKey?: boolean;
  /** 是否显示「报价单」按钮（首页看板不显示） */
  showQuote?: boolean;
  /** 是否显示排序选择（首页看板也显示） */
  showSort?: boolean;
  /** 外部受控排序（如首页把排序放在卡片右上角），格式 field:dir */
  externalSort?: string;
  onSortChange?: (value: string) => void;
  /** 「未下单」的订单排到最后（首页看板） */
  noneLast?: boolean;
  /** 列表缓存键：返回首页时先用上次数据渲染，避免高度变化导致滚动位置跳动 */
  cacheKey?: string;
}

export type SortField = 'order_date' | 'total_amount' | 'expected_delivery_date' | 'progress' | 'manual';

export const SORT_OPTIONS = [
  { value: 'order_date:desc', label: '按日期 ↓' },
  { value: 'order_date:asc', label: '按日期 ↑' },
  { value: 'manual:asc', label: '按设置排序（自定义）' },
  { value: 'total_amount:desc', label: '按金额 ↓' },
  { value: 'total_amount:asc', label: '按金额 ↑' },
  { value: 'expected_delivery_date:asc', label: '按交期 ↑' },
  { value: 'expected_delivery_date:desc', label: '按交期 ↓' },
  { value: 'progress:desc', label: '按进度 ↓（最快在前）' },
  { value: 'progress:asc', label: '按进度 ↑（最慢在前）' },
];

const ITEM_COLUMNS = [
  { title: '品牌', dataIndex: 'brand', width: 100, render: (v: string | null) => v ?? '-' },
  { title: '物料名称', dataIndex: 'materialName', width: 130, render: (v: string | null) => v ?? '-' },
  { title: '料号规格', dataIndex: 'chipModel', width: 150 },
  { title: '数量', dataIndex: 'qty', width: 80, align: 'right' as const },
  {
    title: '含税金额',
    dataIndex: 'subtotal',
    width: 110,
    align: 'right' as const,
    render: (v: number | null) => (v ?? 0).toFixed(2),
  },
];

const BOARD_CACHE = new Map<string, { rows: OrderWithDetails[]; total: number }>();

export function OrdersBoard({
  showFilters = true,
  pageSize: initialPageSize = 50,
  onlyKey = false,
  showQuote = true,
  showSort = true,
  externalSort,
  onSortChange,
  noneLast = false,
  cacheKey,
}: OrdersBoardProps): JSX.Element {
  const navigate = useNavigate();
  const cached = cacheKey ? BOARD_CACHE.get(cacheKey) : undefined;
  const [rows, setRows] = useState<OrderWithDetails[]>(cached?.rows ?? []);
  const [total, setTotal] = useState(cached?.total ?? 0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [loading, setLoading] = useState(!cached);
  const [search, setSearch] = useState('');
  const [quoteOrder, setQuoteOrder] = useState<OrderWithDetails | null>(null);
  const [typeId, setTypeId] = useState<number | null>(null);
  const [range, setRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [sortField, setSortField] = useState<
    'order_date' | 'total_amount' | 'expected_delivery_date' | 'progress' | 'manual'
  >('order_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [types, setTypes] = useState<OptionItem[]>([]);
  const [nodeModal, setNodeModal] = useState<OrderNode | null>(null);
  const [statusValue, setStatusValue] = useState<string>('pending');
  const [form] = Form.useForm();

  useEffect(() => {
    if (nodeModal) {
      form.setFieldsValue({ name: nodeModal.name });
      setStatusValue(nodeModal.status);
    }
  }, [nodeModal, form]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = (await api.orders.overview({
        search: search || undefined,
        typeId,
        dateFrom: range?.[0]?.format('YYYY-MM-DD') ?? undefined,
        dateTo: range?.[1]?.format('YYYY-MM-DD') ?? undefined,
        onlyOverdue,
        onlyKey,
        noneLast,
        sortField,
        sortDir,
        page,
        pageSize,
      })) as Page<OrderWithDetails>;
      setRows(r.rows);
      setTotal(r.total);
      if (cacheKey) BOARD_CACHE.set(cacheKey, { rows: r.rows, total: r.total });
    } catch (e) {
      void message.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [search, typeId, range, onlyOverdue, onlyKey, noneLast, sortField, sortDir, page, pageSize, cacheKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void api.dicts.list('order_type').then((r) => setTypes(r as OptionItem[]));
  }, []);

  // 外部受控排序（首页把排序放在卡片右上角时使用）
  useEffect(() => {
    if (!externalSort) return;
    const [f, d] = externalSort.split(':');
    setSortField(f as SortField);
    setSortDir(d === 'asc' ? 'asc' : 'desc');
  }, [externalSort]);

  // 记住上一次选择的排序（未外部受控时自动恢复）
  useEffect(() => {
    if (externalSort) return;
    void api.settings.getOrderSort().then((saved) => {
      const [f, d] = (saved || 'order_date:desc').split(':');
      if (['order_date', 'total_amount', 'expected_delivery_date', 'progress', 'manual'].includes(f)) {
        setSortField(f as SortField);
        setSortDir(d === 'asc' ? 'asc' : 'desc');
      }
    });
  }, [externalSort]);

  const openNode = (n: OrderNode): void => {
    setNodeModal(n);
  };

  const submitNode = async (): Promise<void> => {
    if (!nodeModal) return;
    const values = await form.validateFields();
    try {
      await api.nodes.update(nodeModal.id, { name: values.name, status: statusValue as never });
      setNodeModal(null);
      void load();
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  const doDelete = async (row: OrderWithDetails): Promise<void> => {
    try {
      await api.orders.remove(row.id);
      void message.success('订单已删除');
      void load();
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  /** 订单状态由节点推导：无 → 客户未继续；全部完成 → 已完结；否则当前节点 */
  const deriveStatus = (nodes: OrderNode[]): { label: string; color: string } => {
    if (nodes.length === 0) return { label: '未填写', color: '#BFBFBF' };
    const sorted = [...nodes].sort((a, b) => a.sortOrder - b.sortOrder);
    const stopped = sorted.find((n) => n.status === 'none');
    if (stopped) return { label: '未下单', color: '#BFBFBF' };
    if (sorted.every((n) => n.status === 'done')) return { label: '已完结', color: '#52C41A' };
    const current = sorted.find((n) => n.status !== 'done')!;
    return {
      label: `${current.name} · ${NODE_STATUS_LABELS[current.status]}`,
      color: NODE_STATUS_COLORS[current.status],
    };
  };

  const sortSelect = (
    <Select
      value={`${sortField}:${sortDir}`}
      style={{ width: 170 }}
      options={SORT_OPTIONS}
      onChange={(v) => {
        const [f, d] = (v as string).split(':');
        setSortField(f as SortField);
        setSortDir(d as 'asc' | 'desc');
        void api.settings.setOrderSort(v as string);
        onSortChange?.(v as string);
      }}
    />
  );

  return (
    <div>
      {showFilters && (
        <Space style={{ marginBottom: 16 }} wrap>
          <Input.Search
            placeholder="搜索订单编号 / 芯片型号"
            allowClear
            style={{ width: 210 }}
            onSearch={(v) => {
              setPage(1);
              setSearch(v);
            }}
          />
          <Select
            allowClear
            placeholder="订单类型"
            style={{ width: 125 }}
            options={types.map((t) => ({ value: t.id, label: t.name }))}
            onChange={(v) => {
              setPage(1);
              setTypeId(v ?? null);
            }}
          />
          <DatePicker.RangePicker
            onChange={(v) => {
              setPage(1);
              setRange(v as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null);
            }}
          />
          <Select
            allowClear
            placeholder="快捷筛选"
            style={{ width: 140 }}
            options={[{ value: 'overdue', label: '仅看逾期' }]}
            onChange={(v) => {
              setPage(1);
              setOnlyOverdue(v === 'overdue');
            }}
          />
          {sortSelect}
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>
            刷新
          </Button>
        </Space>
      )}

      {!showFilters && showSort && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <Space>
            <span style={{ color: '#8c8c8c' }}>排序</span>
            {sortSelect}
          </Space>
        </div>
      )}

      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        {rows.map((o) => (
          <Card
            key={o.id}
            size="small"
            loading={loading}
            style={{ borderLeft: o.daysOverdue > 0 ? '4px solid #ff4d4f' : undefined }}
            title={
              <Space wrap>
                <a onClick={() => navigate(`/orders/${o.id}`)}>{o.customerName}</a>
                {o.customerDeleted && <Tag color="red">已删除客户</Tag>}
                {o.customerContact && <Tag color="blue">联系人：{o.customerContact}</Tag>}
                <Tag color={deriveStatus(o.nodes).color}>{deriveStatus(o.nodes).label}</Tag>
                {(o.wechatGroups ?? []).map((g) => (
                  <Tag key={g.id} icon={<WechatOutlined />} color="cyan">
                    {g.name}
                  </Tag>
                ))}
                {o.daysOverdue > 0 && <Tag color="red">逾期 {o.daysOverdue} 天</Tag>}
                {o.isKey && <Tag color="gold">重点</Tag>}
                <Tag color="blue">阶段 {ITEM_STAGES[Math.floor(o.stage ?? 0)] ?? ITEM_STAGES[0]}</Tag>
                <Tag>{o.typeName ?? '未分类'}</Tag>
              </Space>
            }
            extra={
              <Space>
                <span style={{ color: '#666' }}>金额：<strong>{(o.totalAmount ?? 0).toFixed(2)}</strong></span>
                <span style={{ color: '#999', fontSize: 12 }}>日期：{o.orderDate ?? '未填写'}</span>
                <span style={{ color: '#999', fontSize: 12 }}>交期：{o.expectedDeliveryDate ?? '未填写'}</span>
                {showQuote && (
                  <Button size="small" icon={<FileWordOutlined />} onClick={() => setQuoteOrder(o)}>
                    报价单
                  </Button>
                )}
                <Button size="small" icon={<EditOutlined />} onClick={() => navigate(`/orders/${o.id}/edit`)}>
                  编辑
                </Button>
                <Popconfirm
                  title={`删除订单「${o.orderNo}」`}
                  description="明细、节点、订单文档与附件会一并删除，不可恢复。"
                  okText="确认删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => void doDelete(o)}
                >
                  <Button size="small" danger>
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            }
          >
            <NodeStepper nodes={o.nodes} onSelect={openNode} compact />
            <Table<OrderItem>
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={o.items}
              locale={{ emptyText: '暂无物料明细' }}
              columns={ITEM_COLUMNS}
            />
          </Card>
        ))}
        {rows.length === 0 && !loading && <Card size="small">暂无订单</Card>}
      </Space>

      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <Pagination
          current={page}
          pageSize={pageSize}
          total={total}
          showSizeChanger
          pageSizeOptions={[10, 20, 50]}
          showTotal={(t) => `共 ${t} 个订单`}
          onChange={(p, ps) => {
            setPage(p);
            setPageSize(ps);
          }}
        />
      </div>

      <Modal
        title="更新进度"
        open={!!nodeModal}
        onOk={() => void submitNode()}
        onCancel={() => setNodeModal(null)}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="节点名称" rules={[{ required: true, message: '请输入节点名称' }]}>
            <Input />
          </Form.Item>
        </Form>
        <div style={{ marginBottom: 8, color: '#595959' }}>当前进度状态</div>
        <Space wrap>
          {Object.entries(NODE_STATUS_LABELS).map(([value, label]) => (
            <Button
              key={value}
              type={statusValue === value ? 'primary' : 'default'}
              style={
                statusValue === value
                  ? { background: NODE_STATUS_COLORS[value], borderColor: NODE_STATUS_COLORS[value] }
                  : undefined
              }
              onClick={() => setStatusValue(value)}
            >
              {label}
            </Button>
          ))}
        </Space>
      </Modal>

      {quoteOrder && (
        <QuoteModal
          open
          onClose={() => setQuoteOrder(null)}
          customerId={quoteOrder.customerId}
          customerName={quoteOrder.customerName}
          items={quoteOrder.items.map<QuoteModalItem>((it) => ({
            materialCode: it.materialCode,
            materialName: it.materialName,
            chipModel: it.chipModel,
            brand: it.brand,
            qty: it.qty,
            unitPrice: it.unitPrice,
            priceTaxIncluded: it.priceTaxIncluded,
            taxRate: it.taxRate,
            subtotal: it.subtotal,
            remark: it.remark,
          }))}
          totalAmount={quoteOrder.totalAmount ?? 0}
          orderQty={quoteOrder.orderQty}
          deliveryDate={quoteOrder.expectedDeliveryDate}
        />
      )}
    </div>
  );
}
