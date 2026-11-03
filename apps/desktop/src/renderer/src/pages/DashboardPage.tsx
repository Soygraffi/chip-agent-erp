import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Col, Row, Select, Space, Statistic, message } from 'antd';
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
import { OrdersBoard, SORT_OPTIONS } from '../components/OrdersBoard';

interface MetricProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  money?: boolean;
}

/** 当前节点分布的含义（用于饼图悬浮说明与图表下方图例） */
const STATUS_MEANINGS: Record<string, string> = {
  已完结: '订单所有节点都已完成',
  未填写: '订单还没有进度节点',
  '未下单': '客户在沟通/报价后没有继续下单',
};

function statusMeaning(name: string): string {
  return STATUS_MEANINGS[name] ?? `当前进行到「${name}」节点`;
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
  const [orderSort, setOrderSort] = useState('order_date:desc');

  useEffect(() => {
    void api.settings.getOrderSort().then((saved) => {
      if (saved) setOrderSort(saved);
    });
  }, []);
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

  // 仅展示有订单的状态（数量为 0 的不进入饼图与说明列表）
  const distribution = (stats?.statusDistribution ?? []).filter((s) => s.count > 0);

  useEffect(() => {
    if (!stats || distribution.length === 0 || !pieRef.current) return;
    const chart = echarts.init(pieRef.current);
    const totalOrders = distribution.reduce((acc, s) => acc + s.count, 0);
    chart.setOption({
      tooltip: {
        trigger: 'item',
        borderColor: '#fff',
        borderWidth: 8,
        backgroundColor: 'rgba(255,255,255,0.96)',
        textStyle: { color: '#1f1f1f', fontSize: 13 },
        extraCssText: 'box-shadow: 0 6px 20px rgba(0,0,0,0.12); border-radius: 10px;',
        formatter: (p: { name: string; value: number; percent: number }) =>
          `<b>${p.name}</b>　${p.value} 个（${p.percent}%）<br/><span style="color:#8c8c8c;font-size:12px">${statusMeaning(p.name)}</span>`,
      },
      title: {
        text: String(totalOrders),
        subtext: '订单总数',
        left: '50%',
        top: '36%',
        textAlign: 'center',
        textStyle: { fontSize: 28, fontWeight: 600, color: '#1f1f1f' },
        subtextStyle: { fontSize: 12, color: '#8c8c8c' },
      },
      legend: {
        bottom: 0,
        icon: 'circle',
        itemWidth: 9,
        itemHeight: 9,
        itemGap: 14,
        textStyle: { color: '#595959', fontSize: 12 },
      },
      series: [
        {
          type: 'pie',
          radius: ['52%', '76%'],
          center: ['50%', '44%'],
          itemStyle: { borderColor: '#fff', borderWidth: 3, borderRadius: 6 },
          label: { show: false },
          labelLine: { show: false },
          emphasis: { scale: true, scaleSize: 6 },
          data: distribution.map((s) => ({ name: s.statusName, value: s.count, itemStyle: { color: s.color } })),
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
            title="订单进度分布（按当前节点）"
            size="small"
            bordered={false}
            loading={loading}
            style={{ borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.04)', height: '100%' }}
          >
            {distribution.length === 0 ? (
              <div
                style={{
                  height: 240,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#bfbfbf',
                }}
              >
                暂无订单数据
              </div>
            ) : (
              <div ref={pieRef} style={{ height: 240 }} />
            )}
            <div style={{ marginTop: 4, borderTop: '1px dashed #f0f0f0', paddingTop: 10 }}>
              <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 6 }}>
                状态说明（仅显示有订单的状态，数量为 0 的不展示）
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {distribution.map((s) => (
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
                {distribution.length === 0 && <span style={{ color: '#bfbfbf' }}>暂无订单数据</span>}
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
          <Space>
            <Select
              size="small"
              style={{ width: 170 }}
              value={orderSort}
              options={SORT_OPTIONS}
              onChange={(v) => {
                setOrderSort(v as string);
                void api.settings.setOrderSort(v as string);
              }}
            />
            <Button size="small" onClick={() => navigate('/orders')}>
              查看全部订单
            </Button>
          </Space>
        }
      >
        <OrdersBoard
          showFilters={false}
          pageSize={50}
          showQuote={false}
          showSort={false}
          externalSort={orderSort}
        />
      </Card>
    </div>
  );
}
