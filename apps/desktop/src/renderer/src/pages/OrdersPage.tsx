import React, { useCallback, useEffect, useState } from 'react';
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
import { PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { api, errorMessage } from '../api';
import type { OrderListRow, Page } from '../models';

interface OptionItem {
  id: number;
  name: string;
  color?: string | null;
}

export function OrdersPage(): JSX.Element {
  const navigate = useNavigate();
  const [rows, setRows] = useState<OrderListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [statusId, setStatusId] = useState<number | null>(null);
  const [typeId, setTypeId] = useState<number | null>(null);
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);
  const [deliveryRange, setDeliveryRange] = useState<[string, string] | null>(null);
  const [sortField, setSortField] = useState<string>('order_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [customers, setCustomers] = useState<OptionItem[]>([]);
  const [statuses, setStatuses] = useState<OptionItem[]>([]);
  const [types, setTypes] = useState<OptionItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = (await api.orders.list({
        search: search || undefined,
        customerId,
        statusId,
        typeId,
        dateFrom: dateRange?.[0],
        dateTo: dateRange?.[1],
        deliveryFrom: deliveryRange?.[0],
        deliveryTo: deliveryRange?.[1],
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
  }, [search, customerId, statusId, typeId, dateRange, deliveryRange, sortField, sortDir, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void api.customers.options().then((r) => setCustomers(r as OptionItem[]));
    void api.statuses.list().then((r) => setStatuses(r as OptionItem[]));
    void api.dicts.list('order_type').then((r) => setTypes(r as OptionItem[]));
  }, []);

  const doDelete = async (row: OrderListRow): Promise<void> => {
    try {
      await api.orders.remove(row.id);
      void message.success('订单已删除（明细、节点、附件一并删除）');
      void load();
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  return (
    <Card
      title="订单管理"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/orders/new')}>
          新建订单
        </Button>
      }
    >
      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search
          placeholder="订单编号 / 芯片型号"
          allowClear
          style={{ width: 220 }}
          onSearch={(v) => {
            setPage(1);
            setSearch(v);
          }}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="客户"
          style={{ width: 180 }}
          options={customers.map((c) => ({ value: c.id, label: c.name }))}
          onChange={(v) => {
            setPage(1);
            setCustomerId(v ?? null);
          }}
        />
        <Select
          allowClear
          placeholder="订单状态"
          style={{ width: 120 }}
          options={statuses.map((s) => ({ value: s.id, label: s.name }))}
          onChange={(v) => {
            setPage(1);
            setStatusId(v ?? null);
          }}
        />
        <Select
          allowClear
          placeholder="订单类型"
          style={{ width: 120 }}
          options={types.map((t) => ({ value: t.id, label: t.name }))}
          onChange={(v) => {
            setPage(1);
            setTypeId(v ?? null);
          }}
        />
        <DatePicker.RangePicker
          placeholder={['订单日期从', '订单日期至']}
          onChange={(v) => {
            setPage(1);
            setDateRange(v && v[0] && v[1] ? [v[0].format('YYYY-MM-DD'), v[1].format('YYYY-MM-DD')] : null);
          }}
        />
        <DatePicker.RangePicker
          placeholder={['预计交期从', '预计交期至']}
          onChange={(v) => {
            setPage(1);
            setDeliveryRange(v && v[0] && v[1] ? [v[0].format('YYYY-MM-DD'), v[1].format('YYYY-MM-DD')] : null);
          }}
        />
      </Space>
      <Table<OrderListRow>
        rowKey="id"
        loading={loading}
        dataSource={rows}
        rowClassName={(r) => (r.daysOverdue > 0 ? 'row-overdue' : '')}
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
          { title: '订单编号', dataIndex: 'orderNo', sorter: false, render: (v: string, r) => <a onClick={() => navigate(`/orders/${r.id}`)}>{v}</a> },
          {
            title: '客户名称',
            dataIndex: 'customerName',
            render: (v: string, r) =>
              r.customerDeleted ? <span>{v} <Tag color="red">已删除</Tag></span> : v,
          },
          { title: '订单类型', dataIndex: 'typeName', width: 90 },
          {
            title: '订单状态',
            dataIndex: 'statusName',
            width: 100,
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
            width: 130,
            align: 'right',
            sorter: true,
            render: (v: number | null) => (v ?? 0).toFixed(2),
          },
          {
            title: '订单日期',
            dataIndex: 'orderDate',
            width: 110,
            sorter: true,
            render: (v: string | null) => v ?? '未填写',
          },
          { title: '预计交期', dataIndex: 'expectedDeliveryDate', width: 110, sorter: true },
          {
            title: '操作',
            width: 150,
            render: (_, r) => (
              <Space>
                <a onClick={() => navigate(`/orders/${r.id}`)}>查看</a>
                <a onClick={() => navigate(`/orders/${r.id}/edit`)}>编辑</a>
                <Popconfirm
                  title={`删除订单「${r.orderNo}」`}
                  description="删除后物料明细、进度节点、附件将一并删除，不可恢复。"
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
        onChange={(pagination, _filters, sorter) => {
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
