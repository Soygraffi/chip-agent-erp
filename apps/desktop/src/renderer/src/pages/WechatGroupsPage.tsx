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
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { api, errorMessage } from '../api';
import type { WechatGroupWithCustomer, WechatMember } from '../models';

interface CustomerOption {
  id: number;
  name: string;
}

export function WechatGroupsPage(): JSX.Element {
  const [groups, setGroups] = useState<WechatGroupWithCustomer[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [members, setMembers] = useState<Record<number, WechatMember[]>>({});
  const [loading, setLoading] = useState(false);
  const [groupModal, setGroupModal] = useState<{ mode: 'create' | 'edit'; group: WechatGroupWithCustomer | null } | null>(null);
  const [memberModal, setMemberModal] = useState<{ groupId: number; member: WechatMember | null } | null>(null);
  const [groupForm] = Form.useForm();
  const [memberForm] = Form.useForm();

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

  const submitGroup = async (): Promise<void> => {
    const values = await groupForm.validateFields();
    try {
      if (groupModal?.mode === 'edit' && groupModal.group) {
        await api.wechat.updateGroup(groupModal.group.id, { name: values.name, remark: values.remark ?? null });
      } else if (values.customerId) {
        await api.wechat.createGroup(values.customerId, { name: values.name, remark: values.remark ?? null });
      }
      setGroupModal(null);
      void load();
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  const submitMember = async (): Promise<void> => {
    const values = await memberForm.validateFields();
    try {
      if (memberModal?.member) {
        await api.wechat.updateMember(memberModal.member.id, values);
      } else if (memberModal) {
        await api.wechat.createMember(memberModal.groupId, values);
      }
      setMemberModal(null);
      void load();
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

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
              setGroupModal({ mode: 'create', group: null });
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
              locale={{ emptyText: '暂无成员，点右上角「添加成员」' }}
              columns={[
                { title: '微信号 / ID', dataIndex: 'wechatId', width: 200 },
                { title: '真实姓名', dataIndex: 'realName', width: 140, render: (v: string | null) => v ?? '-' },
                { title: '岗位', dataIndex: 'position', width: 140, render: (v: string | null) => v ?? '-' },
                { title: '备注', dataIndex: 'remark', render: (v: string | null) => v ?? '-' },
                {
                  title: '操作',
                  width: 130,
                  render: (_, m) => (
                    <Space>
                      <a
                        onClick={() => {
                          memberForm.setFieldsValue({
                            wechatId: m.wechatId,
                            realName: m.realName,
                            position: m.position,
                            remark: m.remark,
                          });
                          setMemberModal({ groupId: g.id, member: m });
                        }}
                      >
                        编辑
                      </a>
                      <Popconfirm
                        title="删除该成员"
                        onConfirm={() => void api.wechat.deleteMember(m.id).then(load).catch((e) => void message.error(errorMessage(e)))}
                      >
                        <a style={{ color: '#ff4d4f' }}>删除</a>
                      </Popconfirm>
                    </Space>
                  ),
                },
              ]}
              footer={() => (
                <Button
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    memberForm.resetFields();
                    setMemberModal({ groupId: g.id, member: null });
                  }}
                >
                  添加成员
                </Button>
              )}
            />
          ),
        }}
        columns={[
          { title: '群名称', dataIndex: 'name', render: (v: string) => <Tag color="blue">{v}</Tag> },
          { title: '所属客户', dataIndex: 'customerName', width: 220 },
          { title: '群备注', dataIndex: 'remark', width: 160, render: (v: string | null) => v ?? '-' },
          {
            title: '成员数',
            dataIndex: 'memberCount',
            width: 90,
            align: 'center' as const,
            render: (v: number) => `${v} 人`,
          },
          {
            title: '操作',
            width: 160,
            render: (_, g) => (
              <Space>
                <a
                  onClick={() => {
                    groupForm.setFieldsValue({ customerId: g.customerId, name: g.name, remark: g.remark });
                    setGroupModal({ mode: 'edit', group: g });
                  }}
                >
                  编辑群
                </a>
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
        title={groupModal?.mode === 'edit' ? '编辑微信群' : '新增微信群'}
        open={!!groupModal}
        onOk={() => void submitGroup()}
        onCancel={() => setGroupModal(null)}
        destroyOnClose
      >
        <Form form={groupForm} layout="vertical">
          <Form.Item name="customerId" label="所属客户" rules={[{ required: true, message: '请选择客户' }]}>
            <Select
              showSearch
              optionFilterProp="label"
              disabled={groupModal?.mode === 'edit'}
              options={customers.map((c) => ({ value: c.id, label: c.name }))}
            />
          </Form.Item>
          <Form.Item name="name" label="群名称" rules={[{ required: true, message: '请输入群名称' }]} extra="例如：商务交流群、研发交流群">
            <Input />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={memberModal?.member ? '编辑群成员' : '添加群成员'}
        open={!!memberModal}
        onOk={() => void submitMember()}
        onCancel={() => setMemberModal(null)}
        destroyOnClose
      >
        <Form form={memberForm} layout="vertical">
          <Form.Item name="wechatId" label="群内微信号 / ID" rules={[{ required: true, message: '请输入微信号' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="realName" label="真实姓名">
            <Input />
          </Form.Item>
          <Form.Item name="position" label="岗位">
            <Input placeholder="例如：采购经理、硬件工程师" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
