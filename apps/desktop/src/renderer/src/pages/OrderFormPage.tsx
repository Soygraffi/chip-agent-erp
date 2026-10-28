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
import { pinyinFilterOption } from '../utils/pinyin';
import type { OrderDetail, WechatGroup } from '../models';

interface OptionItem {
  id: number;
  name: string;
}

interface MaterialOption {
  id: number;
  code: string;
  name: string;
  spec: string | null;
  brand: string | null;
  purchasePrice: number | null;
  purchaseTaxIncluded: boolean;
  salePrice: number | null;
  priceTaxIncluded: boolean;
  taxRate: number;
}

interface ItemRow {
  key: number;
  materialId: number | null;
  materialCode: string | null;
  materialName: string | null;
  chipModel: string;
  brand: string | null;
  packageSpec: string | null;
  qty: number;
  unitPrice: number | null;
  purchasePrice: number | null;
  priceTaxIncluded: boolean;
  purchaseTaxIncluded: boolean;
  taxRate: number;
  margin: number | null;
  customerPn: string | null;
  remark: string | null;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

export function grossPrice(price: number | null, taxIncluded: boolean, taxRate: number): number {
  const p = price ?? 0;
  return taxIncluded ? p : round4(p * (1 + taxRate / 100));
}

export function itemAmount(it: ItemRow): number {
  return round2(it.qty * grossPrice(it.unitPrice, it.priceTaxIncluded, it.taxRate));
}

const EMPTY_ITEM: Omit<ItemRow, 'key'> = {
  materialId: null,
  materialCode: null,
  materialName: null,
  chipModel: '',
  brand: null,
  packageSpec: null,
  qty: 1,
  unitPrice: null,
  purchasePrice: null,
  priceTaxIncluded: true,
  purchaseTaxIncluded: true,
  taxRate: 13,
  margin: null,
  customerPn: null,
  remark: null,
};

const TAX_OPTIONS = [
  { value: true, label: '含税' },
  { value: false, label: '不含税' },
];

export function OrderFormPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<OptionItem[]>([]);
  const [statuses, setStatuses] = useState<OptionItem[]>([]);
  const [types, setTypes] = useState<OptionItem[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<OptionItem[]>([]);
  const [groups, setGroups] = useState<WechatGroup[]>([]);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [items, setItems] = useState<ItemRow[]>([{ key: 0, ...EMPTY_ITEM }]);
  const [manual, setManual] = useState(false);
  const [manualAmount, setManualAmount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    void api.customers.options().then((r) => setCustomers(r as OptionItem[]));
    void api.statuses.list().then((r) => setStatuses(r as OptionItem[]));
    void api.dicts.list('order_type').then((r) => setTypes(r as OptionItem[]));
    void api.dicts.list('payment_method').then((r) => setPaymentMethods(r as OptionItem[]));
    void api.materials.options().then((r) => setMaterials(r as MaterialOption[]));
  }, []);

  useEffect(() => {
    if (isEdit) {
      void api.orders.get(Number(id)).then((d) => {
        const detail = d as OrderDetail;
        form.setFieldsValue({
          orderNo: detail.orderNo,
          customerId: detail.customerId,
          orderDate: detail.orderDate ? dayjs(detail.orderDate) : null,
          typeId: detail.typeId,
          statusId: detail.statusId,
          expectedDeliveryDate: detail.expectedDeliveryDate ? dayjs(detail.expectedDeliveryDate) : null,
          actualDeliveryDate: detail.actualDeliveryDate ? dayjs(detail.actualDeliveryDate) : null,
          paymentMethodId: detail.paymentMethodId,
          isKey: detail.isKey,
          remark: detail.remark,
          wechatGroupIds: detail.wechatGroups.map((g) => g.id),
        });
        setItems(
          detail.items.map((it, i) => {
            const grossSale = grossPrice(it.unitPrice, it.priceTaxIncluded, it.taxRate);
            const grossCost = grossPrice(it.purchasePrice, it.purchaseTaxIncluded, it.taxRate);
            return {
              key: i,
              materialId: it.materialId,
              materialCode: it.materialCode,
              materialName: it.materialName,
              chipModel: it.chipModel,
              brand: it.brand,
              packageSpec: it.packageSpec,
              qty: it.qty,
              unitPrice: it.unitPrice,
              purchasePrice: it.purchasePrice,
              priceTaxIncluded: it.priceTaxIncluded,
              purchaseTaxIncluded: it.purchaseTaxIncluded,
              taxRate: it.taxRate,
              margin: grossCost > 0 ? round2(((grossSale - grossCost) / grossCost) * 100) : null,
              customerPn: it.customerPn,
              remark: it.remark,
            };
          }),
        );
        setManual(detail.amountManual);
        setManualAmount(detail.totalAmount);
        void api.wechat.listGroups(detail.customerId).then((r) => setGroups(r as WechatGroup[]));
      });
    } else if (params.get('customerId')) {
      const cid = Number(params.get('customerId'));
      form.setFieldsValue({ customerId: cid });
      void api.wechat.listGroups(cid).then((r) => setGroups(r as WechatGroup[]));
    }
  }, [id, isEdit, form, params]);

