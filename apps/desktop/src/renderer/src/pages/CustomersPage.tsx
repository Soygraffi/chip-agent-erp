import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  message,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import type { CustomerListRow, Page } from '../models';

interface DictOption {
  id: number;
  name: string;
}

export function CustomersPage(): JSX.Element {
  const navigate = useNavigate();
  const [rows, setRows] = useState<CustomerListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [typeId, setTypeId] = useState<number | null>(null);
  const [isKey, setIsKey] = useState<boolean | null>(null);
  const [types, setTypes] = useState<DictOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<CustomerListRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = (await api.customers.list({
        search: search || undefined,
        typeId,
        isKey,
        page,
        pageSize,
      })) as Page<CustomerListRow>;
      setRows(r.rows);
      setTotal(r.total);
    } catch (e) {
      void message.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [search, typeId, isKey, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void api.dicts.list('customer_type').then((r) => setTypes(r as DictOption[]));
  }, []);

  const openCreate = (): void => {
    setEditing(null);
    setCreating(true);
    form.resetFields();
  };

  const openEdit = (row: CustomerListRow): void => {
    setEditing(row);
    setCreating(true);
    form.setFieldsValue({
      name: row.name,
      shortName: row.shortName,
      typeId: row.typeId,
      address: row.address,
      isKey: row.isKey,
      remark: row.remark,
    });
  };

  const submit = async (): Promise<void> => {
    const values = await form.validateFields();
    try {
      if (editing) {
        await api.customers.update(editing.id, values);
        void message.success('客户已保存');
      } else {
        await api.customers.create(values);
        void message.success('客户已创建');
      }
      setCreating(false);
      void load();
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  const doDelete = async (row: CustomerListRow): Promise<void> => {
    try {
      const r = await api.customers.softDelete(row.id);
      void message.success(`已删除客户（保留 ${r.orderCount} 个订单）`);
      void load();
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  return (
    <Card
      title="客户管理"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新建客户
        </Button>
      }
    >
      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search
          placeholder="搜索客户全称/简称/联系人"
          allowClear
          style={{ width: 260 }}
          onSearch={(v) => {
            setPage(1);
            setSearch(v);
          }}
        />
        <Select
          allowClear
          placeholder="客户类型"
          style={{ width: 140 }}
          options={types.map((t) => ({ value: t.id, label: t.name }))}
          onChange={(v) => {
            setPage(1);
            setTypeId(v ?? null);
          }}
        />
        <Select
          allowClear
          placeholder="是否重点客户"
          style={{ width: 140 }}
          options={[
            { value: true, label: '重点客户' },
            { value: false, label: '普通客户' },
          ]}
          onChange={(v) => {
            setPage(1);
            setIsKey(v ?? null);
          }}
        />
      </Space>
      <Table<CustomerListRow>
        rowKey="id"
        loading={loading}
        dataSource={rows}
        rowClassName={(r) => (r.isKey ? 'row-key-customer' : '')}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
        columns={[
          {
            title: '客户名称',
            dataIndex: 'name',
            render: (v: string, r) => (
              <Space>
                <a onClick={() => navigate(`/customers/${r.id}`)}>{v}</a>
                {r.isKey && <Tag color="gold">重点</Tag>}
              </Space>
            ),
          },
          { title: '客户类型', dataIndex: 'typeName', width: 100 },
          { title: '微信群数', dataIndex: 'wechatGroupCount', width: 90, align: 'center' as const },
          { title: '订单总数', dataIndex: 'orderCount', width: 90, align: 'center' as const },
          { title: '跟进中订单数', dataIndex: 'activeOrderCount', width: 120, align: 'center' as const },
          {
            title: '操作',
            width: 130,
            render: (_, r) => (
              <Space>
                <a onClick={() => openEdit(r)}>编辑</a>
                <Popconfirm
                  title={`删除客户「${r.name}」`}
                  description={`该客户下存在 ${r.orderCount} 个订单，删除后订单数据将保留。此操作即时生效。`}
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
        title={editing ? '编辑客户' : '新建客户'}
        open={creating}
        onOk={() => void submit()}
        onCancel={() => setCreating(false)}
        destroyOnClose
      >
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
          <div style={{ color: '#999' }}>微信群及群成员请在客户详情页维护。</div>
        </Form>
      </Modal>
    </Card>
  );
}
