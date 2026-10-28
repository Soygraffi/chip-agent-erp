import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  message,
} from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { pinyinFilterOption } from '../utils/pinyin';
import type { MaterialListRow, Page } from '../models';

interface MaterialOrderRow {
  orderId: number;
  orderNo: string;
  customerName: string;
  orderDate: string | null;
  qty: number;
  unitPrice: number | null;
  subtotal: number | null;
}

const TAX_OPTIONS = [
  { value: true, label: '含税' },
  { value: false, label: '不含税' },
];

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

export function MaterialsPage(): JSX.Element {
  const navigate = useNavigate();
  const [rows, setRows] = useState<MaterialListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<MaterialListRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();
  const [margin, setMargin] = useState<number | null>(null);
  const [suppliers, setSuppliers] = useState<{ id: number; name: string }[]>([]);
  const [ordersDrawer, setOrdersDrawer] = useState<{ material: MaterialListRow; rows: MaterialOrderRow[] } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = (await api.materials.list({
        search: search || undefined,
        isActive: activeFilter,
        page,
        pageSize,
      })) as Page<MaterialListRow>;
      setRows(r.rows);
      setTotal(r.total);
    } catch (e) {
      void message.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [search, activeFilter, page, pageSize]);

  useEffect(() => {
    void load();
    void api.suppliers.options().then((r) => setSuppliers(r as { id: number; name: string }[]));
  }, [load]);

  const openCreate = (): void => {
    setEditing(null);
    setMargin(null);
    form.resetFields();
    form.setFieldsValue({ purchaseTaxIncluded: true, priceTaxIncluded: true, taxRate: 13, isActive: true });
    setCreating(true);
  };

  const openEdit = (row: MaterialListRow): void => {
    setEditing(row);
    form.setFieldsValue(row);
    const cost = row.purchaseTaxIncluded ? (row.purchasePrice ?? 0) : (row.purchasePrice ?? 0) * (1 + row.taxRate / 100);
    const sale = row.priceTaxIncluded ? (row.salePrice ?? 0) : (row.salePrice ?? 0) * (1 + row.taxRate / 100);
    setMargin(cost > 0 ? round2(((sale - cost) / cost) * 100) : null);
    setCreating(true);
  };

  /** 利润率 → 出货价 = 进货价 × (1 + 利润率%)，保持原出货口径 */
  const applyMargin = (pct: number | null): void => {
    setMargin(pct);
    if (pct == null) return;
    const cost = Number(form.getFieldValue('purchasePrice') ?? 0);
    if (!Number.isFinite(cost)) return;
    form.setFieldsValue({ salePrice: round4(cost * (1 + pct / 100)) });
  };

  const submit = async (): Promise<void> => {
    const values = await form.validateFields();
    try {
      if (editing) {
        await api.materials.update(editing.id, values);
        void message.success('物料已保存');
      } else {
        await api.materials.create(values);
        void message.success('物料已创建');
      }
      setCreating(false);
      void load();
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  const doDelete = async (row: MaterialListRow): Promise<void> => {
    try {
      await api.materials.remove(row.id);
      void message.success('物料已删除');
      void load();
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  const toggleActive = async (row: MaterialListRow): Promise<void> => {
    try {
      await api.materials.update(row.id, { isActive: !row.isActive });
      void load();
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  const openOrders = async (row: MaterialListRow): Promise<void> => {
    try {
      const list = (await api.materials.orders(row.id)) as MaterialOrderRow[];
      setOrdersDrawer({ material: row, rows: list });
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  const marginOf = (r: MaterialListRow): number | null => {
    const k = 1 + r.taxRate / 100;
    const cost = r.purchaseTaxIncluded ? (r.purchasePrice ?? 0) : (r.purchasePrice ?? 0) * k;
    const sale = r.priceTaxIncluded ? (r.salePrice ?? 0) : (r.salePrice ?? 0) * k;
    return cost > 0 ? round2(((sale - cost) / cost) * 100) : null;
  };

  return (
    <Card
      title="物料管理"
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建物料
          </Button>
        </Space>
      }
    >
      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search
          placeholder="搜索物料编码 / 名称 / 规格 / 品牌"
          allowClear
          style={{ width: 300 }}
          onSearch={(v) => {
            setPage(1);
            setSearch(v);
          }}
        />
        <Select
          allowClear
          placeholder="启用状态"
          style={{ width: 140 }}
          options={[
            { value: true, label: '启用中' },
            { value: false, label: '已停用' },
          ]}
          onChange={(v) => {
            setPage(1);
            setActiveFilter(v ?? null);
          }}
        />
      </Space>

      <Table<MaterialListRow>
        rowKey="id"
        loading={loading}
        dataSource={rows}
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
          { title: '物料编码', dataIndex: 'code', width: 130 },
          { title: '物料名称', dataIndex: 'name', width: 150 },
          { title: '料号规格', dataIndex: 'spec', width: 150, render: (v: string | null) => v ?? '-' },
          { title: '品牌', dataIndex: 'brand', width: 100, render: (v: string | null) => v ?? '-' },
          { title: '供应商', dataIndex: 'supplierName', width: 150, render: (v: string | null) => v ?? '-' },
          {
            title: '进货价',
            dataIndex: 'purchasePrice',
            width: 150,
            align: 'right' as const,
            render: (v: number | null, r) => (
              <Space size={4}>
                <span>{v == null ? '-' : v.toFixed(2)}</span>
                <Tag color={r.purchaseTaxIncluded ? 'blue' : 'orange'}>{r.purchaseTaxIncluded ? '含税' : '不含税'}</Tag>
              </Space>
            ),
          },
          {
            title: '出货价',
            dataIndex: 'salePrice',
            width: 150,
            align: 'right' as const,
            render: (v: number | null, r) => (
              <Space size={4}>
                <span>{v == null ? '-' : v.toFixed(2)}</span>
                <Tag color={r.priceTaxIncluded ? 'blue' : 'orange'}>{r.priceTaxIncluded ? '含税' : '不含税'}</Tag>
              </Space>
            ),
          },
          {
            title: '利润率',
            width: 95,
            align: 'right' as const,
            render: (_: unknown, r) => {
              const m = marginOf(r);
              return m == null ? '-' : `${m.toFixed(2)}%`;
            },
          },
          { title: '税率(%)', dataIndex: 'taxRate', width: 90, align: 'right' as const },
          {
            title: '关联订单',
            dataIndex: 'orderCount',
            width: 90,
            align: 'center' as const,
            render: (v: number, r) => <a onClick={() => void openOrders(r)}>{v} 单</a>,
          },
          {
            title: '最近订单',
            dataIndex: 'lastOrderDate',
            width: 110,
            render: (v: string | null) => v ?? '-',
          },
          {
            title: '状态',
            dataIndex: 'isActive',
            width: 80,
            render: (v: boolean) => (v ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>),
          },
          {
            title: '操作',
            width: 180,
            render: (_, r) => (
              <Space>
                <a onClick={() => openEdit(r)}>编辑</a>
                <a onClick={() => void openOrders(r)}>关联订单</a>
                <a onClick={() => void toggleActive(r)}>{r.isActive ? '停用' : '启用'}</a>
                <Popconfirm
                  title={`删除物料「${r.code}」`}
                  description="被订单明细引用的物料不能删除（可改为停用）。"
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
      />

      <Modal
        title={editing ? '编辑物料' : '新建物料'}
        open={creating}
        onOk={() => void submit()}
        onCancel={() => setCreating(false)}
        destroyOnClose
        width={720}
      >
        <Form form={form} layout="vertical">
          <Space size={16} wrap>
            <Form.Item name="code" label="物料编码" rules={[{ required: true, message: '请输入物料编码' }]}>
              <Input style={{ width: 200 }} placeholder="如 RDDZX03001" />
            </Form.Item>
            <Form.Item name="name" label="物料名称" rules={[{ required: true, message: '请输入物料名称' }]}>
              <Input style={{ width: 200 }} placeholder="如 ARM处理器" />
            </Form.Item>
          </Space>
          <Space size={16} wrap>
            <Form.Item name="spec" label="料号规格">
              <Input style={{ width: 220 }} placeholder="如 GD32F407ZGT6" />
            </Form.Item>
            <Form.Item name="brand" label="品牌">
              <Input style={{ width: 160 }} placeholder="如 兆易创新" />
            </Form.Item>
            <Form.Item name="supplierId" label="供应商">
              <Select
                allowClear
                showSearch
                filterOption={(input, option) => pinyinFilterOption(input, option)}
                style={{ width: 220 }}
                options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
              />
            </Form.Item>
            <Form.Item name="taxRate" label="税率（%）">
              <InputNumber min={0} max={100} precision={2} style={{ width: 120 }} />
            </Form.Item>
          </Space>
          <Space size={16} wrap>
            <Form.Item name="purchasePrice" label="进货价">
              <InputNumber min={0} precision={4} style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="purchaseTaxIncluded" label="进货价口径">
              <Select style={{ width: 120 }} options={TAX_OPTIONS} />
            </Form.Item>
            <Form.Item name="salePrice" label="出货价">
              <InputNumber min={0} precision={4} style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="priceTaxIncluded" label="出货价口径">
              <Select style={{ width: 120 }} options={TAX_OPTIONS} />
            </Form.Item>
            <Form.Item label="利润率（%）" extra="填写后自动算出货价">
              <InputNumber
                min={-100}
                max={1000}
                precision={2}
                value={margin ?? undefined}
                style={{ width: 140 }}
                onChange={(v) => applyMargin(v ?? null)}
              />
            </Form.Item>
          </Space>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="isActive" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={`关联订单 —— ${ordersDrawer?.material.code ?? ''} ${ordersDrawer?.material.name ?? ''}`}
        open={!!ordersDrawer}
        onClose={() => setOrdersDrawer(null)}
        width={760}
      >
        <Table<MaterialOrderRow>
          rowKey="orderId"
          size="small"
          dataSource={ordersDrawer?.rows ?? []}
          locale={{ emptyText: '该物料还没有被订单使用' }}
          pagination={false}
          columns={[
            {
              title: '订单编号',
              dataIndex: 'orderNo',
              render: (v: string, r) => <a onClick={() => navigate(`/orders/${r.orderId}`)}>{v}</a>,
            },
            { title: '客户', dataIndex: 'customerName' },
            { title: '订单日期', dataIndex: 'orderDate', width: 110, render: (v: string | null) => v ?? '未填写' },
            { title: '数量', dataIndex: 'qty', width: 80, align: 'right' as const },
            {
              title: '单价',
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
              render: (v: number | null) => (v == null ? '-' : v.toFixed(2)),
            },
          ]}
        />
      </Drawer>
    </Card>
  );
}