  const onCustomerChange = (cid: number): void => {
    form.setFieldsValue({ wechatGroupIds: undefined });
    void api.wechat.listGroups(cid).then((r) => setGroups(r as WechatGroup[]));
  };

  const autoTotal = useMemo(
    () => round2(items.reduce((acc, it) => acc + itemAmount(it), 0)),
    [items],
  );

  const updateItem = (key: number, patch: Partial<ItemRow>): void => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  };

  /** 利润率变化 → 出货价 = 进货价 × (1 + 利润率%) */
  const onMarginChange = (key: number, row: ItemRow, pct: number | null): void => {
    const margin = pct ?? null;
    const sale = row.purchasePrice != null ? round4(row.purchasePrice * (1 + (margin ?? 0) / 100)) : null;
    updateItem(key, { margin, unitPrice: sale });
  };

  const onPickMaterial = (key: number, materialId: number): void => {
    const m = materials.find((x) => x.id === materialId);
    if (!m) {
      updateItem(key, { materialId: null });
      return;
    }
    const grossSale = grossPrice(m.salePrice, m.priceTaxIncluded, m.taxRate);
    const grossCost = grossPrice(m.purchasePrice, m.purchaseTaxIncluded, m.taxRate);
    updateItem(key, {
      materialId: m.id,
      materialCode: m.code,
      materialName: m.name,
      chipModel: m.spec ?? '',
      brand: m.brand,
      purchasePrice: m.purchasePrice,
      purchaseTaxIncluded: m.purchaseTaxIncluded,
      unitPrice: m.salePrice,
      priceTaxIncluded: m.priceTaxIncluded,
      taxRate: m.taxRate,
      margin: grossCost > 0 ? round2(((grossSale - grossCost) / grossCost) * 100) : null,
    });
  };

  const submit = async (): Promise<void> => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const payload = {
        customerId: values.customerId,
        orderDate: values.orderDate ? (values.orderDate as dayjs.Dayjs).format('YYYY-MM-DD') : null,
        typeId: values.typeId ?? null,
        statusId: values.statusId ?? null,
        expectedDeliveryDate: values.expectedDeliveryDate ? (values.expectedDeliveryDate as dayjs.Dayjs).format('YYYY-MM-DD') : null,
        actualDeliveryDate: values.actualDeliveryDate ? (values.actualDeliveryDate as dayjs.Dayjs).format('YYYY-MM-DD') : null,
        paymentMethodId: values.paymentMethodId ?? null,
        isKey: !!values.isKey,
        remark: values.remark ?? null,
        orderNo: values.orderNo || null,
        amountManual: manual,
        totalAmount: manual ? manualAmount : null,
        wechatGroupIds: (values.wechatGroupIds as number[] | undefined) ?? [],
        items: items
          .filter((it) => it.chipModel.trim() !== '' || (it.materialName ?? '').trim() !== '')
          .map((it) => ({
            materialId: it.materialId,
            materialCode: it.materialCode,
            materialName: it.materialName,
            chipModel: it.chipModel,
            brand: it.brand,
            packageSpec: it.packageSpec,
            qty: it.qty,
            unitPrice: it.unitPrice,
            purchasePrice: it.purchasePrice,
            priceTaxIncluded: it.priceTaxIncluded,
            purchaseTaxIncluded: it.purchaseTaxIncluded,
            taxRate: it.taxRate,
            subtotal: itemAmount(it),
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
      title: '从物料库选择',
      width: 190,
      render: (_: unknown, r: ItemRow) => (
        <Select
          showSearch
          allowClear
          placeholder="选择物料自动带出"
          style={{ width: '100%' }}
          value={r.materialId ?? undefined}
          optionFilterProp="label"
          options={materials.map((m) => ({
            value: m.id,
            label: `${m.code} ${m.name}${m.spec ? ' / ' + m.spec : ''}`,
          }))}
          onChange={(v) => onPickMaterial(r.key, v as number)}
        />
      ),
    },
    {
      title: '物料编码',
      width: 130,
      render: (_: unknown, r: ItemRow) => (
        <Input value={r.materialCode ?? ''} onChange={(e) => updateItem(r.key, { materialCode: e.target.value || null })} />
      ),
    },
    {
      title: '物料名称',
      width: 130,
      render: (_: unknown, r: ItemRow) => (
        <Input value={r.materialName ?? ''} onChange={(e) => updateItem(r.key, { materialName: e.target.value || null })} />
      ),
    },
    {
      title: '料号规格 *',
      width: 140,
      render: (_: unknown, r: ItemRow) => (
        <Input value={r.chipModel} placeholder="如 GD32F407ZGT6" onChange={(e) => updateItem(r.key, { chipModel: e.target.value })} />
      ),
    },
    {
      title: '品牌',
      width: 90,
      render: (_: unknown, r: ItemRow) => (
        <Input value={r.brand ?? ''} onChange={(e) => updateItem(r.key, { brand: e.target.value || null })} />
      ),
    },
    {
      title: '数量 *',
      width: 80,
      render: (_: unknown, r: ItemRow) => (
        <InputNumber min={0} precision={0} value={r.qty} style={{ width: '100%' }} onChange={(v) => updateItem(r.key, { qty: v ?? 0 })} />
      ),
    },
    {
      title: '进货价',
      width: 100,
      render: (_: unknown, r: ItemRow) => (
        <InputNumber min={0} precision={4} value={r.purchasePrice ?? undefined} style={{ width: '100%' }} onChange={(v) => updateItem(r.key, { purchasePrice: v ?? null })} />
      ),
    },
    {
      title: '进货口径',
      width: 105,
      render: (_: unknown, r: ItemRow) => (
        <Select
          value={r.purchaseTaxIncluded}
          style={{ width: '100%' }}
          options={TAX_OPTIONS}
          onChange={(v) => updateItem(r.key, { purchaseTaxIncluded: v as boolean })}
        />
      ),
    },
    {
      title: '出货价',
      width: 100,
      render: (_: unknown, r: ItemRow) => (
        <InputNumber min={0} precision={4} value={r.unitPrice ?? undefined} style={{ width: '100%' }} onChange={(v) => updateItem(r.key, { unitPrice: v ?? null, margin: null })} />
      ),
    },
    {
      title: '出货口径',
      width: 105,
      render: (_: unknown, r: ItemRow) => (
        <Select
          value={r.priceTaxIncluded}
          style={{ width: '100%' }}
          options={TAX_OPTIONS}
          onChange={(v) => updateItem(r.key, { priceTaxIncluded: v as boolean })}
        />
      ),
    },
    {
      title: '利润率%',
      width: 95,
      render: (_: unknown, r: ItemRow) => (
        <InputNumber
          min={-100}
          max={1000}
          precision={2}
          value={r.margin ?? undefined}
          disabled={r.purchasePrice == null}
          style={{ width: '100%' }}
          placeholder={r.purchasePrice == null ? '先填进货价' : ''}
          onChange={(v) => onMarginChange(r.key, r, v)}
        />
      ),
    },
    {
      title: '税率%',
      width: 80,
      render: (_: unknown, r: ItemRow) => (
        <InputNumber min={0} max={100} precision={2} value={r.taxRate} style={{ width: '100%' }} onChange={(v) => updateItem(r.key, { taxRate: v ?? 13 })} />
      ),
    },
    {
      title: '含税单价',
      width: 95,
      align: 'right' as const,
      render: (_: unknown, r: ItemRow) => grossPrice(r.unitPrice, r.priceTaxIncluded, r.taxRate).toFixed(2),
    },
    {
      title: '含税金额',
      width: 105,
      align: 'right' as const,
      render: (_: unknown, r: ItemRow) => itemAmount(r).toFixed(2),
    },
    {
      title: '备注',
      width: 110,
      render: (_: unknown, r: ItemRow) => (
        <Input value={r.remark ?? ''} onChange={(e) => updateItem(r.key, { remark: e.target.value || null })} />
      ),
    },
    {
      title: '',
      width: 46,
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
            <Select showSearch filterOption={(input, option) => pinyinFilterOption(input, option)} style={{ width: 240 }} placeholder="输入名称或拼音搜索客户" options={customers.map((c) => ({ value: c.id, label: c.name }))} onChange={(v) => onCustomerChange(v)} />
          </Form.Item>
          <Form.Item name="orderNo" label="订单编号" extra="留空自动生成">
            <Input style={{ width: 180 }} placeholder="留空自动生成" />
          </Form.Item>
          <Form.Item name="orderDate" label="订单日期" extra="可不填">
            <DatePicker style={{ width: 150 }} />
          </Form.Item>
          <Form.Item name="typeId" label="订单类型" extra="可不填">
            <Select allowClear style={{ width: 130 }} options={types.map((t) => ({ value: t.id, label: t.name }))} />
          </Form.Item>
          <Form.Item name="statusId" label="订单状态" extra="可不填">
            <Select allowClear style={{ width: 130 }} options={statuses.map((s) => ({ value: s.id, label: s.name }))} />
          </Form.Item>
          <Form.Item name="expectedDeliveryDate" label="预计交货日期">
            <DatePicker style={{ width: 150 }} />
          </Form.Item>
          <Form.Item name="actualDeliveryDate" label="实际交货日期">
            <DatePicker style={{ width: 150 }} />
          </Form.Item>
          <Form.Item name="paymentMethodId" label="付款方式">
            <Select allowClear style={{ width: 130 }} options={paymentMethods.map((p) => ({ value: p.id, label: p.name }))} />
          </Form.Item>
          <Form.Item name="isKey" label="重点跟进" valuePropName="checked">
            <Checkbox />
          </Form.Item>
          <Form.Item name="wechatGroupIds" label="沟通微信群" style={{ width: 300 }} extra="从该客户的微信群中选择，可多选">
            <Select
              mode="multiple"
              allowClear
              placeholder={groups.length === 0 ? '该客户还没有微信群' : '选择沟通的微信群'}
              options={groups.map((g) => ({ value: g.id, label: g.name }))}
            />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input style={{ width: 200 }} />
          </Form.Item>
        </Space>
      </Form>

      <div style={{ marginBottom: 8, fontWeight: 600 }}>
        订单物料明细（最多 50 行；进货价/出货价可分别选择含税或不含税；填利润率可自动算出货价）
      </div>
      <Table<ItemRow>
        rowKey="key"
        size="small"
        pagination={false}
        scroll={{ x: 1900 }}
        dataSource={items}
        columns={itemColumns}
        footer={() => (
          <Button
            icon={<PlusOutlined />}
            disabled={items.length >= 50}
            onClick={() => setItems((prev) => [...prev, { key: Math.max(0, ...prev.map((p) => p.key)) + 1, ...EMPTY_ITEM }])}
          >
            添加明细行
          </Button>
        )}
      />

      <Space style={{ marginTop: 16 }} size={24} wrap>
        <span>
          自动汇总含税总金额：<strong>{autoTotal.toFixed(2)}</strong>
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
