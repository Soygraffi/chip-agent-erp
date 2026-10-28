import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Col, Row, Space, Statistic, Table, Tag, Tooltip, message } from 'antd';
import { PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import * as echarts from 'echarts';
import { api, errorMessage } from '../api';
import type { DashboardStats, OrderListRow } from '../models';

export function DashboardPage(): JSX.Element {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(false);
  const pieRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStats((await api.stats.dashboard()) as DashboardStats);
    } catch (e) {
      void message.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const off = window.api.onDataChanged(() => void load());
    return off;
  }, [load]);

  useEffect(() => {
    if (!stats || !pieRef.current) return;
    const chart = echarts.init(pieRef.current);
    chart.setOption({
      tooltip: { trigger: 'item' },
      legend: { bottom: 0 },
      series: [
        {
          type: 'pie',
          radius: ['35%', '65%'],
          label: { formatter: '{b}: {c}' },
          data: stats.statusDistribution.map((s) => ({ name: s.statusName, value: s.count, itemStyle: { color: s.color } })),
        },
      ],
    });
    const onResize = (): void => chart.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.dispose();
    };
  }, [stats]);

  const overdueColumns = [
    { title: '订单编号', dataIndex: 'orderNo', render: (v: string, r: OrderListRow) => <a onClick={() => navigate(`/orders/${r.id}`)}>{v}</a> },
    { title: '客户', dataIndex: 'customerName' },
    { title: '预计交期', dataIndex: 'expectedDeliveryDate', width: 110 },
    { title: '逾期', width: 110, render: (_: unknown, r: OrderListRow) => <Tag color="red">逾期 {r.daysOverdue} 天</Tag> },
  ];
  const keyColumns = [
    { title: '订单编号', dataIndex: 'orderNo', render: (v: string, r: OrderListRow) => <a onClick={() => navigate(`/orders/${r.id}`)}>{v}</a> },
    { title: '客户', dataIndex: 'customerName' },
    { title: '状态', dataIndex: 'statusName', render: (v: string, r: OrderListRow) => <Tag color={r.statusColor}>{v}</Tag> },
    { title: '金额', dataIndex: 'totalAmount', align: 'right' as const },
    { title: '预计交期', dataIndex: 'expectedDeliveryDate', width: 110 },
  ];

  return (
    <div>
      <Row gutter={[12, 12]}>
        <Col span={6}>
          <Card size="small">
            <Statistic title="客户总数" value={stats?.customerCount ?? 0} prefix={<TeamOutlined />} loading={loading} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="跟进中订单数" value={stats?.activeOrderCount ?? 0} loading={loading} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="本月新增订单数" value={stats?.monthNewOrderCount ?? 0} loading={loading} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="本月订单总金额（¥）" value={stats?.monthTotalCny ?? 0} precision={2} loading={loading} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="待发货订单数"
              value={stats?.pendingShipCount ?? 0}
              loading={loading}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="逾期订单数"
              value={stats?.overdueOrderCount ?? 0}
              valueStyle={stats && stats.overdueOrderCount > 0 ? { color: '#ff4d4f' } : undefined}
              loading={loading}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="重点跟进订单数" value={stats?.keyOrderCount ?? 0} loading={loading} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Space size={12}>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/customers')}>
                新建客户
              </Button>
              <Button icon={<PlusOutlined />} onClick={() => navigate('/orders/new')}>
                新建订单
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col span={8}>
          <Card title="订单状态分布" size="small" loading={loading}>
            <div ref={pieRef} style={{ height: 240 }} />
          </Card>
        </Col>
        <Col span={16}>
          <Card title="逾期订单（按逾期天数倒序）" size="small" loading={loading}>
            <Table<OrderListRow>
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={stats?.overdueOrders ?? []}
              columns={overdueColumns}
              rowClassName={() => 'row-overdue'}
              locale={{ emptyText: '暂无逾期订单' }}
            />
          </Card>
        </Col>
      </Row>

      <Row style={{ marginTop: 12 }}>
        <Col span={24}>
          <Card title="重点跟进订单" size="small" loading={loading}>
            <Table<OrderListRow>
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={stats?.keyOrders ?? []}
              columns={keyColumns}
              locale={{ emptyText: '暂无重点跟进订单' }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
