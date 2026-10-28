import React from 'react';
import {
  DashboardOutlined,
  TeamOutlined,
  ShopOutlined,
  WechatOutlined,
  ProfileOutlined,
  AppstoreOutlined,
  ToolOutlined,
  SettingOutlined,
} from '@ant-design/icons';

export interface MenuDef {
  key: string;
  label: string;
  icon: React.ReactNode;
}

/** 侧边栏菜单（顺序可在 系统设置 → 菜单顺序 中拖动调整） */
export const MENU_ITEMS: MenuDef[] = [
  { key: '/dashboard', label: '首页看板', icon: <DashboardOutlined /> },
  { key: '/customers', label: '客户管理', icon: <TeamOutlined /> },
  { key: '/suppliers', label: '供应商管理', icon: <ShopOutlined /> },
  { key: '/wechat', label: '微信群管理', icon: <WechatOutlined /> },
  { key: '/orders', label: '订单管理', icon: <ProfileOutlined /> },
  { key: '/materials', label: '物料管理', icon: <AppstoreOutlined /> },
  { key: '/tools', label: '数据工具', icon: <ToolOutlined /> },
  { key: '/settings', label: '系统设置', icon: <SettingOutlined /> },
];

export const DEFAULT_MENU_KEYS = MENU_ITEMS.map((m) => m.key);

/** 合并已保存的顺序：未知 key 忽略，未出现的 key 追加到末尾 */
export function applyMenuOrder(saved: string): MenuDef[] {
  const keys = saved
    .split(',')
    .map((k) => k.trim())
    .filter((k) => DEFAULT_MENU_KEYS.includes(k));
  const ordered = [...new Set(keys)];
  for (const k of DEFAULT_MENU_KEYS) if (!ordered.includes(k)) ordered.push(k);
  return ordered.map((k) => MENU_ITEMS.find((m) => m.key === k)!).filter(Boolean);
}
