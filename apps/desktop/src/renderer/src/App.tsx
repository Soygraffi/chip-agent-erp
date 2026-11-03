import React, { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { ConfigProvider, Layout, Menu, Typography, theme } from 'antd';
import type { MenuProps } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { HashRouter, Routes, Route, useNavigate, useLocation, useNavigationType, Navigate } from 'react-router-dom';
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

dayjs.locale('zh-cn');

// 交给应用自己恢复滚动位置，关闭浏览器默认的返回滚动
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

const { Sider, Content, Header } = Layout;

function Shell(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const [menuItems, setMenuItems] = useState(MENU_ITEMS);

  // 顶层页面：按 ESC 不再返回
  const TOP_LEVEL = [
    '/dashboard',
    '/orders',
    '/customers',
    '/suppliers',
    '/materials',
    '/wechat',
    '/tools',
    '/settings',
  ];

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      // 有弹窗 / 下拉浮层时交给组件自己关闭
      if (document.querySelector('.ant-modal-wrap:not([style*="display: none"])')) return;
      if (document.querySelector('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)')) return;
      if (document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')) return;
      if (TOP_LEVEL.includes(location.pathname)) return;
      e.preventDefault();
      navigate(-1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [location.pathname, navigate]);

  // 记录/恢复滚动位置：按 ESC 返回时回到离开前的确切位置
  useEffect(() => {
    const STORAGE_KEY = 'scroll-memory-v2';
    const readMemory = (): Record<string, number> => {
      try {
        return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, number>;
      } catch {
        return {};
      }
    };
    const memory = readMemory();
    const entryKey = location.key || location.pathname;
    const content = document.querySelector('.app-content') as HTMLElement | null;
    const currentY = (): number =>
      Math.max(window.scrollY || 0, document.scrollingElement?.scrollTop || 0, content?.scrollTop || 0);
    const save = (): void => {
      memory[entryKey] = currentY();
      memory[location.pathname] = currentY();
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('scroll', save, { passive: true, capture: true });
    content?.addEventListener('scroll', save, { passive: true });

    if (navigationType === 'POP') {
      const y = memory[entryKey] ?? memory[location.pathname] ?? 0;
      if (y > 0) {
        let tries = 0;
        const restore = (): void => {
          window.scrollTo(0, y);
          document.scrollingElement?.scrollTo?.(0, y);
          if (content) content.scrollTop = y;
          // 数据异步渲染、内容高度变化时继续重试，直到回到目标位置
          tries += 1;
          if (Math.abs(currentY() - y) > 2 && tries < 60) {
            window.setTimeout(restore, 50);
          }
        };
        window.setTimeout(restore, 20);
      }
    } else {
      window.scrollTo(0, 0);
      document.scrollingElement?.scrollTo?.(0, 0);
      if (content) content.scrollTop = 0;
    }

    return () => {
      save();
      window.removeEventListener('scroll', save, { capture: true });
      content?.removeEventListener('scroll', save);
    };
  }, [location.pathname, location.key, navigationType]);

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
            <Route path="/suppliers" element={<SuppliersPage />} />
            <Route path="/suppliers/:id" element={<SupplierDetailPage />} />
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
