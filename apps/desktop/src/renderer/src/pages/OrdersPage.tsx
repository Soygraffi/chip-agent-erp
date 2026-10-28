import React from 'react';
import { Button, Card, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { OrdersBoard } from '../components/OrdersBoard';

export function OrdersPage(): JSX.Element {
  const navigate = useNavigate();
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
      <OrdersBoard showFilters pageSize={10} />
    </Card>
  );
}
