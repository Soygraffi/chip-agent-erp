import { useEffect } from 'react';

/**
 * 页面重新可见时刷新数据。
 * 顶层页面采用常驻不卸载策略（返回时零闪跳），因此需要在返回时主动拉一次最新数据。
 */
export function usePageRefresh(path: string, refresh: () => void): void {
  useEffect(() => {
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent<{ path?: string }>).detail;
      if (!detail || detail.path === path) refresh();
    };
    window.addEventListener('app:page-refresh', handler);
    return () => window.removeEventListener('app:page-refresh', handler);
  }, [path, refresh]);
}
