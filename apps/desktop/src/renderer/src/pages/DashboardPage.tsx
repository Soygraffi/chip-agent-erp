import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Col, Row, Space, Statistic, message } from 'antd';
import {
  AppstoreAddOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  InboxOutlined,
  PlusOutlined,
  ProfileOutlined,
  ShopOutlined,
  StarOutlined,
  TeamOutlined,
  WechatOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import * as echarts from 'echarts';
import { api, errorMessage } from '../api';
import type { DashboardStats } from '../models';
import { OrdersBoard } from '../components/OrdersBoard';

interface MetricProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  money?: boolean;
}

/** 订单状态的含义（用于饼图悬浮说明与图表下方图例） */
const STATUS_MEANINGS: Record<string, string> = {
  待确认: '客户还未下单完成（询价 / 规格确认中）',
  进行中: '客户下单完成后的执行状态',
  已发货: '已发货，等待签收 / 对账',
  已完结: '订单全部完成',
  已取消: '订单已取消',
  未填写: '尚未设置订单状态',
};

function statusMeaning(name: string): string {
  return STATUS_MEANINGS[name] ?? '自定义状态';
}

function MetricCard({ title, value, icon, color, money }: MetricProps): JSX.Element {
  return (
    <Card
      bordered={false}
      bodyStyle={{ padding: '18px 20px' }}
      style={{ borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.04)', height: '100%' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: `${color}14`,
            color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: '#8c8c8c', fontSize: 13, marginBottom: 2 }}>{title}</div>
          <Statistic
            value={value}
            precision={money ? 2 : 0}
            valueStyle={{ fontSize: 22, fontWeight: 600, color: '#1f1f1f' }}
          />
        </div>
      </div>
    </Card>
  );
}

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
      tooltip: {
        trigger: 'item',
        formatter: (p: { name: string; value: number }) =>
          `${p.name}：${p.value} 个<br/><span style="color:#999;font-size:12px">${statusMeaning(p.name)}</span>`,
      },
      legend: { bottom: 0, icon: 'circle' },
      series: [
        {
          type: 'pie',
          radius: ['45%', '70%'],
          center: ['50%', '45%'],
          itemStyle: { borderColor: '#fff', borderWidth: 3 },
          label: { formatter: '{b}\n{c}' },
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

  const quickActions = [
    { label: '新建订单', icon: <PlusOutlined />, color: '#0b3d91', path: '/orders/new', dark: true },
    { label: '新建客户', icon: <TeamOutlined />, color: '#1677ff', path: '/customers', dark: false },
    { label: '新建物料', icon: <AppstoreAddOutlined />, color: '#52c41a', path: '/materials', dark: false },
    { label: '新增微信群', icon: <WechatOutlined />, color: '#13c2c2', path: '/wechat', dark: false },
  ];

  return (
    <div>
      {/* 顶部标题条 */}
      <Card
        bordered={false}
        bodyStyle={{ padding: '20px 24px' }}
        style={{
          borderRadius: 14,
          marginBottom: 16,
          background: 'linear-gradient(120deg, #0b3d91 0%, #1d5fd1 55%, #3c8cff 100%)',
          color: '#fff',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: 0.5 }}>经营看板</div>
            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 4 }}>
              客户 · 微信群 · 订单 · 物料，一屏掌握
            </div>
          </div>
          <Space>
            <Button
              icon={<PlusOutlined />}
              style={{ background: '#ffffff', color: '#0b3d91', border: 'none', fontWeight: 600 }}
              onClick={() => navigate('/orders/new')}
            >
              新建订单
            </Button>
            <Button
              icon={<TeamOutlined />}
              style={{ background: 'rgba(255,255,255,0.16)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)' }}
              onClick={() => navigate('/customers')}
            >
              新建客户
            </Button>
          </Space>
        </div>
      </Card>

      {/* 指标卡 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <MetricCard title="客户总数" value={stats?.customerCount ?? 0} icon={<TeamOutlined />} color="#1677ff" />
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <MetricCard title="跟进中订单" value={stats?.activeOrderCount ?? 0} icon={<ClockCircleOutlined />} color="#722ed1" />
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <MetricCard title="本月新增订单" value={stats?.monthNewOrderCount ?? 0} icon={<ProfileOutlined />} color="#13c2c2" />
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <MetricCard title="本月订单金额" value={stats?.monthTotalAmount ?? 0} icon={<DollarOutlined />} color="#fa8c16" money />
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <MetricCard title="待发货订单" value={stats?.pendingShipCount ?? 0} icon={<InboxOutlined />} color="#52c41a" />
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <MetricCard title="重点跟进" value={stats?.keyOrderCount ?? 0} icon={<StarOutlined />} color="#f5222d" />
        </Col>
      </Row>

      {/* 图表 + 快捷入口 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={10}>
          <Card
            title="订单状态分布"
            size="small"
            bordered={false}
            loading={loading}
            style={{ borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.04)', height: '100%' }}
          >
            <div ref={pieRef} style={{ height: 240 }} />
            <div style={{ marginTop: 4, borderTop: '1px dashed #f0f0f0', paddingTop: 10 }}>
              <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 6 }}>状态说明</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(stats?.statusDistribution ?? []).map((s) => (
                  <div key={s.statusName} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 12 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: s.color,
                        display: 'inline-block',
                        flexShrink: 0,
                        transform: 'translateY(-1px)',
                      }}
                    />
                    <span style={{ color: '#262626', minWidth: 64 }}>{s.statusName}</span>
                    <span style={{ color: '#8c8c8c' }}>{statusMeaning(s.statusName)}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card
            title="快捷入口"
            size="small"
            bordered={false}
            style={{ borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.04)', height: '100%' }}
          >
            <Row gutter={[12, 12]}>
              {quickActions.map((a) => (
                <Col key={a.label} xs={12} md={6}>
                  <div
                    onClick={() => navigate(a.path)}
                    style={{
                      cursor: 'pointer',
                      borderRadius: 10,
                      padding: '18px 12px',
                      textAlign: 'center',
                      background: `${a.color}0d`,
                      border: `1px solid ${a.color}22`,
                      transition: 'all .15s',
                    }}
                  >
                    <div style={{ fontSize: 22, color: a.color, marginBottom: 6 }}>{a.icon}</div>
                    <div style={{ color: '#595959', fontSize: 13 }}>{a.label}</div>
                  </div>
                </Col>
              ))}
            </Row>
            <div style={{ marginTop: 16, color: '#8c8c8c', fontSize: 12, lineHeight: 1.8 }}>
              提示：订单卡片上的进度条可以直接点击修改「当前进度」；客户卡片可拖动调整顺序；
              数据变更后会实时刷新本页。
            </div>
          </Card>
        </Col>
      </Row>

      {/* 订单管理 */}
      <Card
        title="订单管理"
        size="small"
        bordered={false}
        style={{ marginTop: 16, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}
        extra={
          <Button size="small" onClick={() => navigate('/orders')}>
            查看全部订单
          </Button>
        }
      >
        <OrdersBoard showFilters={false} pageSize={5} />
      </Card>
    </div>
  );
}
