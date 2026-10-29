import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Space,
  Tag,
  message,
} from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, ShopOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import type { Page, SupplierListRow } from '../models';
import { matchesPinyin } from '../utils/pinyin';

export function SuppliersPage(): JSX.Element {
  const navigate = useNavigate();
  const [rows, setRows] = useState<SupplierListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<SupplierListRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = (await api.suppliers.list({ search: search || undefined, page: 1, pageSize: 1000 })) as Page<SupplierListRow>;
      setRows(r.rows);
      setTotal(r.total);
    } catch (e) {
      void message.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = (): void => {
    setEditing(null);
    form.resetFields();
    setCreating(true);
  };

  const openEdit = (row: SupplierListRow): void => {
    setEditing(row);
    form.setFieldsValue(row);
    setCreating(true);
  };

  const submit = async (): Promise<void> => {
    const values = await form.validateFields();
    try {
      if (editing) {
        await api.suppliers.update(editing.id, values);
        void message.success('供应商已保存');
      } else {
        await api.suppliers.create(values);
        void message.success('供应商已创建');
      }
      setCreating(false);
      void load();
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  const doDelete = async (row: SupplierListRow): Promise<void> => {
    try {
      await api.suppliers.remove(row.id);
      void message.success('供应商已删除');
      void load();
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  // 服务端已按关键字过滤；再补一层拼音/首字母匹配（支持输入 csdfr 这类缩写）
  const visible = rows.filter((r) => matchesPinyin(search, r.name, r.shortName, r.contact));

  return (
    <Card
      title={`供应商管理（${total}）`}
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建供应商
          </Button>
        </Space>
      }
    >
      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search
          placeholder="搜索供应商名称 / 简称 / 联系人（支持拼音，如 csdfr）"
          allowClear
          style={{ width: 360 }}
          onSearch={(v) => setSearch(v)}
        />
        <span style={{ color: '#999', fontSize: 12 }}>供应商 = 给我们和客户供应芯片的公司</span>
      </Space>

      {visible.length === 0 && !loading ? (
        <Empty description="还没有供应商，点击右上角「新建供应商」开始" />
      ) : (
        <Row gutter={[16, 16]}>
          {visible.map((s) => (
            <Col key={s.id} xs={24} sm={12} md={8} xl={6}>
              <Card
                hoverable
                loading={loading}
                bodyStyle={{ padding: 16 }}
                onClick={() => navigate(`/suppliers/${s.id}`)}
              >
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 8,
                      background: '#f6ffed',
                      color: '#52c41a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <ShopOutlined />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.name}>
                      {s.name}
                    </div>
                    <div style={{ color: '#888', fontSize: 12 }}>{s.shortName ? `简称：${s.shortName}` : '　'}</div>
                  </div>
                </div>
                <div style={{ marginTop: 12, color: '#666', fontSize: 12, lineHeight: 1.8 }}>
                  <div>联系人：{s.contact || '未填写'}</div>
                  <div>电话：{s.phone || '未填写'}</div>
                  <div>地址：{s.address || '未填写'}</div>
                  <div>
                    关联物料：<Tag color="green">{s.materialCount}</Tag>
                  </div>
                </div>
                <div
                  style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Space size={4}>
                    <Button size="small" onClick={() => navigate(`/suppliers/${s.id}`)}>详情</Button>
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(s)} />
                    <Popconfirm
                      title={`删除供应商「${s.name}」`}
                      okText="确认删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => void doDelete(s)}
                    >
                      <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Modal
        title={editing ? '编辑供应商' : '新建供应商'}
        open={creating}
        onOk={() => void submit()}
        onCancel={() => setCreating(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="供应商名称" rules={[{ required: true, message: '请输入供应商名称' }]}>
            <Input autoFocus />
          </Form.Item>
          <Form.Item name="shortName" label="简称">
            <Input />
          </Form.Item>
          <Form.Item name="contact" label="联系人">
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="电话">
            <Input />
          </Form.Item>
          <Form.Item name="address" label="地址">
            <Input />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
