import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Col, Descriptions, Row, Space, Statistic, Table, Tag, message } from 'antd';
import { ArrowLeftOutlined, ShopOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import type { Supplier, SupplierMaterialRow, SupplierOrderRow } from '../models';

function money(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function SupplierDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const supplierId = Number(id);
  const navigate = useNavigate();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [orders, setOrders] = useState<SupplierOrderRow[]>([]);
  const [materials, setMaterials] = useState<SupplierMaterialRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSupplier((await api.suppliers.get(supplierId)) as Supplier);
      setOrders((await api.suppliers.orders(supplierId)) as SupplierOrderRow[]);
      setMaterials((await api.suppliers.materials(supplierId)) as SupplierMaterialRow[]);
    } catch (e) {
      void message.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalAmount = orders.reduce((acc, o) => acc + (o.amount ?? 0), 0);

  if (!supplier) return <Card loading={loading} />;

  return (
    <Card
      loading={loading}
      title={
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/suppliers')} />
          <ShopOutlined style={{ color: '#52c41a' }} />
          <span>{supplier.name}</span>
          {supplier.shortName && <Tag>{supplier.shortName}</Tag>}
        </Space>
      }
      extra={
        <Space>
          <Button onClick={() => navigate('/suppliers')}>返回列表</Button>
        </Space>
      }
    >
      <Descriptions bordered size="small" column={3} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="供应商全称">{supplier.name}</Descriptions.Item>
        <Descriptions.Item label="简称">{supplier.shortName ?? '-'}</Descriptions.Item>
        <Descriptions.Item label="联系人">{supplier.contact ?? '-'}</Descriptions.Item>
        <Descriptions.Item label="电话">{supplier.phone ?? '-'}</Descriptions.Item>
        <Descriptions.Item label="地址" span={2}>
          {supplier.address ?? '-'}
        </Descriptions.Item>
        <Descriptions.Item label="备注" span={3}>
          {supplier.remark ?? '-'}
        </Descriptions.Item>
      </Descriptions>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card size="small" bordered={false} style={{ background: '#f6ffed', borderRadius: 10 }}>
            <Statistic title="涉及订单" value={orders.length} suffix="个" />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" bordered={false} style={{ background: '#e6f4ff', borderRadius: 10 }}>
            <Statistic title="供货物料" value={materials.length} suffix="种" />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" bordered={false} style={{ background: '#fff7e6', borderRadius: 10 }}>
            <Statistic title="累计含税金额" value={money(totalAmount)} prefix="¥" />
          </Card>
        </Col>
      </Row>

      <Card
        size="small"
        title={`涉及的订单（${orders.length}）`}
        style={{ marginBottom: 16 }}
        extra={<span style={{ color: '#999', fontSize: 12 }}>只统计使用该供应商物料的订单</span>}
      >
        <Table<SupplierOrderRow>
          rowKey="orderId"
          size="small"
          pagination={false}
          dataSource={orders}
          locale={{ emptyText: '该供应商的物料还没有被订单使用' }}
          columns={[
            {
              title: '订单编号',
              dataIndex: 'orderNo',
              render: (v: string, r) => <a onClick={() => navigate(`/orders/${r.orderId}`)}>{v}</a>,
            },
            { title: '客户', dataIndex: 'customerName' },
            { title: '订单日期', dataIndex: 'orderDate', width: 110, render: (v: string | null) => v ?? '未填写' },
            {
              title: '订单状态',
              dataIndex: 'statusName',
              width: 120,
              render: (v: string, r) => <Tag color={r.statusColor}>{v}</Tag>,
            },
            { title: '供货物料条目', dataIndex: 'itemCount', width: 110, align: 'right' as const },
            {
              title: '本次供货含税金额',
              dataIndex: 'amount',
              width: 160,
              align: 'right' as const,
              render: (v: number) => money(v),
            },
          ]}
        />
      </Card>

      <Card size="small" title={`供货物料（${materials.length}）`}>
        <Table<SupplierMaterialRow>
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={materials}
          locale={{ emptyText: '还没有关联物料（可在「物料管理」里选择该供应商）' }}
          columns={[
            { title: '物料编码', dataIndex: 'code', width: 140 },
            { title: '物料名称', dataIndex: 'name', width: 160 },
            { title: '料号规格', dataIndex: 'spec', width: 160, render: (v: string | null) => v ?? '-' },
            { title: '品牌', dataIndex: 'brand', width: 110, render: (v: string | null) => v ?? '-' },
            {
              title: '进货价',
              dataIndex: 'purchasePrice',
              width: 110,
              align: 'right' as const,
              render: (v: number | null) => (v == null ? '-' : v.toFixed(2)),
            },
            {
              title: '出货价',
              dataIndex: 'salePrice',
              width: 110,
              align: 'right' as const,
              render: (v: number | null) => (v == null ? '-' : v.toFixed(2)),
            },
            { title: '关联订单数', dataIndex: 'orderCount', width: 110, align: 'right' as const },
            {
              title: '状态',
              dataIndex: 'isActive',
              width: 90,
              render: (v: boolean) => (v ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>),
            },
          ]}
        />
      </Card>
    </Card>
  );
}
