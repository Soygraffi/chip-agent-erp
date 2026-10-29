import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
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
  message,
} from 'antd';
import {
  ArrowLeftOutlined,
  EditOutlined,
  FileAddOutlined,
  FileWordOutlined,
  PaperClipOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { api, errorMessage } from '../api';
import type { Customer, OrderAttachment, OrderDetail, OrderNode } from '../models';
import { NODE_STATUS_COLORS, NODE_STATUS_LABELS } from '../models';
import { NodeStepper } from '../components/NodeStepper';
import { QuoteModal } from '../components/QuoteModal';
import type { QuoteModalItem } from '../components/QuoteModal';

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

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function OrderDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const orderId = Number(id);
  const navigate = useNavigate();
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [statuses, setStatuses] = useState<StatusItem[]>([]);
  const [types, setTypes] = useState<TypeItem[]>([]);
  const [docs, setDocs] = useState<OrderAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [nodeModal, setNodeModal] = useState<{ mode: 'edit' | 'create'; node: OrderNode | null } | null>(null);
  const [statusValue, setStatusValue] = useState<string>('pending');
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = (await api.orders.get(orderId)) as OrderDetail;
      setDetail(d);
      setStatuses((await api.statuses.list()) as StatusItem[]);
      setTypes((await api.dicts.list('order_type')) as TypeItem[]);
      const c = (await api.customers.get(d.customerId)) as Customer;
      setCustomerName(c.deletedAt ? `${c.name}（已删除客户）` : c.name);
      setDocs((await api.orderDocs.list(orderId)) as OrderAttachment[]);
    } catch (e) {
      void message.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  // 注意：所有 Hook 必须在提前 return 之前调用，否则 Hook 数量变化会导致整页崩溃（V1.6.1 修复）
  useEffect(() => {
    if (!nodeModal) return;
    if (nodeModal.mode === 'edit' && nodeModal.node) {
      form.setFieldsValue({ name: nodeModal.node.name });
      setStatusValue(nodeModal.node.status);
    } else {
      form.resetFields();
      setStatusValue('pending');
    }
  }, [nodeModal, form]);

  if (!detail) {
    return <Card loading={loading} />;
  }

  const status = statuses.find((s) => s.id === detail.statusId);
  const today = dayjs().format('YYYY-MM-DD');
  const daysOverdue =
    !status?.isTerminal && detail.expectedDeliveryDate && detail.expectedDeliveryDate < today
      ? dayjs(today).diff(dayjs(detail.expectedDeliveryDate), 'day')
      : 0;

  const sortedNodes = [...detail.nodes].sort((a, b) => a.sortOrder - b.sortOrder);

  const openNodeModal = (mode: 'edit' | 'create', node: OrderNode | null): void => {
    setNodeModal({ mode, node });
  };

  /** 订单状态与时间轴联动：当前（第一个未完成）节点 */
  const deriveStatus = (): { label: string; color: string } => {
    if (sortedNodes.length === 0) return { label: '未填写', color: '#BFBFBF' };
    if (sortedNodes.every((n) => n.status === 'done')) return { label: '已完结', color: '#52C41A' };
    const current = sortedNodes.find((n) => n.status !== 'done')!;
    return {
      label: `${current.name} · ${NODE_STATUS_LABELS[current.status]}`,
      color: NODE_STATUS_COLORS[current.status],
    };
  };

  const submitNode = async (): Promise<void> => {
    const values = await form.validateFields();
    try {
      if (nodeModal?.mode === 'edit' && nodeModal.node) {
        await api.nodes.update(nodeModal.node.id, { name: values.name, status: statusValue as never });
      } else {
        await api.nodes.create(orderId, { name: values.name });
      }
      setNodeModal(null);
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

  const uploadDoc = async (): Promise<void> => {
    try {
      await api.orderDocs.pickAndAdd(orderId);
      setDocs((await api.orderDocs.list(orderId)) as OrderAttachment[]);
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  const deleteDoc = async (doc: OrderAttachment): Promise<void> => {
    try {
      await api.orderDocs.remove(doc.id);
      setDocs((await api.orderDocs.list(orderId)) as OrderAttachment[]);
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

  return (
    <Card
      loading={loading}
      title={
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/orders')} />
          <span>{customerName}</span>
          {status ? <Tag color={deriveStatus().color}>{deriveStatus().label}</Tag> : <Tag color="#BFBFBF">未填写</Tag>}
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
          <Button
            type="primary"
            ghost
            onClick={() => void api.exportQuote(detail.id).then((p) => (p ? void message.success(`报价单已导出：${p}`) : undefined))}
          >
            导出报价单
          </Button>
          <Button icon={<FileWordOutlined />} onClick={() => setQuoteOpen(true)}>
            导出报价单（Word）
          </Button>
          <Popconfirm
            title={`删除订单「${detail.orderNo}」`}
            description="删除后物料明细、进度节点、订单文档、附件将一并删除，不可恢复。"
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
        <Descriptions.Item label="订单类型">{types.find((t) => t.id === detail.typeId)?.name ?? '未填写'}</Descriptions.Item>
        <Descriptions.Item label="订单日期">{detail.orderDate ?? '未填写'}</Descriptions.Item>
        <Descriptions.Item label="预计交货日期">{detail.expectedDeliveryDate ?? '未填写'}</Descriptions.Item>
        <Descriptions.Item label="实际交货日期">{detail.actualDeliveryDate ?? '未填写'}</Descriptions.Item>
        <Descriptions.Item label="订单总金额">
          {(detail.totalAmount ?? 0).toFixed(2)}
          {detail.amountManual && <Tag style={{ marginLeft: 8 }}>已手改</Tag>}
        </Descriptions.Item>
        <Descriptions.Item label="沟通微信群">
          {detail.wechatGroups.length > 0
            ? detail.wechatGroups.map((g) => <Tag key={g.id}>{g.name}</Tag>)
            : '未填写'}
        </Descriptions.Item>
        <Descriptions.Item label="备注" span={4}>
          {detail.remark ?? '未填写'}
        </Descriptions.Item>
      </Descriptions>

      <Card
        size="small"
        title={`订单文档（${docs.length}）`}
        extra={
          <Button size="small" icon={<FileAddOutlined />} onClick={() => void uploadDoc()}>
            上传 PDF / Word / 图片
          </Button>
        }
        style={{ marginBottom: 16 }}
      >
        <List
          size="small"
          dataSource={docs}
          locale={{ emptyText: '暂无订单文档，可上传 PDF、Word 或图片' }}
          renderItem={(doc) => (
            <List.Item
              actions={[
                <a key="open" onClick={() => void api.attachments.open(doc.storedPath)}>打开</a>,
                <a key="folder" onClick={() => void api.attachments.openFolder(doc.storedPath)}>所在目录</a>,
                <Popconfirm key="del" title="删除该文档" onConfirm={() => void deleteDoc(doc)}>
                  <a style={{ color: '#ff4d4f' }}>删除</a>
                </Popconfirm>,
              ]}
            >
              <Space>
                <PaperClipOutlined />
                <span>{doc.originalName}</span>
                <span style={{ color: '#999' }}>{fmtSize(doc.size)}</span>
                <span style={{ color: '#999' }}>{doc.createdAt.replace('T', ' ').slice(0, 19)}</span>
              </Space>
            </List.Item>
          )}
        />
      </Card>

      <Divider orientation="left">物料明细</Divider>
      <Table
        rowKey="id"
        size="small"
        pagination={false}
        scroll={{ x: 1500 }}
        dataSource={detail.items}
        columns={[
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
            title: '价格口径',
            width: 110,
            render: (_: unknown, r) => (
              <Space size={2} direction="vertical">
                <Tag color={r.purchaseTaxIncluded ? 'blue' : 'orange'}>进货{r.purchaseTaxIncluded ? '含税' : '不含税'}</Tag>
                <Tag color={r.priceTaxIncluded ? 'blue' : 'orange'}>出货{r.priceTaxIncluded ? '含税' : '不含税'}</Tag>
              </Space>
            ),
          },
          {
            title: '含税单价',
            width: 100,
            align: 'right' as const,
            render: (_: unknown, r) => {
              const p = r.unitPrice ?? 0;
              const gross = r.priceTaxIncluded ? p : Math.round(p * (1 + r.taxRate / 100) * 100) / 100;
              return gross.toFixed(2);
            },
          },
          {
            title: '含税金额',
            dataIndex: 'subtotal',
            width: 110,
            align: 'right' as const,
            render: (v: number | null) => (v ?? 0).toFixed(2),
          },
          {
            title: '毛利',
            width: 100,
            align: 'right' as const,
            render: (_: unknown, r) => {
              const rate = 1 + r.taxRate / 100;
              const grossSale = r.priceTaxIncluded ? (r.unitPrice ?? 0) : (r.unitPrice ?? 0) * rate;
              const grossCost = r.purchaseTaxIncluded ? (r.purchasePrice ?? 0) : (r.purchasePrice ?? 0) * rate;
              return (Math.round(r.qty * (grossSale - grossCost) * 100) / 100).toFixed(2);
            },
          },
          { title: '备注', dataIndex: 'remark', width: 120, render: (v: string | null) => v ?? '' },
        ]}
      />

      <Divider orientation="left">
        进度（{sortedNodes.filter((n) => n.status === 'done').length}/{sortedNodes.length} 已完成，点击节点可编辑）
        <Button size="small" type="link" onClick={() => openNodeModal('create', null)}>
          新增节点
        </Button>
      </Divider>
      <NodeStepper nodes={sortedNodes} onSelect={(n) => openNodeModal('edit', n)} />
      <div style={{ color: '#999', fontSize: 12, marginBottom: 8 }}>
        点击任意步骤即可编辑名称与「当前进度状态」（未开始 / 进行中 / 已完成 / 异常延误）。
      </div>

      <Modal
        title={nodeModal?.mode === 'edit' ? '编辑节点' : '新增节点'}
        open={!!nodeModal}
        onOk={() => void submitNode()}
        onCancel={() => setNodeModal(null)}
        destroyOnClose
        footer={(_, { OkBtn, CancelBtn }) => (
          <>
            {nodeModal?.node && (
              <Popconfirm title="删除此节点" onConfirm={() => {
                void doDeleteNode(nodeModal.node!).then(() => setNodeModal(null));
              }}>
                <Button danger style={{ float: 'left' }}>删除节点</Button>
              </Popconfirm>
            )}
            <CancelBtn />
            <OkBtn />
          </>
        )}
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
      {detail && quoteOpen && (
        <QuoteModal
          open
          onClose={() => setQuoteOpen(false)}
          customerId={detail.customerId}
          customerName={customerName}
          items={detail.items.map<QuoteModalItem>((it) => ({
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
          totalAmount={detail.totalAmount ?? 0}
        />
      )}
    </Card>
  );
}
