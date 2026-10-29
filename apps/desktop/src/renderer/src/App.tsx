import React, { useEffect, useState } from 'react';
import { ConfigProvider, Layout, Menu, Typography, theme } from 'antd';
import type { MenuProps } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { HashRouter, Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { DashboardPage } from './pages/DashboardPage';
import { CustomersPage } from './pages/CustomersPage';
import { CustomerDetailPage } from './pages/CustomerDetailPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { SupplierDetailPage } from './pages/SupplierDetailPage';
import { OrdersPage } from './pages/OrdersPage';
import { OrderFormPage } from './pages/OrderFormPage';
import { OrderDetailPage } from './pages/OrderDetailPage';
import { MaterialsPage } from './pages/MaterialsPage';
import { WechatGroupsPage } from './pages/WechatGroupsPage';
import { ToolsPage } from './pages/ToolsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ReminderBell, StartupReminderModal } from './components/Reminders';
import { ErrorBoundary } from './components/ErrorBoundary';
import { applyMenuOrder, MENU_ITEMS } from './menu';
import { api } from './api';

const { Sider, Content, Header } = Layout;

function Shell(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuItems, setMenuItems] = useState(MENU_ITEMS);

  useEffect(() => {
    const load = (): void => {
      void api.settings.getMenuOrder().then((saved) => setMenuItems(applyMenuOrder(saved ?? '')));
    };
    load();
    const off = window.api.onDataChanged(load);
    return off;
  }, []);

  const selectedKey =
    menuItems
      .map((m) => m.key)
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
          items={menuItems as MenuProps['items']}
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
            <Route path="/suppliers" element={<SuppliersPage />} />`n            <Route path="/suppliers/:id" element={<SupplierDetailPage />} />
            <Route path="/wechat" element={<WechatGroupsPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/orders/new" element={<OrderFormPage />} />
            <Route path="/orders/:id/edit" element={<OrderFormPage />} />
            <Route path="/orders/:id" element={<OrderDetailPage />} />
            <Route path="/materials" element={<MaterialsPage />} />
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
    const onError = (e: ErrorEvent): void => {
      void window.api.invoke('system:logError', `[window.error] ${e.message}\n${e.error?.stack ?? ''}`);
    };
    const onRejection = (e: PromiseRejectionEvent): void => {
      void window.api.invoke('system:logError', `[unhandledrejection] ${String(e.reason)}`);
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  return (
    <ConfigProvider locale={zhCN} theme={{ algorithm: theme.defaultAlgorithm }}>
      <ErrorBoundary>
        <HashRouter>
          <Shell />
        </HashRouter>
      </ErrorBoundary>
    </ConfigProvider>
  );
}
