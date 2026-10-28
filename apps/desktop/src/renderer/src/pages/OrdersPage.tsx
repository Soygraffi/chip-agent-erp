import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  DatePicker,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  message,
} from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { api, errorMessage } from '../api';
import type { OrderItem, OrderListRow, Page } from '../models';

interface OptionItem {
  id: number;
  name: string;
}

export function OrdersPage(): JSX.Element {
  const navigate = useNavigate();
  const [rows, setRows] = useState<OrderListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusId, setStatusId] = useState<number | null>(null);
  const [typeId, setTypeId] = useState<number | null>(null);
  const [range, setRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [onlyKey, setOnlyKey] = useState(false);
  const [sortField, setSortField] = useState('order_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [statuses, setStatuses] = useState<OptionItem[]>([]);
  const [types, setTypes] = useState<OptionItem[]>([]);
  const [itemsCache, setItemsCache] = useState<Record<number, OrderItem[]>>({});
  const [expandedKeys, setExpandedKeys] = useState<number[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = (await api.orders.list({
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
      })) as Page<OrderListRow>;
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

  const loadItems = async (orderId: number): Promise<void> => {
    if (itemsCache[orderId]) return;
    try {
      const items = (await api.orders.items(orderId)) as OrderItem[];
      setItemsCache((prev) => ({ ...prev, [orderId]: items }));
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  const itemColumns = useMemo(
    () => [
      { title: '物料编码', dataIndex: 'materialCode', width: 130, render: (v: string | null) => v ?? '-' },
      { title: '物料名称', dataIndex: 'materialName', width: 130, render: (v: string | null) => v ?? '-' },
      { title: '料号规格', dataIndex: 'chipModel', width: 150 },
      { title: '品牌', dataIndex: 'brand', width: 100, render: (v: string | null) => v ?? '-' },
      { title: '数量', dataIndex: 'qty', width: 80, align: 'right' as const },
      {
        title: '进货价',
        dataIndex: 'purchasePrice',
        width: 100,
        align: 'right' as const,
        render: (v: number | null) => (v == null ? '-' : v.toFixed(2)),
      },
      {
        title: '出货价',
        dataIndex: 'unitPrice',
        width: 100,
        align: 'right' as const,
        render: (v: number | null) => (v == null ? '-' : v.toFixed(2)),
      },
      {
        title: '含税金额',
        dataIndex: 'subtotal',
        width: 110,
        align: 'right' as const,
        render: (v: number | null) => (v ?? 0).toFixed(2),
      },
    ],
    [],
  );

  const doDelete = async (row: OrderListRow): Promise<void> => {
    try {
      await api.orders.remove(row.id);
      void message.success('订单已删除');
      void load();
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  return (
    <Card
      title="订单管理"
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/orders/new')}>
            新建订单
          </Button>
        </Space>
      }
    >
      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search
          placeholder="搜索订单编号 / 芯片型号"
          allowClear
          style={{ width: 220 }}
          onSearch={(v) => {
            setPage(1);
            setSearch(v);
          }}
        />
        <Select
          allowClear
          placeholder="订单状态"
          style={{ width: 130 }}
          options={statuses.map((s) => ({ value: s.id, label: s.name }))}
          onChange={(v) => {
            setPage(1);
            setStatusId(v ?? null);
          }}
        />
        <Select
          allowClear
          placeholder="订单类型"
          style={{ width: 130 }}
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
          style={{ width: 150 }}
          options={[
            { value: 'overdue', label: '仅看逾期' },
            { value: 'key', label: '仅看重点' },
          ]}
          onChange={(v) => {
            setPage(1);
            setOnlyOverdue(v === 'overdue');
            setOnlyKey(v === 'key');
          }}
        />
      </Space>

      <Table<OrderListRow>
        rowKey="id"
        loading={loading}
        dataSource={rows}
        rowClassName={(r) => (r.daysOverdue > 0 ? 'row-overdue' : '')}
        expandable={{
          expandedRowKeys: expandedKeys,
          onExpand: (expanded, record) => {
            setExpandedKeys((prev) => (expanded ? [...prev, record.id] : prev.filter((k) => k !== record.id)));
            if (expanded) void loadItems(record.id);
          },
          expandedRowRender: (record) => (
            <Table<OrderItem>
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={itemsCache[record.id] ?? []}
              locale={{ emptyText: '该订单暂无物料明细' }}
              columns={itemColumns}
            />
          ),
        }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
        columns={[
          {
            title: '客户名称',
            dataIndex: 'customerName',
            render: (v: string, r) =>
              r.customerDeleted ? (
                <span>
                  {v} <Tag color="red">已删除</Tag>
                </span>
              ) : (
                v
              ),
          },
          { title: '订单类型', dataIndex: 'typeName', width: 90, render: (v: string | null) => v ?? '未填写' },
          {
            title: '订单状态',
            dataIndex: 'statusName',
            width: 120,
            render: (v: string, r) => (
              <Space size={4}>
                <Tag color={r.statusColor}>{v}</Tag>
                {r.daysOverdue > 0 && <Tag color="red">逾期{r.daysOverdue}天</Tag>}
              </Space>
            ),
          },
          {
            title: '订单金额',
            dataIndex: 'totalAmount',
            width: 120,
            align: 'right' as const,
            render: (v: number | null) => (v ?? 0).toFixed(2),
          },
          {
            title: '订单日期',
            dataIndex: 'orderDate',
            width: 110,
            render: (v: string | null) => v ?? '未填写',
          },
          { title: '预计交期', dataIndex: 'expectedDeliveryDate', width: 110, render: (v: string | null) => v ?? '未填写' },
          {
            title: '操作',
            width: 160,
            render: (_, r) => (
              <Space>
                <a onClick={() => navigate(`/orders/${r.id}`)}>详情</a>
                <a onClick={() => navigate(`/orders/${r.id}/edit`)}>编辑</a>
                <Popconfirm
                  title={`删除订单「${r.orderNo}」`}
                  description="删除后物料明细、进度节点、订单文档、附件将一并删除，不可恢复。"
                  okText="确认删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => void doDelete(r)}
                >
                  <a style={{ color: '#ff4d4f' }}>删除</a>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
        onChange={(_pagination, _filters, sorter) => {
          const s = Array.isArray(sorter) ? sorter[0] : sorter;
          if (s && s.order) {
            const map: Record<string, string> = {
              totalAmount: 'total_amount',
              orderDate: 'order_date',
              expectedDeliveryDate: 'expected_delivery_date',
            };
            setSortField(map[s.columnKey as string] ?? 'order_date');
            setSortDir(s.order === 'ascend' ? 'asc' : 'desc');
          }
        }}
      />
    </Card>
  );
}
