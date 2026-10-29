import React, { useEffect, useState } from 'react';
import { Button, DatePicker, Form, Input, InputNumber, Modal, Space, message } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api, errorMessage } from '../api';

export interface QuoteModalItem {
  materialCode?: string | null;
  materialName?: string | null;
  chipModel: string;
  brand?: string | null;
  qty: number;
  unitPrice?: number | null;
  priceTaxIncluded?: boolean;
  taxRate?: number;
  subtotal?: number | null;
  remark?: string | null;
}

interface QuoteModalProps {
  open: boolean;
  onClose: () => void;
  customerId: number;
  customerName: string;
  items: QuoteModalItem[];
  totalAmount: number;
}

/**
 * 报价单信息弹窗（V1.8.1）：导出前填写，空字段在 Word 中自动隐藏。
 * 新建订单、订单管理卡片、订单详情共用。
 */
export function QuoteModal(props: QuoteModalProps): JSX.Element {
  const { open, onClose, customerId, customerName, items, totalAmount } = props;
  const [form] = Form.useForm();
  const [notes, setNotes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void (async () => {
      try {
        const [customer, cfg] = await Promise.all([
          api.customers.get(customerId) as Promise<{ contact?: string | null; address?: string | null }>,
          api.settings.getQuoteConfig() as Promise<{
            salesPerson?: string;
            salesPhone?: string;
            quoteTerms?: string;
          }>,
        ]);
        if (!alive) return;
        const terms = (cfg.quoteTerms ?? '').split('\n').filter((l) => l.trim() !== '');
        setNotes(
          terms.length > 0
            ? terms
            : ['1、交货周期：具体交货时间以合同约定时间为准', '2、付款方式：票到月结30天付现'],
        );
        form.setFieldsValue({
          customerName,
          contact: customer.contact ?? '',
          phone: '',
          address: customer.address ?? '',
          date: dayjs(),
          validityDays: 30,
          salesPerson: cfg.salesPerson ?? '',
          salesPhone: cfg.salesPhone ?? '',
        });
      } catch (e) {
        void message.error(errorMessage(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, customerId, customerName, form]);

  const submit = async (): Promise<void> => {
    const values = await form.validateFields();
    setLoading(true);
    try {
      const p = await api.exportQuoteDocx({
        customerName: (values.customerName as string) || null,
        contact: (values.contact as string) || null,
        phone: (values.phone as string) || null,
        address: (values.address as string) || null,
        date: values.date ? (values.date as dayjs.Dayjs).format('YYYY-MM-DD') : null,
        validityDays: (values.validityDays as number) ?? null,
        salesPerson: (values.salesPerson as string) || null,
        salesPhone: (values.salesPhone as string) || null,
        notes: notes.map((n) => n.trim()).filter((n) => n !== ''),
        items,
        totalAmount,
      });
      if (p) {
        void message.success(`报价单已导出：${p}`);
        onClose();
      }
    } catch (e) {
      void message.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="导出报价单（Word）"
      open={open}
      onOk={() => void submit()}
      onCancel={onClose}
      okText="导出"
      cancelText="取消"
      confirmLoading={loading}
      width={720}
      destroyOnClose
    >
      <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 12 }}>
        以下内容按需填写，留空的栏目不会出现在报价单中。
      </div>
      <Form form={form} layout="vertical">
        <Space size={16} style={{ display: 'flex' }} wrap>
          <Form.Item name="customerName" label="客户单位全称" style={{ width: 300 }}>
            <Input placeholder="留空则不显示" />
          </Form.Item>
          <Form.Item name="contact" label="对接人" style={{ width: 180 }}>
            <Input placeholder="留空则不显示" />
          </Form.Item>
          <Form.Item name="phone" label="联系电话（客户）" style={{ width: 200 }}>
            <Input placeholder="留空则不显示" />
          </Form.Item>
        </Space>
        <Space size={16} style={{ display: 'flex' }} wrap>
          <Form.Item name="address" label="客户地址" style={{ width: 420 }}>
            <Input placeholder="留空则不显示" />
          </Form.Item>
          <Form.Item name="date" label="报价日期" style={{ width: 180 }}>
            <DatePicker style={{ width: '100%' }} placeholder="留空则不显示" />
          </Form.Item>
          <Form.Item name="validityDays" label="报价有效期（天）" style={{ width: 160 }}>
            <InputNumber min={0} max={3650} precision={0} style={{ width: '100%' }} placeholder="留空则不显示" />
          </Form.Item>
        </Space>
        <Space size={16} style={{ display: 'flex' }} wrap>
          <Form.Item name="salesPerson" label="报价人" style={{ width: 220 }}>
            <Input placeholder="留空则不显示" />
          </Form.Item>
          <Form.Item name="salesPhone" label="报价人电话" style={{ width: 240 }}>
            <Input placeholder="留空则不显示" />
          </Form.Item>
        </Space>

        <div style={{ marginBottom: 6, color: '#595959' }}>备注说明</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notes.map((n, i) => (
            <div key={i} style={{ display: 'flex', gap: 8 }}>
              <Input
                value={n}
                placeholder="留空则该条不显示"
                onChange={(e) => setNotes((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
              />
              <Button
                danger
                icon={<DeleteOutlined />}
                onClick={() => setNotes((prev) => prev.filter((_, j) => j !== i))}
              />
            </div>
          ))}
          <div>
            <Button icon={<PlusOutlined />} onClick={() => setNotes((prev) => [...prev, ''])}>
              添加一条备注
            </Button>
          </div>
        </div>
      </Form>
    </Modal>
  );
}
