import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  ColorPicker,
  Form,
  Input,
  InputNumber,
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
import { PlusOutlined } from '@ant-design/icons';
import { api, errorMessage } from '../api';

interface DictItem {
  id: number;
  category: string;
  name: string;
  color: string | null;
  sortOrder: number;
  isSystem: boolean;
  enabled: boolean;
}
interface StatusItem {
  id: number;
  name: string;
  color: string;
  sortOrder: number;
  isTerminal: boolean;
  terminalResult: string | null;
  isDefaultCompleted: boolean;
  isSystem: boolean;
  enabled: boolean;
}
interface TemplateItem {
  id: number;
  name: string;
  code: string | null;
  sortOrder: number;
  isSystem: boolean;
  enabled: boolean;
  remark: string | null;
}
interface RateItem {
  currencyId: number;
  currencyName: string;
  rate: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  customer_type: '客户类型',
  order_type: '订单类型',
  payment_method: '付款方式',
  currency: '币种',
};

function DictTab({ category }: { category: string }): JSX.Element {
  const [rows, setRows] = useState<DictItem[]>([]);
  const [editing, setEditing] = useState<DictItem | null>(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(() => {
    void api.dicts.list(category).then((r) => setRows(r as DictItem[]));
  }, [category]);
  useEffect(load, [load]);

  const submit = async (): Promise<void> => {
    const values = await form.validateFields();
    try {
      if (editing) {
        await api.dicts.update(editing.id, values);
      } else {
        await api.dicts.create({ category, ...values });
      }
      setOpen(false);
      load();
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  return (
    <div>
      <Button
        type="primary"
        size="small"
        icon={<PlusOutlined />}
        style={{ marginBottom: 12 }}
        onClick={() => {
          setEditing(null);
          form.resetFields();
          setOpen(true);
        }}
      >
        新增{category === 'currency' ? '币种' : '项'}
      </Button>
      <Table<DictItem>
        rowKey="id"
        size="small"
        dataSource={rows}
        pagination={false}
        columns={[
          { title: '名称', dataIndex: 'name' },
          { title: '排序', dataIndex: 'sortOrder', width: 80 },
          { title: '启用', dataIndex: 'enabled', width: 70, render: (v: boolean) => (v ? '是' : '否') },
          { title: '系统预置', dataIndex: 'isSystem', width: 90, render: (v: boolean) => (v ? '是' : '否') },
          {
            title: '操作',
            width: 140,
            render: (_, r) => (
              <Space>
                <a
                  onClick={() => {
                    setEditing(r);
                    form.setFieldsValue({ name: r.name, sortOrder: r.sortOrder, enabled: r.enabled });
                    setOpen(true);
                  }}
                >
                  编辑
                </a>
                <Popconfirm title="删除该字典项（被引用时将被拒绝）" onConfirm={() => void api.dicts.remove(r.id).then(load).catch((e) => void message.error(errorMessage(e)))}>
                  <a style={{ color: '#ff4d4f' }}>删除</a>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal title={editing ? '编辑' : '新增'} open={open} onOk={() => void submit()} onCancel={() => setOpen(false)} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序值">
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function StatusTab(): JSX.Element {
  const [rows, setRows] = useState<StatusItem[]>([]);
  const [editing, setEditing] = useState<StatusItem | null>(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(() => {
    void api.statuses.list().then((r) => setRows(r as StatusItem[]));
  }, []);
  useEffect(load, [load]);

  const submit = async (): Promise<void> => {
    const values = await form.validateFields();
    const payload = {
      ...values,
      color: typeof values.color === 'string' ? values.color : values.color?.toHexString?.() ?? values.color,
      terminalResult: values.isTerminal ? values.terminalResult ?? null : null,
    };
    try {
      if (editing) {
        await api.statuses.update(editing.id, payload);
      } else {
        await api.statuses.create(payload);
      }
      setOpen(false);
      load();
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  return (
    <div>
      <Button
        type="primary"
        size="small"
        icon={<PlusOutlined />}
        style={{ marginBottom: 12 }}
        onClick={() => {
          setEditing(null);
          form.resetFields();
          form.setFieldsValue({ isTerminal: false, isDefaultCompleted: false, enabled: true, color: '#1677FF' });
          setOpen(true);
        }}
      >
        新增状态
      </Button>
      <Table<StatusItem>
        rowKey="id"
        size="small"
        dataSource={rows}
        pagination={false}
        columns={[
          { title: '名称', dataIndex: 'name' },
          { title: '颜色', dataIndex: 'color', width: 80, render: (v: string) => <Tag color={v}>{v}</Tag> },
          { title: '排序', dataIndex: 'sortOrder', width: 70 },
          { title: '终态', dataIndex: 'isTerminal', width: 70, render: (v: boolean) => (v ? '是' : '否') },
          { title: '终态结果', dataIndex: 'terminalResult', width: 90, render: (v: string | null) => (v === 'completed' ? '完成' : v === 'cancelled' ? '取消' : '-') },
          { title: '默认完成', dataIndex: 'isDefaultCompleted', width: 90, render: (v: boolean) => (v ? <Tag color="green">是</Tag> : '否') },
          { title: '启用', dataIndex: 'enabled', width: 70, render: (v: boolean) => (v ? '是' : '否') },
          { title: '系统预置', dataIndex: 'isSystem', width: 90, render: (v: boolean) => (v ? '是' : '否') },
          {
            title: '操作',
            width: 140,
            render: (_, r) => (
              <Space>
                <a
                  onClick={() => {
                    setEditing(r);
                    form.setFieldsValue({
                      name: r.name,
                      color: r.color,
                      sortOrder: r.sortOrder,
                      isTerminal: r.isTerminal,
                      terminalResult: r.terminalResult,
                      isDefaultCompleted: r.isDefaultCompleted,
                      enabled: r.enabled,
                    });
                    setOpen(true);
                  }}
                >
                  编辑
                </a>
                <Popconfirm title="删除该状态（被引用或系统预置将被拒绝）" onConfirm={() => void api.statuses.remove(r.id).then(load).catch((e) => void message.error(errorMessage(e)))}>
                  <a style={{ color: '#ff4d4f' }}>删除</a>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal title={editing ? '编辑状态' : '新增状态'} open={open} onOk={() => void submit()} onCancel={() => setOpen(false)} destroyOnClose width={480}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="状态名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="color" label="颜色" rules={[{ required: true, message: '请选择颜色' }]}>
            <ColorPicker showText />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序值">
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="isTerminal" label="是否终态" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(p, c) => p.isTerminal !== c.isTerminal}>
            {({ getFieldValue }) =>
              getFieldValue('isTerminal') ? (
                <Form.Item name="terminalResult" label="终态结果（完成/取消）" rules={[{ required: true, message: '请选择终态结果' }]}>
                  <Select
                    options={[
                      { value: 'completed', label: '完成' },
                      { value: 'cancelled', label: '取消' },
                    ]}
                  />
                </Form.Item>
              ) : null
            }
          </Form.Item>
          <Form.Item name="isDefaultCompleted" label="设为自动完结的默认完成状态（全局唯一）" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function TemplateTab(): JSX.Element {
  const [rows, setRows] = useState<TemplateItem[]>([]);
  const [editing, setEditing] = useState<TemplateItem | null>(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(() => {
    void api.templates.list().then((r) => setRows(r as TemplateItem[]));
  }, []);
  useEffect(load, [load]);

  const submit = async (): Promise<void> => {
    const values = await form.validateFields();
    try {
      if (editing) {
        await api.templates.update(editing.id, values);
      } else {
        await api.templates.create(values);
      }
      setOpen(false);
      load();
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  return (
    <div>
      <Button
        type="primary"
        size="small"
        icon={<PlusOutlined />}
        style={{ marginBottom: 12 }}
        onClick={() => {
          setEditing(null);
          form.resetFields();
          setOpen(true);
        }}
      >
        新增节点模板
      </Button>
      <Table<TemplateItem>
        rowKey="id"
        size="small"
        dataSource={rows}
        pagination={false}
        columns={[
          { title: '名称', dataIndex: 'name' },
          { title: '语义码', dataIndex: 'code', width: 110, render: (v: string | null) => v ?? '-' },
          { title: '排序', dataIndex: 'sortOrder', width: 70 },
          { title: '启用', dataIndex: 'enabled', width: 70, render: (v: boolean) => (v ? '是' : '否') },
          { title: '系统预置', dataIndex: 'isSystem', width: 90, render: (v: boolean) => (v ? '是' : '否') },
          { title: '备注', dataIndex: 'remark' },
          {
            title: '操作',
            width: 140,
            render: (_, r) => (
              <Space>
                <a
                  onClick={() => {
                    setEditing(r);
                    form.setFieldsValue({ name: r.name, code: r.code, sortOrder: r.sortOrder, enabled: r.enabled, remark: r.remark });
                    setOpen(true);
                  }}
                >
                  编辑
                </a>
                <Popconfirm title="删除该模板（被订单节点引用时将被拒绝）" onConfirm={() => void api.templates.remove(r.id).then(load).catch((e) => void message.error(errorMessage(e)))}>
                  <a style={{ color: '#ff4d4f' }}>删除</a>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal title={editing ? '编辑节点模板' : '新增节点模板'} open={open} onOk={() => void submit()} onCancel={() => setOpen(false)} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="code" label="语义码" extra="内置语义码用于统计口径（如 arrival/ship 驱动待发货），自定义模板可留空；不可与其他模板重复">
            <Input />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序值">
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function RateTab(): JSX.Element {
  const [rows, setRows] = useState<RateItem[]>([]);
  const load = useCallback(() => {
    void api.rates.list().then((r) => setRows(r as RateItem[]));
  }, []);
  useEffect(load, [load]);

  return (
    <Table<RateItem>
      rowKey="currencyId"
      size="small"
      dataSource={rows}
      pagination={false}
      columns={[
        { title: '币种', dataIndex: 'currencyName' },
        { title: '对人民币汇率', dataIndex: 'rate' },
        {
          title: '操作',
          width: 200,
          render: (_, r) => (
            <Space>
              <InputNumber
                defaultValue={r.rate}
                precision={6}
                min={0.000001}
                style={{ width: 140 }}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v > 0) {
                    void api.rates.upsert(r.currencyId, v).then(() => {
                      void message.success('汇率已更新（仅影响之后新建订单）');
                      load();
                    });
                  }
                }}
              />
            </Space>
          ),
        },
      ]}
    />
  );
}

function NumberingTab(): JSX.Element {
  const [form] = Form.useForm();
  const [cfg, setCfg] = useState<{ prefix: string; dateFormat: string; seqWidth: number } | null>(null);

  useEffect(() => {
    void api.settings.getOrderNoConfig().then((r) => {
      setCfg(r as { prefix: string; dateFormat: string; seqWidth: number });
      form.setFieldsValue(r as never);
    });
  }, [form]);

  const save = async (): Promise<void> => {
    const values = await form.validateFields();
    try {
      const r = (await api.settings.setOrderNoConfig(values)) as { prefix: string; dateFormat: string; seqWidth: number };
      setCfg(r);
      void message.success('编号规则已保存');
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  return (
    <Card size="small" title="订单编号规则（流水按日重置，不可配）" style={{ maxWidth: 480 }}>
      <Form form={form} layout="vertical">
        <Form.Item name="prefix" label="前缀" rules={[{ required: true, message: '请输入前缀' }]}>
          <Input placeholder="XS" />
        </Form.Item>
        <Form.Item name="dateFormat" label="日期格式">
          <Select
            options={[
              { value: 'YYYYMMDD', label: 'YYYYMMDD（如 20261028）' },
              { value: 'YYMMDD', label: 'YYMMDD（如 261028）' },
              { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD（如 2026-10-28）' },
            ]}
          />
        </Form.Item>
        <Form.Item name="seqWidth" label="流水位数（2-6）">
          <InputNumber min={2} max={6} precision={0} style={{ width: '100%' }} />
        </Form.Item>
        <div style={{ color: '#999', marginBottom: 12 }}>
          示例：{cfg ? `${cfg.prefix}${cfg.dateFormat === 'YYMMDD' ? '261028' : cfg.dateFormat === 'YYYY-MM-DD' ? '2026-10-28' : '20261028'}${'1'.padStart(cfg.seqWidth, '0')}` : ''}
        </div>
        <Button type="primary" onClick={() => void save()}>
          保存
        </Button>
      </Form>
    </Card>
  );
}

function StorageTab(): JSX.Element {
  const [info, setInfo] = useState<{ dataDir: string; backupsDir: string; dbSize: number; attachmentsSize: number } | null>(null);
  const [newDir, setNewDir] = useState('');
  const [backupDir, setBackupDir] = useState('');

  const load = useCallback(() => {
    void api.settings.storageInfo().then((r) => setInfo(r as never));
  }, []);
  useEffect(load, [load]);

  const migrate = async (): Promise<void> => {
    if (!newDir.trim()) return;
    try {
      await api.settings.migrateDataDir(newDir.trim());
      void message.success('数据目录已迁移（旧目录保留作回退）');
      setNewDir('');
      load();
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <Card size="small" title="存储信息">
        <div style={{ marginBottom: 8 }}>数据目录：{info?.dataDir}</div>
        <div style={{ marginBottom: 8 }}>数据库大小：{info ? (info.dbSize / 1024).toFixed(1) : 0} KB</div>
        <div style={{ marginBottom: 8 }}>附件总大小：{info ? (info.attachmentsSize / 1024).toFixed(1) : 0} KB</div>
        <div style={{ marginBottom: 16 }}>备份默认目录：{info?.backupsDir}</div>
        <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
          <Input placeholder="新数据目录路径（如 D:\ERP数据）" value={newDir} onChange={(e) => setNewDir(e.target.value)} />
          <Popconfirm
            title="迁移数据目录"
            description="将复制现有数据库与附件到新目录并切换，旧目录保留。"
            onConfirm={() => void migrate()}
          >
            <Button type="primary">迁移</Button>
          </Popconfirm>
        </Space.Compact>
        <Space.Compact style={{ width: '100%' }}>
          <Input placeholder="备份默认目录（留空 = 数据目录\backups）" value={backupDir} onChange={(e) => setBackupDir(e.target.value)} />
          <Button
            onClick={() =>
              void api.settings.setBackupDir(backupDir.trim()).then(() => {
                void message.success('备份目录已设置');
                load();
              })
            }
          >
            设置
          </Button>
        </Space.Compact>
      </Card>
    </div>
  );
}

export function SettingsPage(): JSX.Element {
  return (
    <Card title="系统设置">
      <Tabs
        items={[
          { key: 'dict', label: '客户类型', children: <DictTab category="customer_type" /> },
          { key: 'order_type', label: '订单类型', children: <DictTab category="order_type" /> },
          { key: 'payment_method', label: '付款方式', children: <DictTab category="payment_method" /> },
          { key: 'status', label: '订单状态（语义）', children: <StatusTab /> },
          { key: 'template', label: '节点模板', children: <TemplateTab /> },
          { key: 'numbering', label: '编号规则', children: <NumberingTab /> },
          { key: 'storage', label: '存储设置', children: <StorageTab /> },
        ]}
      />
    </Card>
  );
}
