import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  DatePicker,
  Descriptions,
  Divider,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Timeline,
  Tooltip,
  Upload,
  message,
} from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  PaperClipOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { api, errorMessage } from '../api';
import type { NodeAttachment, NodeFollowUp, OrderDetail, OrderNode, Customer } from '../models';
import { NODE_STATUS_COLORS, NODE_STATUS_LABELS } from '../models';

interface StatusItem {
  id: number;
  name: string;
  color: string;
  isTerminal: boolean;
}

interface TypeItem {
  id: number;
  name: string;
}
interface CurrencyItem {
  id: number;
  name: string;
}

export function OrderDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const orderId = Number(id);
  const navigate = useNavigate();
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [statuses, setStatuses] = useState<StatusItem[]>([]);
  const [types, setTypes] = useState<TypeItem[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [nodeModal, setNodeModal] = useState<{ mode: 'edit' | 'create'; node: OrderNode | null } | null>(null);
  const [followModal, setFollowModal] = useState<{ nodeId: number; records: NodeFollowUp[] } | null>(null);
  const [followText, setFollowText] = useState('');
  const [attModal, setAttModal] = useState<{ nodeId: number; list: NodeAttachment[] } | null>(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = (await api.orders.get(orderId)) as OrderDetail;
      setDetail(d);
      setStatuses((await api.statuses.list()) as StatusItem[]);
      setTypes((await api.dicts.list('order_type')) as TypeItem[]);
      setCurrencies((await api.dicts.list('currency')) as CurrencyItem[]);
      const c = (await api.customers.get(d.customerId)) as Customer;
      setCustomerName(c.deletedAt ? `${c.name}（已删除客户）` : c.name);
    } catch (e) {
      void message.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!detail) {
    return <Card loading={loading} />;
  }

  const status = statuses.find((s) => s.id === detail.statusId);
  const cny = (detail.totalAmount ?? 0) * (detail.exchangeRate ?? 1);
  const today = dayjs().format('YYYY-MM-DD');
  const daysOverdue =
    status && !status.isTerminal && detail.expectedDeliveryDate && detail.expectedDeliveryDate < today
      ? dayjs(today).diff(dayjs(detail.expectedDeliveryDate), 'day')
      : 0;

  const openNodeModal = (mode: 'edit' | 'create', node: OrderNode | null): void => {
    setNodeModal({ mode, node });
    if (mode === 'edit' && node) {
      form.setFieldsValue({
        name: node.name,
        status: node.status,
        planTime: node.planTime ? dayjs(node.planTime) : null,
        actualTime: node.actualTime ? dayjs(node.actualTime) : null,
        owner: node.owner,
      });
    } else {
      form.resetFields();
    }
  };

  const submitNode = async (): Promise<void> => {
    const values = await form.validateFields();
    const payload = {
      name: values.name,
      status: values.status,
      planTime: values.planTime ? (values.planTime as dayjs.Dayjs).format('YYYY-MM-DD') : null,
      actualTime: values.actualTime ? (values.actualTime as dayjs.Dayjs).format('YYYY-MM-DD') : null,
      owner: values.owner ?? null,
    };
    try {
      if (nodeModal?.mode === 'edit' && nodeModal.node) {
        await api.nodes.update(nodeModal.node.id, payload);
      } else {
        await api.nodes.create(orderId, { name: payload.name, owner: payload.owner });
      }
      setNodeModal(null);
      void load();
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  const markDone = async (node: OrderNode): Promise<void> => {
    try {
      await api.nodes.update(node.id, { status: 'done' });
      void message.success('节点已完成');
      void load();
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  const doDeleteNode = async (node: OrderNode): Promise<void> => {
    try {
      await api.nodes.remove(node.id);
      void message.success('节点已删除');
      void load();
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  const moveNode = async (node: OrderNode, delta: number): Promise<void> => {
    const sorted = [...detail.nodes].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((n) => n.id === node.id);
    const target = idx + delta;
    if (target < 0 || target >= sorted.length) return;
    [sorted[idx], sorted[target]] = [sorted[target], sorted[idx]];
    try {
      await api.nodes.reorder(orderId, sorted.map((n) => n.id));
      void load();
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  const openFollow = async (node: OrderNode): Promise<void> => {
    const records = (await api.nodes.listFollowUps(node.id)) as NodeFollowUp[];
    setFollowText('');
    setFollowModal({ nodeId: node.id, records });
  };

  const addFollow = async (): Promise<void> => {
    if (!followText.trim()) return;
    try {
      await api.nodes.addFollowUp(followModal!.nodeId, followText);
      const records = (await api.nodes.listFollowUps(followModal!.nodeId)) as NodeFollowUp[];
      setFollowModal({ nodeId: followModal!.nodeId, records });
      setFollowText('');
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  const openAtt = async (node: OrderNode): Promise<void> => {
    const list = (await api.nodes.listAttachments(node.id)) as NodeAttachment[];
    setAttModal({ nodeId: node.id, list });
  };

  const addAttachment = async (nodeId: number): Promise<void> => {
    try {
      await api.attachments.pickAndAdd(nodeId);
      const list = (await api.nodes.listAttachments(nodeId)) as NodeAttachment[];
      setAttModal({ nodeId, list });
      void load();
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  const deleteAttachment = async (att: NodeAttachment): Promise<void> => {
    try {
      await api.nodes.deleteAttachment(att.id);
      const list = (await api.nodes.listAttachments(attModal!.nodeId)) as NodeAttachment[];
      setAttModal({ nodeId: attModal!.nodeId, list });
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  const doDeleteOrder = async (): Promise<void> => {
    try {
      await api.orders.remove(orderId);
      void message.success('订单已删除');
      navigate('/orders');
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  const sortedNodes = [...detail.nodes].sort((a, b) => b.sortOrder - a.sortOrder);

  return (
    <Card
      loading={loading}
      title={
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/orders')} />
          <span>{detail.orderNo}</span>
          {status && <Tag color={status.color}>{status.name}</Tag>}
          {daysOverdue > 0 && <Tag color="red">逾期 {daysOverdue} 天</Tag>}
          {detail.isKey && <Tag color="gold">重点跟进</Tag>}
        </Space>
      }
      extra={
        <Space>
          <Button icon={<EditOutlined />} onClick={() => navigate(`/orders/${detail.id}/edit`)}>
            编辑订单
          </Button>
          <Button
            onClick={() => void api.exportOrderDetail(detail.id).then((p) => (p ? void message.success(`已导出：${p}`) : undefined))}
          >
            导出订单详情
          </Button>
          <Popconfirm
            title={`删除订单「${detail.orderNo}」`}
            description="删除后物料明细、进度节点、附件将一并删除，不可恢复。"
            okText="确认删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => void doDeleteOrder()}
          >
            <Button danger>删除订单</Button>
          </Popconfirm>
        </Space>
      }
    >
      <Descriptions bordered size="small" column={4} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="客户">{customerName}</Descriptions.Item>
        <Descriptions.Item label="订单类型">{types.find((t) => t.id === detail.typeId)?.name ?? '-'}</Descriptions.Item>
        <Descriptions.Item label="订单日期">{detail.orderDate}</Descriptions.Item>
        <Descriptions.Item label="预计交货日期">{detail.expectedDeliveryDate ?? '-'}</Descriptions.Item>
        <Descriptions.Item label="实际交货日期">{detail.actualDeliveryDate ?? '-'}</Descriptions.Item>
        <Descriptions.Item label="币种">{currencies.find((c) => c.id === detail.currencyId)?.name ?? '-'}</Descriptions.Item>
        <Descriptions.Item label="汇率快照">{detail.exchangeRate ?? '-'}</Descriptions.Item>
        <Descriptions.Item label="负责人">{detail.owner ?? '-'}</Descriptions.Item>
        <Descriptions.Item label="订单总金额">
          {detail.totalAmount ?? 0}
          {detail.amountManual && <Tag style={{ marginLeft: 8 }}>已手改</Tag>}
          <Tooltip title={`折人民币 ${cny.toFixed(2)}`}>
            <Tag style={{ marginLeft: 8 }}>≈ ¥{cny.toFixed(2)}</Tag>
          </Tooltip>
        </Descriptions.Item>
        <Descriptions.Item label="备注" span={3}>
          {detail.remark ?? '-'}
        </Descriptions.Item>
      </Descriptions>

      <Divider orientation="left">物料明细</Divider>
      <Table
        rowKey="id"
        size="small"
        pagination={false}
        dataSource={detail.items}
        columns={[
          { title: '芯片型号', dataIndex: 'chipModel' },
          { title: '品牌', dataIndex: 'brand', width: 100 },
          { title: '封装规格', dataIndex: 'packageSpec', width: 120 },
          { title: '数量', dataIndex: 'qty', width: 80, align: 'right' as const },
          { title: '单价', dataIndex: 'unitPrice', width: 100, align: 'right' as const },
          { title: '小计', dataIndex: 'subtotal', width: 100, align: 'right' as const },
          { title: '客户料号', dataIndex: 'customerPn', width: 120 },
        ]}
      />

      <Divider orientation="left">
        进度时间线（{detail.nodes.length} 个节点）
        <Button size="small" type="link" onClick={() => openNodeModal('create', null)}>
          新增节点
        </Button>
      </Divider>
      <Timeline
        items={sortedNodes.map((n) => ({
          color: NODE_STATUS_COLORS[n.status],
          children: (
            <Card size="small" title={
              <Space>
                <span>{n.name}</span>
                <Tag color={NODE_STATUS_COLORS[n.status]}>{NODE_STATUS_LABELS[n.status]}</Tag>
                {!n.planTime && n.status !== 'done' && <Tag>未设计划</Tag>}
              </Space>
            } extra={
              <Space>
                {n.status !== 'done' && (
                  <Button size="small" type="primary" ghost icon={<CheckCircleOutlined />} onClick={() => void markDone(n)}>
                    标记完成
                  </Button>
                )}
                <Button size="small" onClick={() => moveNode(n, -1)} disabled={n === sortedNodes[sortedNodes.length - 1]}>上移</Button>
                <Button size="small" onClick={() => moveNode(n, 1)} disabled={n === sortedNodes[0]}>下移</Button>
                <Button size="small" icon={<EditOutlined />} onClick={() => openNodeModal('edit', n)} />
                <Popconfirm title="删除此节点（附件与跟进记录一并删除）" onConfirm={() => void doDeleteNode(n)}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            }>
              <Descriptions size="small" column={3}>
                <Descriptions.Item label="计划完成">{n.planTime ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="实际完成">{n.actualTime ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="负责人">{n.owner ?? '-'}</Descriptions.Item>
              </Descriptions>
              <Space>
                <Button size="small" onClick={() => void openFollow(n)}>跟进记录</Button>
                <Button size="small" icon={<PaperClipOutlined />} onClick={() => void openAtt(n)}>
                  附件
                </Button>
              </Space>
            </Card>
          ),
        }))}
      />

      {/* 节点编辑 */}
      <Modal
        title={nodeModal?.mode === 'edit' ? '编辑节点' : '新增节点'}
        open={!!nodeModal}
        onOk={() => void submitNode()}
        onCancel={() => setNodeModal(null)}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="节点名称" rules={[{ required: true, message: '请输入节点名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="status" label="节点状态">
            <Select
              options={Object.entries(NODE_STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            />
          </Form.Item>
          <Form.Item name="planTime" label="计划完成时间">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="actualTime" label="实际完成时间">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="owner" label="负责人">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      {/* 跟进记录 */}
      <Modal
        title="跟进记录"
        open={!!followModal}
        onCancel={() => setFollowModal(null)}
        footer={null}
      >
        <List
          size="small"
          dataSource={followModal?.records ?? []}
          locale={{ emptyText: '暂无跟进记录' }}
          renderItem={(r) => (
            <List.Item>
              <Space direction="vertical" size={0}>
                <span>{r.content}</span>
                <span style={{ color: '#999', fontSize: 12 }}>{r.createdAt}</span>
              </Space>
            </List.Item>
          )}
        />
        <Space.Compact style={{ width: '100%', marginTop: 12 }}>
          <Input
            placeholder="输入跟进内容"
            value={followText}
            onChange={(e) => setFollowText(e.target.value)}
            onPressEnter={() => void addFollow()}
          />
          <Button type="primary" onClick={() => void addFollow()}>
            追加
          </Button>
        </Space.Compact>
      </Modal>

      {/* 附件 */}
      <Modal
        title="附件"
        open={!!attModal}
        onCancel={() => setAttModal(null)}
        footer={
          <Button type="primary" onClick={() => void addAttachment(attModal!.nodeId)}>
            添加附件
          </Button>
        }
      >
        <List
          size="small"
          dataSource={attModal?.list ?? []}
          locale={{ emptyText: '暂无附件' }}
          renderItem={(a) => (
            <List.Item
              actions={[
                <a key="open" onClick={() => void api.attachments.open(a.storedPath)}>打开</a>,
                <a key="folder" onClick={() => void api.attachments.openFolder(a.storedPath)}>所在目录</a>,
                <Popconfirm key="del" title="删除附件" onConfirm={() => void deleteAttachment(a)}>
                  <a style={{ color: '#ff4d4f' }}>删除</a>
                </Popconfirm>,
              ]}
            >
              {a.originalName}（{Math.round(a.size / 1024)} KB）
            </List.Item>
          )}
        />
      </Modal>
    </Card>
  );
}
