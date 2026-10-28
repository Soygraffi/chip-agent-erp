import React, { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Dropdown, List, Modal, Tag } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { api } from '../api';
import type { ReminderItem } from '../models';

interface Reminders {
  overdue: ReminderItem[];
  upcoming: ReminderItem[];
}

function useReminders(): { reminders: Reminders; reload: () => void } {
  const [reminders, setReminders] = useState<Reminders>({ overdue: [], upcoming: [] });
  const reload = useCallback(() => {
    void api.reminders.list().then((r) => setReminders(r as Reminders));
  }, []);
  useEffect(() => {
    reload();
    const off = window.api.onDataChanged(reload);
    return off;
  }, [reload]);
  return { reminders, reload };
}

function ReminderList({
  items,
  kind,
  onJump,
}: {
  items: ReminderItem[];
  kind: 'overdue' | 'upcoming';
  onJump: (r: ReminderItem) => void;
}): JSX.Element {
  if (items.length === 0) return <span style={{ color: '#999' }}>无</span>;
  return (
    <List
      size="small"
      dataSource={items}
      renderItem={(r) => (
        <List.Item onClick={() => onJump(r)} style={{ cursor: 'pointer' }}>
          <Tag color={kind === 'overdue' ? 'red' : 'orange'}>
            {kind === 'overdue' ? `逾期 ${r.days} 天` : `${r.days} 天后到期`}
          </Tag>
          <span>
            {r.orderNo} · {r.customerName} · {r.nodeName}
          </span>
        </List.Item>
      )}
    />
  );
}

/** 导航铃铛（PRD 4.4.4）：角标 = 逾期节点数 */
export function ReminderBell(): JSX.Element {
  const navigate = useNavigate();
  const { reminders } = useReminders();
  const overdueCount = reminders.overdue.length;
  const jump = (r: ReminderItem): void => {
    navigate(`/orders/${r.orderId}?nodeId=${r.nodeId}`);
  };
  return (
    <Dropdown
      trigger={['click']}
      dropdownRender={() => (
        <div style={{ background: '#fff', padding: 12, width: 380, boxShadow: '0 2px 8px rgba(0,0,0,.15)', borderRadius: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>已逾期节点</div>
          <ReminderList items={reminders.overdue} kind="overdue" onJump={jump} />
          <div style={{ fontWeight: 600, margin: '12px 0 8px' }}>3 天内即将到期</div>
          <ReminderList items={reminders.upcoming} kind="upcoming" onJump={jump} />
        </div>
      )}
    >
      <Badge count={overdueCount} size="small" dot={overdueCount === 0 && reminders.upcoming.length > 0} color="#fa8c16">
        <Button type="text" icon={<BellOutlined style={{ fontSize: 16 }} />} />
      </Badge>
    </Dropdown>
  );
}

const DISMISS_KEY = 'erp-reminder-dismissed-date';

/** 启动提醒弹窗（PRD 4.4.4）：今日不再提示按天记录 */
export function StartupReminderModal(): JSX.Element {
  const navigate = useNavigate();
  const { reminders } = useReminders();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const today = dayjs().format('YYYY-MM-DD');
    if (localStorage.getItem(DISMISS_KEY) === today) return;
    if (reminders.overdue.length > 0 || reminders.upcoming.length > 0) setOpen(true);
  }, [reminders]);

  const jump = (r: ReminderItem): void => {
    setOpen(false);
    navigate(`/orders/${r.orderId}?nodeId=${r.nodeId}`);
  };

  return (
    <Modal
      title={`到期提醒（逾期 ${reminders.overdue.length} 个 · 即将到期 ${reminders.upcoming.length} 个）`}
      open={open}
      onCancel={() => setOpen(false)}
      footer={
        <Button
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, dayjs().format('YYYY-MM-DD'));
            setOpen(false);
          }}
        >
          今日不再提示
        </Button>
      }
    >
      <div style={{ fontWeight: 600 }}>已逾期</div>
      <ReminderList items={reminders.overdue} kind="overdue" onJump={jump} />
      <div style={{ fontWeight: 600, marginTop: 12 }}>即将到期（3 天内，含今天）</div>
      <ReminderList items={reminders.upcoming} kind="upcoming" onJump={jump} />
    </Modal>
  );
}
