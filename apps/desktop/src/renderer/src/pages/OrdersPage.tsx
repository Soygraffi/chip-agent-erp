import React, { useCallback, useState } from 'react';
import { Button, Card, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { OrdersBoard } from '../components/OrdersBoard';
import { usePageRefresh } from '../hooks/usePageRefresh';

export function OrdersPage(): JSX.Element {
  const navigate = useNavigate();
  // 页面常驻不卸载：返回时通过 refreshToken 让列表重新拉一次数据
  const [refreshToken, setRefreshToken] = useState(0);
  const bump = useCallback(() => setRefreshToken((t) => t + 1), []);
  usePageRefresh('/orders', bump);
  return (
    <Card
      title="订单管理"
      extra={
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/orders/new')}>
            新建订单
          </Button>
        </Space>
      }
    >
      <OrdersBoard showFilters pageSize={50} refreshToken={refreshToken} />
    </Card>
  );
}
