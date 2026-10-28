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
  Table,
  Tag,
  message,
} from 'antd';
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { api, errorMessage } from '../api';
import type { WechatGroupWithCustomer, WechatMember } from '../models';

interface CustomerOption {
  id: number;
  name: string;
}

interface MemberRow {
  id: number; // <0 = 新增行
  wechatId: string;
  realName: string;
  company: string;
  position: string;
}

let tempId = -1;

export function WechatGroupsPage(): JSX.Element {
  const [groups, setGroups] = useState<WechatGroupWithCustomer[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [members, setMembers] = useState<Record<number, WechatMember[]>>({});
  const [loading, setLoading] = useState(false);
  const [editingGroup, setEditingGroup] = useState<WechatGroupWithCustomer | null>(null);
  const [creating, setCreating] = useState(false);
  const [memberRows, setMemberRows] = useState<MemberRow[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [groupForm] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const g = (await api.wechat.listAllGroups()) as WechatGroupWithCustomer[];
      setGroups(g);
      const map: Record<number, WechatMember[]> = {};
      for (const grp of g) {
        map[grp.id] = (await api.wechat.listMembers(grp.id)) as WechatMember[];
      }
      setMembers(map);
    } catch (e) {
      void message.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void api.customers.options().then((r) => setCustomers(r as CustomerOption[]));
  }, [load]);

  const openEdit = (g: WechatGroupWithCustomer): void => {
    setEditingGroup(g);
    setMemberSearch('');
    groupForm.setFieldsValue({ customerId: g.customerId, name: g.name, remark: g.remark });
    const rows = (members[g.id] ?? []).map((m) => ({
      id: m.id,
      wechatId: m.wechatId,
      realName: m.realName ?? '',
      company: m.company ?? '',
      position: m.position ?? '',
    }));
    setMemberRows(rows);
  };

  const saveGroup = async (): Promise<void> => {
    const values = await groupForm.validateFields();
    try {
      if (editingGroup) {
        await api.wechat.updateGroup(editingGroup.id, {
          name: values.name,
          remark: values.remark ?? null,
          customerId: values.customerId,
        });
        void message.success('微信群已保存');
        setEditingGroup(null);
      } else {
        await api.wechat.createGroup(values.customerId, { name: values.name, remark: values.remark ?? null });
        void message.success('微信群已创建，可在「编辑」中添加成员');
        setCreating(false);
      }
      void load();
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  const patchRow = (index: number, patch: Partial<MemberRow>): void => {
    setMemberRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  /** 失焦保存：新行且微信号非空 → 新建；已有行 → 更新 */
  const saveRow = async (row: MemberRow): Promise<void> => {
    if (!editingGroup) return;
    if (!row.wechatId.trim()) {
      if (row.id > 0) {
        // 清空微信号视为删除
        try {
          await api.wechat.deleteMember(row.id);
          void load();
        } catch (e) {
          void message.error(errorMessage(e));
        }
      }
      return;
    }
    try {
      if (row.id > 0) {
        await api.wechat.updateMember(row.id, {
          wechatId: row.wechatId,
          realName: row.realName || null,
          company: row.company || null,
          position: row.position || null,
        });
      } else {
        const id = await api.wechat.createMember(editingGroup.id, {
          wechatId: row.wechatId,
          realName: row.realName || null,
          company: row.company || null,
          position: row.position || null,
        });
        setMemberRows((prev) => prev.map((r) => (r === row ? { ...r, id } : r)));
      }
      void load();
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  const deleteRow = async (row: MemberRow): Promise<void> => {
    setMemberRows((prev) => prev.filter((r) => r !== row));
    if (row.id > 0) {
      try {
        await api.wechat.deleteMember(row.id);
        void load();
      } catch (e) {
        void message.error(errorMessage(e));
      }
    }
  };

  const filteredRows = memberRows.filter(
    (r) =>
      !memberSearch ||
      r.wechatId.toLowerCase().includes(memberSearch.toLowerCase()) ||
      r.realName.toLowerCase().includes(memberSearch.toLowerCase()) ||
      r.company.toLowerCase().includes(memberSearch.toLowerCase()),
  );

  return (
    <Card
      title="微信群管理"
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>
            刷新
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              groupForm.resetFields();
              setCreating(true);
            }}
          >
            新增微信群
          </Button>
        </Space>
      }
    >
      <Table<WechatGroupWithCustomer>
        rowKey="id"
        loading={loading}
        dataSource={groups}
        pagination={false}
        expandable={{
          expandedRowRender: (g) => (
            <Table<WechatMember>
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={members[g.id] ?? []}
              locale={{ emptyText: '暂无成员，点「编辑群」在表格里录入' }}
              columns={[
                { title: '微信号 / ID', dataIndex: 'wechatId', width: 180 },
                { title: '真实姓名', dataIndex: 'realName', width: 120, render: (v: string | null) => v ?? '-' },
                { title: '任职公司', dataIndex: 'company', width: 180, render: (v: string | null) => v ?? '-' },
                { title: '岗位', dataIndex: 'position', width: 140, render: (v: string | null) => v ?? '-' },
                { title: '备注', dataIndex: 'remark', render: (v: string | null) => v ?? '-' },
              ]}
            />
          ),
        }}
        columns={[
          { title: '群名称', dataIndex: 'name', render: (v: string) => <Tag color="blue">{v}</Tag> },
          { title: '所属客户', dataIndex: 'customerName', width: 220 },
          { title: '群备注', dataIndex: 'remark', width: 160, render: (v: string | null) => v ?? '-' },
          { title: '成员数', dataIndex: 'memberCount', width: 90, align: 'center' as const, render: (v: number) => `${v} 人` },
          {
            title: '操作',
            width: 220,
            render: (_, g) => (
              <Space>
                <a onClick={() => openEdit(g)}>编辑群 / 成员表</a>
                <Popconfirm
                  title="删除该微信群（群成员一并删除）"
                  onConfirm={() => void api.wechat.deleteGroup(g.id).then(load).catch((e) => void message.error(errorMessage(e)))}
                >
                  <a style={{ color: '#ff4d4f' }}>删除</a>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editingGroup ? `编辑微信群「${editingGroup.name}」` : '新增微信群'}
        open={creating || !!editingGroup}
        onOk={() => void saveGroup()}
        onCancel={() => {
          setCreating(false);
          setEditingGroup(null);
        }}
        destroyOnClose
        width={editingGroup ? 860 : 480}
      >
        <Form form={groupForm} layout="vertical">
          <Space size={16} wrap>
            <Form.Item name="customerId" label="所属客户" rules={[{ required: true, message: '请选择客户' }]}>
              <Select
                showSearch
                optionFilterProp="label"
                style={{ width: 260 }}
                options={customers.map((c) => ({ value: c.id, label: c.name }))}
              />
            </Form.Item>
            <Form.Item name="name" label="群名称" rules={[{ required: true, message: '请输入群名称' }]}>
              <Input style={{ width: 220 }} placeholder="例如：商务交流群、研发交流群" />
            </Form.Item>
            <Form.Item name="remark" label="群备注">
              <Input style={{ width: 200 }} />
            </Form.Item>
          </Space>
        </Form>

        {editingGroup && (
          <div style={{ marginTop: 8 }}>
            <Space style={{ marginBottom: 8 }}>
              <Input
                prefix={<SearchOutlined />}
                placeholder="搜索微信名 / 姓名 / 公司"
                allowClear
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                style={{ width: 240 }}
              />
              <Button
                icon={<PlusOutlined />}
                onClick={() =>
                  setMemberRows((prev) => [...prev, { id: tempId--, wechatId: '', realName: '', company: '', position: '' }])
                }
              >
                添加成员行
              </Button>
              <span style={{ color: '#999', fontSize: 12 }}>输入后点击空白处自动保存；改「所属客户」会把群转到该客户</span>
            </Space>
            <Table<MemberRow>
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={filteredRows}
              locale={{ emptyText: '暂无成员，点「添加成员行」录入' }}
              columns={[
                {
                  title: '微信号 / ID',
                  dataIndex: 'wechatId',
                  width: 170,
                  render: (_: unknown, row, index) => (
                    <Input
                      value={row.wechatId}
                      placeholder="wx_xxx"
                      onChange={(e) => patchRow(memberRows.indexOf(row), { wechatId: e.target.value })}
                      onBlur={() => void saveRow(row)}
                    />
                  ),
                },
                {
                  title: '真实姓名',
                  dataIndex: 'realName',
                  width: 130,
                  render: (_: unknown, row) => (
                    <Input
                      value={row.realName}
                      onChange={(e) => patchRow(memberRows.indexOf(row), { realName: e.target.value })}
                      onBlur={() => void saveRow(row)}
                    />
                  ),
                },
                {
                  title: '任职公司',
                  dataIndex: 'company',
                  width: 190,
                  render: (_: unknown, row) => (
                    <Input
                      value={row.company}
                      placeholder="例如：华强半导体"
                      onChange={(e) => patchRow(memberRows.indexOf(row), { company: e.target.value })}
                      onBlur={() => void saveRow(row)}
                    />
                  ),
                },
                {
                  title: '岗位',
                  dataIndex: 'position',
                  width: 150,
                  render: (_: unknown, row) => (
                    <Input
                      value={row.position}
                      placeholder="例如：采购经理"
                      onChange={(e) => patchRow(memberRows.indexOf(row), { position: e.target.value })}
                      onBlur={() => void saveRow(row)}
                    />
                  ),
                },
                {
                  title: '',
                  width: 60,
                  render: (_: unknown, row) => (
                    <Popconfirm title="删除该成员" onConfirm={() => void deleteRow(row)}>
                      <a style={{ color: '#ff4d4f' }}>删除</a>
                    </Popconfirm>
                  ),
                },
              ]}
            />
          </div>
        )}
      </Modal>
    </Card>
  );
}
