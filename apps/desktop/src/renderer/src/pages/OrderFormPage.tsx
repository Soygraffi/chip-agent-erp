import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Checkbox,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Table,
  message,
} from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { api, errorMessage } from '../api';
import type { OrderDetail } from '../models';

interface OptionItem {
  id: number;
  name: string;
}

interface ItemRow {
  key: number;
  chipModel: string;
  brand: string | null;
  packageSpec: string | null;
  qty: number;
  unitPrice: number | null;
  customerPn: string | null;
  remark: string | null;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function OrderFormPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<OptionItem[]>([]);
  const [statuses, setStatuses] = useState<OptionItem[]>([]);
  const [types, setTypes] = useState<OptionItem[]>([]);
  const [currencies, setCurrencies] = useState<OptionItem[]>([]);
  const [items, setItems] = useState<ItemRow[]>([{ key: 0, chipModel: '', brand: null, packageSpec: null, qty: 1, unitPrice: null, customerPn: null, remark: null }]);
  const [manual, setManual] = useState(false);
  const [manualAmount, setManualAmount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    void api.customers.options().then((r) => setCustomers(r as OptionItem[]));
    void api.statuses.list().then((r) => setStatuses(r as OptionItem[]));
    void api.dicts.list('order_type').then((r) => setTypes(r as OptionItem[]));
    void api.dicts.list('currency').then((r) => setCurrencies(r as OptionItem[]));
  }, []);

  useEffect(() => {
    if (isEdit) {
      void api.orders.get(Number(id)).then((d) => {
        const detail = d as OrderDetail;
        form.setFieldsValue({
          orderNo: detail.orderNo,
          customerId: detail.customerId,
          orderDate: dayjs(detail.orderDate),
          typeId: detail.typeId,
          statusId: detail.statusId,
          expectedDeliveryDate: detail.expectedDeliveryDate ? dayjs(detail.expectedDeliveryDate) : null,
          actualDeliveryDate: detail.actualDeliveryDate ? dayjs(detail.actualDeliveryDate) : null,
          currencyId: detail.currencyId,
          paymentMethodId: detail.paymentMethodId,
          owner: detail.owner,
          isKey: detail.isKey,
          remark: detail.remark,
        });
        setItems(
          detail.items.map((it, i) => ({
            key: i,
            chipModel: it.chipModel,
            brand: it.brand,
            packageSpec: it.packageSpec,
            qty: it.qty,
            unitPrice: it.unitPrice,
            customerPn: it.customerPn,
            remark: it.remark,
          })),
        );
        setManual(detail.amountManual);
        setManualAmount(detail.totalAmount);
      });
    } else if (params.get('customerId')) {
      form.setFieldsValue({ customerId: Number(params.get('customerId')) });
    }
  }, [id, isEdit, form, params]);

  const autoTotal = useMemo(
    () => round2(items.reduce((acc, it) => acc + it.qty * (it.unitPrice ?? 0), 0)),
    [items],
  );

  const updateItem = (key: number, patch: Partial<ItemRow>): void => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  };

  const submit = async (): Promise<void> => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const payload = {
        customerId: values.customerId,
        orderDate: (values.orderDate as dayjs.Dayjs).format('YYYY-MM-DD'),
        typeId: values.typeId ?? null,
        statusId: values.statusId,
        expectedDeliveryDate: values.expectedDeliveryDate ? (values.expectedDeliveryDate as dayjs.Dayjs).format('YYYY-MM-DD') : null,
        actualDeliveryDate: values.actualDeliveryDate ? (values.actualDeliveryDate as dayjs.Dayjs).format('YYYY-MM-DD') : null,
        currencyId: values.currencyId ?? null,
        paymentMethodId: values.paymentMethodId ?? null,
        owner: values.owner ?? null,
        isKey: !!values.isKey,
        remark: values.remark ?? null,
        orderNo: values.orderNo || null,
        amountManual: manual,
        totalAmount: manual ? manualAmount : null,
        items: items
          .filter((it) => it.chipModel.trim() !== '')
          .map((it) => ({
            chipModel: it.chipModel,
            brand: it.brand,
            packageSpec: it.packageSpec,
            qty: it.qty,
            unitPrice: it.unitPrice,
            subtotal: round2(it.qty * (it.unitPrice ?? 0)),
            customerPn: it.customerPn,
            remark: it.remark,
          })),
      };
      if (isEdit) {
        await api.orders.update(Number(id), payload);
        void message.success('订单已保存');
        navigate(`/orders/${id}`);
      } else {
        const newId = await api.orders.create(payload);
        void message.success('订单已创建，已自动生成 10 个标准进度节点');
        navigate(`/orders/${newId}`);
      }
    } catch (e) {
      void message.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const itemColumns = [
    {
      title: '芯片型号 *',
      width: 200,
      render: (_: unknown, r: ItemRow) => (
        <Input value={r.chipModel} placeholder="如 STM32F103C8T6" onChange={(e) => updateItem(r.key, { chipModel: e.target.value })} />
      ),
    },
    {
      title: '品牌',
      width: 110,
      render: (_: unknown, r: ItemRow) => <Input value={r.brand ?? ''} onChange={(e) => updateItem(r.key, { brand: e.target.value || null })} />,
    },
    {
      title: '封装规格',
      width: 130,
      render: (_: unknown, r: ItemRow) => <Input value={r.packageSpec ?? ''} onChange={(e) => updateItem(r.key, { packageSpec: e.target.value || null })} />,
    },
    {
      title: '数量 *',
      width: 110,
      render: (_: unknown, r: ItemRow) => (
        <InputNumber min={0} precision={0} value={r.qty} style={{ width: '100%' }} onChange={(v) => updateItem(r.key, { qty: v ?? 0 })} />
      ),
    },
    {
      title: '单价',
      width: 130,
      render: (_: unknown, r: ItemRow) => (
        <InputNumber min={0} precision={4} value={r.unitPrice ?? undefined} style={{ width: '100%' }} onChange={(v) => updateItem(r.key, { unitPrice: v ?? null })} />
      ),
    },
    {
      title: '小计（自动）',
      width: 110,
      align: 'right' as const,
      render: (_: unknown, r: ItemRow) => round2(r.qty * (r.unitPrice ?? 0)).toFixed(2),
    },
    {
      title: '客户料号',
      width: 130,
      render: (_: unknown, r: ItemRow) => <Input value={r.customerPn ?? ''} onChange={(e) => updateItem(r.key, { customerPn: e.target.value || null })} />,
    },
    {
      title: '',
      width: 50,
      render: (_: unknown, r: ItemRow) => (
        <Popconfirm title="删除此行" onConfirm={() => setItems((prev) => prev.filter((it) => it.key !== r.key))}>
          <Button danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <Card title={isEdit ? '编辑订单' : '新建订单'}>
      <Form form={form} layout="vertical">
        <Space size={24} align="start" wrap style={{ display: 'flex' }}>
          <Form.Item name="customerId" label="所属客户" rules={[{ required: true, message: '请选择客户' }]}>
            <Select showSearch optionFilterProp="label" style={{ width: 260 }} placeholder="选择客户" options={customers.map((c) => ({ value: c.id, label: c.name }))} />
          </Form.Item>
          <Form.Item name="orderNo" label="订单编号" extra="留空自动生成（如 XS202610280001）">
            <Input style={{ width: 200 }} placeholder="留空自动生成" />
          </Form.Item>
          <Form.Item name="orderDate" label="订单日期" rules={[{ required: true, message: '请选择订单日期' }]}>
            <DatePicker style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="typeId" label="订单类型" rules={[{ required: true, message: '请选择订单类型' }]}>
            <Select style={{ width: 140 }} options={types.map((t) => ({ value: t.id, label: t.name }))} />
          </Form.Item>
          <Form.Item name="statusId" label="订单状态" rules={[{ required: true, message: '请选择订单状态' }]}>
            <Select style={{ width: 130 }} options={statuses.map((s) => ({ value: s.id, label: s.name }))} />
          </Form.Item>
          <Form.Item name="expectedDeliveryDate" label="预计交货日期">
            <DatePicker style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="actualDeliveryDate" label="实际交货日期">
            <DatePicker style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="currencyId" label="币种">
            <Select style={{ width: 140 }} options={currencies.map((c) => ({ value: c.id, label: c.name }))} />
          </Form.Item>
          <Form.Item name="owner" label="负责人">
            <Input style={{ width: 140 }} />
          </Form.Item>
          <Form.Item name="isKey" label="重点跟进" valuePropName="checked">
            <Checkbox />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input style={{ width: 220 }} />
          </Form.Item>
        </Space>
      </Form>

      <div style={{ marginBottom: 8, fontWeight: 600 }}>订单物料明细（最多 50 行）</div>
      <Table<ItemRow>
        rowKey="key"
        size="small"
        pagination={false}
        dataSource={items}
        columns={itemColumns}
        footer={() => (
          <Button
            icon={<PlusOutlined />}
            disabled={items.length >= 50}
            onClick={() => setItems((prev) => [...prev, { key: Math.max(...prev.map((p) => p.key)) + 1, chipModel: '', brand: null, packageSpec: null, qty: 1, unitPrice: null, customerPn: null, remark: null }])}
          >
            添加明细行
          </Button>
        )}
      />

      <Space style={{ marginTop: 16 }} size={24}>
        <span>
          自动汇总总金额：<strong>{autoTotal.toFixed(2)}</strong>
        </span>
        <Checkbox
          checked={manual}
          onChange={(e) => {
            setManual(e.target.checked);
            if (e.target.checked && manualAmount == null) setManualAmount(autoTotal);
          }}
        >
          手动设置总金额（折扣/运费/整单议价）
        </Checkbox>
        {manual && (
          <InputNumber value={manualAmount ?? undefined} precision={2} min={0} onChange={(v) => setManualAmount(v ?? null)} />
        )}
        {isEdit && (
          <Button
            onClick={() => {
              setManual(false);
              setManualAmount(null);
              void api.orders.restoreAutoAmount(Number(id)).then(() => void message.success('已恢复自动汇总'));
            }}
          >
            恢复自动汇总
          </Button>
        )}
      </Space>

      <div style={{ marginTop: 24 }}>
        <Space>
          <Button type="primary" loading={saving} onClick={() => void submit()}>
            保存
          </Button>
          <Button onClick={() => navigate(-1)}>取消</Button>
        </Space>
      </div>
    </Card>
  );
}
