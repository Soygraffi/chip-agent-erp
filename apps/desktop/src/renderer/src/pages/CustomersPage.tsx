import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Avatar,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
  message,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  PictureOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
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
  const [search, setSearch] = useState('');
  const [typeId, setTypeId] = useState<number | null>(null);
  const [isKey, setIsKey] = useState<boolean | null>(null);
  const [types, setTypes] = useState<DictOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<CustomerListRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [logoUrls, setLogoUrls] = useState<Record<number, string>>({});
  const [editLogoUrl, setEditLogoUrl] = useState<string | null>(null);
  const [form] = Form.useForm();
  const dragIndex = useRef<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = (await api.customers.list({
        search: search || undefined,
        typeId,
        isKey,
        page: 1,
        pageSize: 1000,
      })) as Page<CustomerListRow>;
      setRows(r.rows);
      setTotal(r.total);
      const entries = await Promise.all(
        r.rows
          .filter((c) => !!c.logoPath)
          .map(async (c) => {
            try {
              const u = await api.attachments.url(c.logoPath as string);
              return [c.id, u.url] as const;
            } catch {
              return [c.id, ''] as const;
            }
          }),
      );
      setLogoUrls(Object.fromEntries(entries.filter(([, u]) => u)));
    } catch (e) {
      void message.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [search, typeId, isKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void api.dicts.list('customer_type').then((r) => setTypes(r as DictOption[]));
  }, []);

  const openCreate = (): void => {
    setEditing(null);
    setEditLogoUrl(null);
    form.resetFields();
    setCreating(true);
  };

  const openEdit = async (row: CustomerListRow): Promise<void> => {
    setEditing(row);
    form.setFieldsValue({
      name: row.name,
      shortName: row.shortName,
      typeId: row.typeId,
      address: row.address,
      isKey: row.isKey,
      remark: row.remark,
    });
    setEditLogoUrl(row.logoPath ? ((await api.attachments.url(row.logoPath).catch(() => null))?.url ?? null) : null);
    setCreating(true);
  };

  const submit = async (): Promise<void> => {
    const values = await form.validateFields();
    try {
      if (editing) {
        await api.customers.update(editing.id, values);
        void message.success('客户已保存');
      } else {
        const id = await api.customers.create(values);
        void message.success('客户已创建，可在卡片上上传 Logo');
        void id;
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

  const uploadLogo = async (row: CustomerListRow, forEdit = false): Promise<void> => {
    try {
      const r = await api.customers.uploadLogo(row.id);
      if (r) {
        void message.success('Logo 已更新');
        if (forEdit) {
          const u = await api.attachments.url(r.storedPath);
          setEditLogoUrl(u.url);
        }
        void load();
      }
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  const clearLogo = async (row: CustomerListRow, forEdit = false): Promise<void> => {
    try {
      await api.customers.clearLogo(row.id);
      if (forEdit) setEditLogoUrl(null);
      void load();
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  const onDrop = async (index: number): Promise<void> => {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from == null || from === index) return;
    const next = [...rows];
    const [moved] = next.splice(from, 1);
    next.splice(index, 0, moved);
    setRows(next);
    try {
      await api.customers.reorder(next.map((c) => c.id));
    } catch (e) {
      void message.error(errorMessage(e));
      void load();
    }
  };

  return (
    <Card
      title={`客户管理（${total}）`}
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建客户
          </Button>
        </Space>
      }
    >
      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search
          placeholder="搜索客户全称 / 简称"
          allowClear
          style={{ width: 260 }}
          onSearch={(v) => setSearch(v)}
        />
        <Select
          allowClear
          placeholder="客户类型"
          style={{ width: 140 }}
          options={types.map((t) => ({ value: t.id, label: t.name }))}
          onChange={(v) => setTypeId(v ?? null)}
        />
        <Select
          allowClear
          placeholder="是否重点客户"
          style={{ width: 140 }}
          options={[
            { value: true, label: '重点客户' },
            { value: false, label: '普通客户' },
          ]}
          onChange={(v) => setIsKey(v ?? null)}
        />
        <span style={{ color: '#999', fontSize: 12 }}>拖动卡片可调整客户前后顺序，自动保存</span>
      </Space>

      {rows.length === 0 && !loading ? (
        <Empty description="还没有客户，点击右上角「新建客户」开始" />
      ) : (
        <Row gutter={[16, 16]}>
          {rows.map((c, index) => (
            <Col key={c.id} xs={24} sm={12} md={8} xl={6}>
              <div
                draggable
                onDragStart={() => {
                  dragIndex.current = index;
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  void onDrop(index);
                }}
                style={{ cursor: 'grab' }}
              >
                <Card
                  hoverable
                  loading={loading}
                  className={c.isKey ? 'customer-card customer-card-key' : 'customer-card'}
                  onClick={() => navigate(`/customers/${c.id}`)}
                  bodyStyle={{ padding: 16 }}
                >
                  <div style={{ display: 'flex', gap: 12 }}>
                    <Avatar
                      shape="square"
                      size={56}
                      src={logoUrls[c.id] || undefined}
                      icon={<PictureOutlined />}
                      style={{ flexShrink: 0, background: '#f0f5ff', color: '#1677ff' }}
                    >
                      {!logoUrls[c.id] ? c.name.slice(0, 2) : null}
                    </Avatar>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 15,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={c.name}
                      >
                        {c.name}
                      </div>
                      <div style={{ color: '#888', fontSize: 12, marginBottom: 6 }}>
                        {c.shortName ? `简称：${c.shortName}` : '　'}
                      </div>
                      <Space size={4} wrap>
                        {c.isKey && <Tag color="gold">重点</Tag>}
                        <Tag>{c.typeName ?? '未分类'}</Tag>
                      </Space>
                    </div>
                  </div>

                  <div style={{ marginTop: 12, color: '#666', fontSize: 12, lineHeight: 1.8 }}>
                    <div>微信群：{c.wechatGroupCount} 个</div>
                    <div>
                      订单：{c.orderCount} 个（跟进中 {c.activeOrderCount}）
                    </div>
                    <div>地址：{c.address || '未填写'}</div>
                  </div>

                  <div
                    style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Space size={4}>
                      <Tooltip title="上传/更换 Logo">
                        <Button size="small" icon={<PictureOutlined />} onClick={() => void uploadLogo(c)} />
                      </Tooltip>
                      {c.logoPath && (
                        <Popconfirm title="移除 Logo" onConfirm={() => void clearLogo(c)}>
                          <Button size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      )}
                      <Button size="small" onClick={() => navigate(`/customers/${c.id}`)}>
                        查看
                      </Button>
                    </Space>
                    <Space size={4}>
                      <Button size="small" icon={<EditOutlined />} onClick={() => void openEdit(c)} />
                      <Popconfirm
                        title={`删除客户「${c.name}」`}
                        description={`该客户下存在 ${c.orderCount} 个订单，删除后订单数据将保留。`}
                        okText="确认删除"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => void doDelete(c)}
                      >
                        <Button size="small" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  </div>
                </Card>
              </div>
            </Col>
          ))}
        </Row>
      )}

      <Modal
        title={editing ? '编辑客户' : '新建客户'}
        open={creating}
        onOk={() => void submit()}
        onCancel={() => setCreating(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          {editing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <Avatar
                shape="square"
                size={56}
                src={editLogoUrl || undefined}
                icon={<PictureOutlined />}
                style={{ background: '#f0f5ff', color: '#1677ff' }}
              />
              <Space>
                <Button size="small" icon={<PictureOutlined />} onClick={() => void uploadLogo(editing, true)}>
                  上传/更换 Logo
                </Button>
                {editLogoUrl && (
                  <Popconfirm title="移除 Logo" onConfirm={() => void clearLogo(editing, true)}>
                    <Button size="small" danger>
                      移除
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            </div>
          )}
          <Form.Item name="name" label="客户全称" rules={[{ required: true, message: '请输入客户全称' }]}>
            <Input autoFocus />
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
          {!editing && <div style={{ color: '#999' }}>创建后可在客户卡片上上传公司 Logo。</div>}
        </Form>
      </Modal>
    </Card>
  );
}
