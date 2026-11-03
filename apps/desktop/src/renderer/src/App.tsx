import React, { useEffect, useLayoutEffect, useState } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { ConfigProvider, Layout, Menu, Typography, theme } from 'antd';
import type { MenuProps } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { MemoryRouter, Routes, Route, useNavigate, useLocation, useNavigationType, Navigate } from 'react-router-dom';
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

/** 各页面最近一次滚动位置（模块级，路由切换不会丢） */
const scrollPositions: Record<string, number> = {};
let currentPath = '/dashboard';

/** 立即抓取当前滚动位置，写入内存（路由切换不会丢） */
function captureScrollPosition(): void {
  const content = document.querySelector('.app-content') as HTMLElement | null;
  const y = Math.max(
    window.scrollY || 0,
    document.scrollingElement?.scrollTop || 0,
    content?.scrollTop || 0,
  );
  if (y > 0) scrollPositions[currentPath] = y;
}

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
      // 离开前先记住当前滚动位置
      captureScrollPosition();
      e.preventDefault();
      navigate(-1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [location.pathname, navigate]);

  // 错误兜底页「返回首页」等自定义事件
  useEffect(() => {
    const goDashboard = (): void => navigate('/dashboard');
    window.addEventListener('app:go-dashboard', goDashboard);
    return () => window.removeEventListener('app:go-dashboard', goDashboard);
  }, [navigate]);

  // 记录/恢复滚动位置：按 ESC 返回时回到离开前的确切位置
  currentPath = location.pathname;

  // 全局记录滚动位置：滚动事件 + 点击前 + 定时兜底，确保路由切换前一定拿到准确位置
  useEffect(() => {
    const record = (): void => {
      captureScrollPosition();
    };
    window.addEventListener('scroll', record, { passive: true, capture: true });
    window.addEventListener('click', record, true);
    const timer = window.setInterval(record, 200);
    return () => {
      window.removeEventListener('scroll', record, { capture: true });
      window.removeEventListener('click', record, true);
      window.clearInterval(timer);
    };
  }, []);

  // 返回（POP）时恢复到离开前的滚动位置；进入新页面则回到顶部
  // 用 useLayoutEffect 在浏览器绘制前完成定位，避免先看到顶部再跳回来
  useLayoutEffect(() => {
    const content = document.querySelector('.app-content') as HTMLElement | null;
    if (navigationType !== 'POP') {
      window.scrollTo(0, 0);
      if (content) content.scrollTop = 0;
      return;
    }
    // 以内存里的滚动位置为准（离开页面时点击/滚动/ESC 前都已抓取）
    const y = scrollPositions[location.pathname] ?? 0;
    if (y <= 0) return;
    let stopped = false;
    let tries = 0;
    const restore = (): void => {
      if (stopped) return;
      window.scrollTo(0, y);
      if (content) content.scrollTop = y;
      tries += 1;
      const now = Math.max(window.scrollY || 0, content?.scrollTop || 0);
      // 首次立即定位；仅当内容高度还没撑开时才异步重试
      if (Math.abs(now - y) > 2 && tries < 80) {
        window.setTimeout(restore, 40);
      }
    };
    restore();
    return () => {
      stopped = true;
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
        <MemoryRouter initialEntries={['/']}>
          <Shell />
        </MemoryRouter>
      </ErrorBoundary>
    </ConfigProvider>
  );
}
