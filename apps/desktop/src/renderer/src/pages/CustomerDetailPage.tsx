import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  message,
} from 'antd';
import { ArrowLeftOutlined, PlusOutlined, WechatOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import type { Customer, OrderListRow, Page, WechatGroup, WechatMember } from '../models';

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
  const [groups, setGroups] = useState<WechatGroup[]>([]);
  const [members, setMembers] = useState<Record<number, WechatMember[]>>({});
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [groupModal, setGroupModal] = useState<{ mode: 'create' | 'edit'; group: WechatGroup | null } | null>(null);
  const [memberModal, setMemberModal] = useState<{ groupId: number; member: WechatMember | null } | null>(null);
  const [form] = Form.useForm();
  const [groupForm] = Form.useForm();
  const [memberForm] = Form.useForm();

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
      const g = (await api.wechat.listGroups(customerId)) as WechatGroup[];
      setGroups(g);
      const map: Record<number, WechatMember[]> = {};
      for (const grp of g) {
        map[grp.id] = (await api.wechat.listMembers(grp.id)) as WechatMember[];
      }
      setMembers(map);
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
    { title: '订单日期', dataIndex: 'orderDate', width: 110, render: (v: string | null) => v ?? '未填写' },
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

  const submitGroup = async (): Promise<void> => {
    const values = await groupForm.validateFields();
    try {
      if (groupModal?.mode === 'edit' && groupModal.group) {
        await api.wechat.updateGroup(groupModal.group.id, values);
      } else {
        await api.wechat.createGroup(customerId, values);
      }
      setGroupModal(null);
      void load();
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  const deleteGroup = async (group: WechatGroup): Promise<void> => {
    try {
      await api.wechat.deleteGroup(group.id);
      void message.success('微信群已删除');
      void load();
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  const submitMember = async (): Promise<void> => {
    const values = await memberForm.validateFields();
    try {
      if (memberModal?.member) {
        await api.wechat.updateMember(memberModal.member.id, values);
      } else if (memberModal) {
        await api.wechat.createMember(memberModal.groupId, values);
      }
      setMemberModal(null);
      void load();
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  const deleteMember = async (m: WechatMember): Promise<void> => {
    try {
      await api.wechat.deleteMember(m.id);
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
        <Descriptions.Item label="地址" span={2}>
          {customer.address ?? '-'}
        </Descriptions.Item>
        <Descriptions.Item label="重点客户">{customer.isKey ? '是' : '否'}</Descriptions.Item>
        <Descriptions.Item label="备注" span={3}>
          {customer.remark ?? '-'}
        </Descriptions.Item>
      </Descriptions>

      <Tabs
        items={[
          { key: 'all', label: `全部订单 (${orders.length})`, children: <Table rowKey="id" size="small" dataSource={orders} columns={columns} loading={loading} pagination={false} /> },
          {
            key: 'active',
            label: `跟进中订单 (${tabOrders((o) => !completedIds.has(o.statusId ?? -1) && !cancelledIds.has(o.statusId ?? -1)).length})`,
            children: (
              <Table rowKey="id" size="small" dataSource={tabOrders((o) => !completedIds.has(o.statusId ?? -1) && !cancelledIds.has(o.statusId ?? -1))} columns={columns} loading={loading} pagination={false} />
            ),
          },
          {
            key: 'completed',
            label: `已完结订单 (${tabOrders((o) => completedIds.has(o.statusId ?? -1)).length})`,
            children: <Table rowKey="id" size="small" dataSource={tabOrders((o) => completedIds.has(o.statusId ?? -1))} columns={columns} loading={loading} pagination={false} />,
          },
          {
            key: 'cancelled',
            label: `已取消订单 (${tabOrders((o) => cancelledIds.has(o.statusId ?? -1)).length})`,
            children: <Table rowKey="id" size="small" dataSource={tabOrders((o) => cancelledIds.has(o.statusId ?? -1))} columns={columns} loading={loading} pagination={false} />,
          },
        ]}
      />

      <Card
        size="small"
        title={
          <Space>
            <WechatOutlined />
            沟通微信群（{groups.length} 个）
          </Space>
        }
        extra={
          <Button
            size="small"
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              groupForm.resetFields();
              setGroupModal({ mode: 'create', group: null });
            }}
          >
            新增微信群
          </Button>
        }
        style={{ marginTop: 16 }}
      >
        {groups.length === 0 && <div style={{ color: '#999' }}>还没有微信群，点击右上角「新增微信群」添加，例如：商务交流群、研发交流群。</div>}
        {groups.map((g) => (
          <Card
            key={g.id}
            type="inner"
            size="small"
            style={{ marginBottom: 12 }}
            title={
              <Space>
                <span>{g.name}</span>
                {g.remark && <Tag>{g.remark}</Tag>}
              </Space>
            }
            extra={
              <Space>
                <Button
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    memberForm.resetFields();
                    setMemberModal({ groupId: g.id, member: null });
                  }}
                >
                  添加成员
                </Button>
                <Button
                  size="small"
                  onClick={() => {
                    groupForm.setFieldsValue({ name: g.name, remark: g.remark });
                    setGroupModal({ mode: 'edit', group: g });
                  }}
                >
                  编辑群
                </Button>
                <Popconfirm title="删除该微信群（群成员一并删除）" onConfirm={() => void deleteGroup(g)}>
                  <Button size="small" danger>
                    删除群
                  </Button>
                </Popconfirm>
              </Space>
            }
          >
            <Table<WechatMember>
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={members[g.id] ?? []}
              locale={{ emptyText: '暂无成员' }}
              columns={[
                { title: '微信号', dataIndex: 'wechatId', width: 200 },
                { title: '真实姓名', dataIndex: 'realName', width: 140, render: (v: string | null) => v ?? '-' },
                { title: '岗位', dataIndex: 'position', width: 140, render: (v: string | null) => v ?? '-' },
                { title: '备注', dataIndex: 'remark', render: (v: string | null) => v ?? '-' },
                {
                  title: '操作',
                  width: 120,
                  render: (_, m) => (
                    <Space>
                      <a
                        onClick={() => {
                          memberForm.setFieldsValue({
                            wechatId: m.wechatId,
                            realName: m.realName,
                            position: m.position,
                            remark: m.remark,
                          });
                          setMemberModal({ groupId: g.id, member: m });
                        }}
                      >
                        编辑
                      </a>
                      <Popconfirm title="删除该成员" onConfirm={() => void deleteMember(m)}>
                        <a style={{ color: '#ff4d4f' }}>删除</a>
                      </Popconfirm>
                    </Space>
                  ),
                },
              ]}
            />
          </Card>
        ))}
      </Card>

      <Modal title="编辑客户" open={editing} onOk={() => void submit()} onCancel={() => setEditing(false)} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="客户全称" rules={[{ required: true, message: '请输入客户全称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="shortName" label="客户简称">
            <Input />
          </Form.Item>
          <Form.Item name="typeId" label="客户类型">
            <Select allowClear options={types.map((t) => ({ value: t.id, label: t.name }))} />
          </Form.Item>
          <Form.Item name="address" label="地址">
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

      <Modal
        title={groupModal?.mode === 'edit' ? '编辑微信群' : '新增微信群'}
        open={!!groupModal}
        onOk={() => void submitGroup()}
        onCancel={() => setGroupModal(null)}
        destroyOnClose
      >
        <Form form={groupForm} layout="vertical">
          <Form.Item name="name" label="群名称" rules={[{ required: true, message: '请输入群名称' }]} extra="例如：商务交流群、研发交流群">
            <Input />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={memberModal?.member ? '编辑群成员' : '添加群成员'}
        open={!!memberModal}
        onOk={() => void submitMember()}
        onCancel={() => setMemberModal(null)}
        destroyOnClose
      >
        <Form form={memberForm} layout="vertical">
          <Form.Item name="wechatId" label="群内微信号 / ID" rules={[{ required: true, message: '请输入微信号' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="realName" label="真实姓名">
            <Input />
          </Form.Item>
          <Form.Item name="position" label="岗位">
            <Input placeholder="例如：采购经理、硬件工程师" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
