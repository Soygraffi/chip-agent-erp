import React, { useEffect } from 'react';
import { ConfigProvider, Layout, Menu, Typography, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import {
  DashboardOutlined,
  TeamOutlined,
  ProfileOutlined,
  ToolOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { HashRouter, Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { DashboardPage } from './pages/DashboardPage';
import { CustomersPage } from './pages/CustomersPage';
import { CustomerDetailPage } from './pages/CustomerDetailPage';
import { OrdersPage } from './pages/OrdersPage';
import { OrderFormPage } from './pages/OrderFormPage';
import { OrderDetailPage } from './pages/OrderDetailPage';
import { ToolsPage } from './pages/ToolsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ReminderBell, StartupReminderModal } from './components/Reminders';

const { Sider, Content, Header } = Layout;

const MENU_ITEMS = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '首页看板' },
  { key: '/customers', icon: <TeamOutlined />, label: '客户管理' },
  { key: '/orders', icon: <ProfileOutlined />, label: '订单管理' },
  { key: '/tools', icon: <ToolOutlined />, label: '数据工具' },
  { key: '/settings', icon: <SettingOutlined />, label: '系统设置' },
];

function Shell(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const selectedKey =
    MENU_ITEMS.map((m) => m.key)
      .filter((k) => location.pathname.startsWith(k))
      .sort((a, b) => b.length - a.length)[0] ?? '/dashboard';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={200} theme="dark">
        <div className="app-logo">芯片订单管理</div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={MENU_ITEMS}
          onClick={(e) => navigate(e.key)}
        />
      </Sider>
      <Layout>
        <Header className="app-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography.Text strong>芯片代理商客户订单进度管理系统</Typography.Text>
          <ReminderBell />
        </Header>
        <Content className="app-content">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/customers/:id" element={<CustomerDetailPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/orders/new" element={<OrderFormPage />} />
            <Route path="/orders/:id/edit" element={<OrderFormPage />} />
            <Route path="/orders/:id" element={<OrderDetailPage />} />
            <Route path="/tools" element={<ToolsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </Content>
      </Layout>
      <StartupReminderModal />
    </Layout>
  );
}

export function App(): JSX.Element {
  useEffect(() => {
    void window.api.health().then((h) => {
      console.log('[app] health:', h);
    });
  }, []);
  return (
    <ConfigProvider locale={zhCN} theme={{ algorithm: theme.defaultAlgorithm }}>
      <HashRouter>
        <Shell />
      </HashRouter>
    </ConfigProvider>
  );
}
