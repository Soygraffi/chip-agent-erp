import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Descriptions,
  Modal,
  Space,
  Table,
  Tabs,
  Tag,
  message,
  Form,
  Input,
  Select,
  Switch,
} from 'antd';
import { ArrowLeftOutlined, PlusOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import type { Customer, OrderListRow, Page } from '../models';

interface StatusItem {
  id: number;
  name: string;
  color: string;
  isTerminal: boolean;
  terminalResult: string | null;
}

interface TypeItem {
  id: number;
  name: string;
}

function statusTerminalSet(statuses: StatusItem[], terminalResult: string | null): Set<number> {
  return new Set(
    statuses.filter((s) => s.isTerminal && s.terminalResult === terminalResult).map((s) => s.id),
  );
}

export function CustomerDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const customerId = Number(id);
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [types, setTypes] = useState<TypeItem[]>([]);
  const [statuses, setStatuses] = useState<StatusItem[]>([]);
  const [orders, setOrders] = useState<OrderListRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const c = (await api.customers.get(customerId)) as Customer;
      setCustomer(c);
      const s = (await api.statuses.list()) as StatusItem[];
      setStatuses(s);
      const t = (await api.dicts.list('customer_type')) as TypeItem[];
      setTypes(t);
      const o = (await api.orders.list({ customerId, page: 1, pageSize: 1000 })) as Page<OrderListRow>;
      setOrders(o.rows);
    } catch (e) {
      void message.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const completedIds = useMemo(() => statusTerminalSet(statuses, 'completed'), [statuses]);
  const cancelledIds = useMemo(() => statusTerminalSet(statuses, 'cancelled'), [statuses]);

  const tabOrders = (fn: (o: OrderListRow) => boolean): OrderListRow[] => orders.filter(fn);

  const columns = [
    { title: '订单编号', dataIndex: 'orderNo', render: (v: string, r: OrderListRow) => <a onClick={() => navigate(`/orders/${r.id}`)}>{v}</a> },
    { title: '订单状态', dataIndex: 'statusName', render: (v: string, r: OrderListRow) => <Tag color={r.statusColor}>{v}</Tag> },
    { title: '订单类型', dataIndex: 'typeName', width: 100 },
    { title: '订单金额', dataIndex: 'totalAmount', width: 110, align: 'right' as const },
    { title: '订单日期', dataIndex: 'orderDate', width: 110 },
    { title: '预计交期', dataIndex: 'expectedDeliveryDate', width: 110 },
    {
      title: '逾期',
      width: 90,
      render: (_: unknown, r: OrderListRow) =>
        r.daysOverdue > 0 ? <Tag color="red">逾期 {r.daysOverdue} 天</Tag> : null,
    },
  ];

  const submit = async (): Promise<void> => {
    const values = await form.validateFields();
    try {
      await api.customers.update(customerId, values);
      void message.success('客户已保存');
      setEditing(false);
      void load();
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  if (!customer) {
    return <Card loading={loading} />;
  }

  return (
    <Card
      title={
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/customers')} />
          <span>{customer.name}</span>
          {customer.deletedAt && <Tag color="red">已删除客户</Tag>}
        </Space>
      }
      extra={
        <Space>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate(`/orders/new?customerId=${customer.id}`)}
          >
            为该客户新建订单
          </Button>
          <Button
            onClick={() => {
              form.setFieldsValue(customer);
              setEditing(true);
            }}
          >
            编辑
          </Button>
        </Space>
      }
    >
      <Descriptions bordered size="small" column={3} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="客户全称">{customer.name}</Descriptions.Item>
        <Descriptions.Item label="客户简称">{customer.shortName ?? '-'}</Descriptions.Item>
        <Descriptions.Item label="客户类型">
          {types.find((t) => t.id === customer.typeId)?.name ?? '-'}
        </Descriptions.Item>
        <Descriptions.Item label="联系人">{customer.contact}</Descriptions.Item>
        <Descriptions.Item label="联系电话">{customer.phone}</Descriptions.Item>
        <Descriptions.Item label="邮箱">{customer.email ?? '-'}</Descriptions.Item>
        <Descriptions.Item label="地址" span={2}>
          {customer.address ?? '-'}
        </Descriptions.Item>
        <Descriptions.Item label="重点客户">{customer.isKey ? '是' : '否'}</Descriptions.Item>
        <Descriptions.Item label="负责业务员">{customer.salesOwner ?? '-'}</Descriptions.Item>
        <Descriptions.Item label="合作起始日期">{customer.cooperationStart ?? '-'}</Descriptions.Item>
        <Descriptions.Item label="备注" span={2}>
          {customer.remark ?? '-'}
        </Descriptions.Item>
      </Descriptions>

      <Tabs
        items={[
          { key: 'all', label: `全部订单 (${orders.length})`, children: <Table rowKey="id" size="small" dataSource={orders} columns={columns} loading={loading} pagination={false} /> },
          {
            key: 'active',
            label: `跟进中订单 (${tabOrders((o) => !completedIds.has(o.statusId) && !cancelledIds.has(o.statusId)).length})`,
            children: (
              <Table rowKey="id" size="small" dataSource={tabOrders((o) => !completedIds.has(o.statusId) && !cancelledIds.has(o.statusId))} columns={columns} loading={loading} pagination={false} />
            ),
          },
          {
            key: 'completed',
            label: `已完结订单 (${tabOrders((o) => completedIds.has(o.statusId)).length})`,
            children: <Table rowKey="id" size="small" dataSource={tabOrders((o) => completedIds.has(o.statusId))} columns={columns} loading={loading} pagination={false} />,
          },
          {
            key: 'cancelled',
            label: `已取消订单 (${tabOrders((o) => cancelledIds.has(o.statusId)).length})`,
            children: <Table rowKey="id" size="small" dataSource={tabOrders((o) => cancelledIds.has(o.statusId))} columns={columns} loading={loading} pagination={false} />,
          },
        ]}
      />

      <Modal title="编辑客户" open={editing} onOk={() => void submit()} onCancel={() => setEditing(false)} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="客户全称" rules={[{ required: true, message: '请输入客户全称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="shortName" label="客户简称">
            <Input />
          </Form.Item>
          <Form.Item name="typeId" label="客户类型" rules={[{ required: true, message: '请选择客户类型' }]}>
            <Select options={types.map((t) => ({ value: t.id, label: t.name }))} />
          </Form.Item>
          <Form.Item name="contact" label="联系人" rules={[{ required: true, message: '请输入联系人' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="联系电话" rules={[{ required: true, message: '请输入联系电话' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="邮箱">
            <Input />
          </Form.Item>
          <Form.Item name="address" label="地址">
            <Input />
          </Form.Item>
          <Form.Item name="salesOwner" label="负责业务员">
            <Input />
          </Form.Item>
          <Form.Item name="cooperationStart" label="合作起始日期">
            <Input />
          </Form.Item>
          <Form.Item name="isKey" label="重点客户" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
