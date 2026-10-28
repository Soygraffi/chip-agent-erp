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
  Steps,
  Table,
  Tag,
  message,
} from 'antd';
import { EditOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { api, errorMessage } from '../api';
import type { OrderItem, OrderNode, OrderWithDetails, Page } from '../models';
import { NODE_STATUS_COLORS, NODE_STATUS_LABELS } from '../models';

interface OptionItem {
  id: number;
  name: string;
}

interface OrdersBoardProps {
  showFilters?: boolean;
  pageSize?: number;
  /** 只显示重点跟进订单 */
  onlyKey?: boolean;
}

const ITEM_COLUMNS = [
  { title: '物料名称', dataIndex: 'materialName', width: 130, render: (v: string | null) => v ?? '-' },
  { title: '料号规格', dataIndex: 'chipModel', width: 150 },
  { title: '品牌', dataIndex: 'brand', width: 100, render: (v: string | null) => v ?? '-' },
  { title: '数量', dataIndex: 'qty', width: 80, align: 'right' as const },
  {
    title: '含税金额',
    dataIndex: 'subtotal',
    width: 110,
    align: 'right' as const,
    render: (v: number | null) => (v ?? 0).toFixed(2),
  },
];

export function OrdersBoard({ showFilters = true, pageSize: initialPageSize = 10, onlyKey = false }: OrdersBoardProps): JSX.Element {
  const navigate = useNavigate();
  const [rows, setRows] = useState<OrderWithDetails[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusId, setStatusId] = useState<number | null>(null);
  const [typeId, setTypeId] = useState<number | null>(null);
  const [range, setRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [sortField, setSortField] = useState<'order_date' | 'total_amount' | 'expected_delivery_date'>('order_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [statuses, setStatuses] = useState<OptionItem[]>([]);
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
        statusId,
        typeId,
        dateFrom: range?.[0]?.format('YYYY-MM-DD') ?? undefined,
        dateTo: range?.[1]?.format('YYYY-MM-DD') ?? undefined,
        onlyOverdue,
        onlyKey,
        sortField,
        sortDir,
        page,
        pageSize,
      })) as Page<OrderWithDetails>;
      setRows(r.rows);
      setTotal(r.total);
    } catch (e) {
      void message.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [search, statusId, typeId, range, onlyOverdue, onlyKey, sortField, sortDir, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void api.statuses.list().then((r) => setStatuses(r as OptionItem[]));
    void api.dicts.list('order_type').then((r) => setTypes(r as OptionItem[]));
  }, []);

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

  const stepStatus = (n: OrderNode): 'wait' | 'process' | 'finish' | 'error' => {
    if (n.status === 'done') return 'finish';
    if (n.status === 'delayed') return 'error';
    if (n.status === 'in_progress') return 'process';
    return 'wait';
  };

  /** 订单状态与时间轴联动：取当前（第一个未完成）节点的状态；全部完成则为已完结 */
  const deriveStatus = (nodes: OrderNode[]): { label: string; color: string } => {
    if (nodes.length === 0) return { label: '未填写', color: '#BFBFBF' };
    const sorted = [...nodes].sort((a, b) => a.sortOrder - b.sortOrder);
    if (sorted.every((n) => n.status === 'done')) return { label: '已完结', color: '#52C41A' };
    const current = sorted.find((n) => n.status !== 'done')!;
    return {
      label: `${current.name} · ${NODE_STATUS_LABELS[current.status]}`,
      color: NODE_STATUS_COLORS[current.status],
    };
  };

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
            placeholder="订单状态"
            style={{ width: 125 }}
            options={statuses.map((s) => ({ value: s.id, label: s.name }))}
            onChange={(v) => {
              setPage(1);
              setStatusId(v ?? null);
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
          <Select
            value={`${sortField}:${sortDir}`}
            style={{ width: 170 }}
            options={[
              { value: 'order_date:desc', label: '按日期 ↓' },
              { value: 'order_date:asc', label: '按日期 ↑' },
              { value: 'total_amount:desc', label: '按金额 ↓' },
              { value: 'total_amount:asc', label: '按金额 ↑' },
              { value: 'expected_delivery_date:asc', label: '按交期 ↑' },
              { value: 'expected_delivery_date:desc', label: '按交期 ↓' },
            ]}
            onChange={(v) => {
              const [f, d] = (v as string).split(':');
              setSortField(f as 'order_date' | 'total_amount' | 'expected_delivery_date');
              setSortDir(d as 'asc' | 'desc');
            }}
          />
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>
            刷新
          </Button>
        </Space>
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
                {o.daysOverdue > 0 && <Tag color="red">逾期 {o.daysOverdue} 天</Tag>}
                {o.isKey && <Tag color="gold">重点</Tag>}
                <Tag>{o.typeName ?? '未分类'}</Tag>
              </Space>
            }
            extra={
              <Space>
                <span style={{ color: '#666' }}>金额：<strong>{(o.totalAmount ?? 0).toFixed(2)}</strong></span>
                <span style={{ color: '#999', fontSize: 12 }}>日期：{o.orderDate ?? '未填写'}</span>
                <span style={{ color: '#999', fontSize: 12 }}>交期：{o.expectedDeliveryDate ?? '未填写'}</span>
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
            <div style={{ overflowX: 'auto', marginBottom: 8 }}>
              <Steps
                size="small"
                current={Math.max(0, o.nodes.findIndex((n) => n.status !== 'done'))}
                onChange={(idx) => openNode(o.nodes[idx])}
                style={{ minWidth: Math.max(640, o.nodes.length * 110) }}
                items={[...o.nodes]
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((n) => ({
                    title: n.name,
                    status: stepStatus(n),
                    description: <Tag color={NODE_STATUS_COLORS[n.status]}>{NODE_STATUS_LABELS[n.status]}</Tag>,
                  }))}
              />
            </div>
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
    </div>
  );
}
