import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Descriptions,
  Modal,
  Popconfirm,
  Row,
  Space,
  Table,
  message,
} from 'antd';
import {
  DownloadOutlined,
  FileExcelOutlined,
  UploadOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';
import { api, errorMessage, type ImportReport } from '../api';

interface BackupEntry {
  name: string;
  size: number;
  mtime: string;
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ToolsPage(): JSX.Element {
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [report, setReport] = useState<{ title: string; report: ImportReport } | null>(null);
  const [restoreInfo, setRestoreInfo] = useState<{ preRestorePath: string } | null>(null);

  const loadBackups = useCallback(() => {
    void api.backup.list().then((r) => setBackups(r as BackupEntry[]));
  }, []);
  useEffect(() => {
    loadBackups();
  }, [loadBackups]);

  const saved = (p: string | null): void => {
    if (p) void message.success(`已保存：${p}`);
    else void message.info('已取消');
  };

  const doImport = async (kind: 'customers' | 'orders'): Promise<void> => {
    try {
      const r = kind === 'customers' ? await api.importCustomers() : await api.importOrders();
      if (!r) {
        void message.info('已取消');
        return;
      }
      setReport({
        title: kind === 'customers' ? '客户导入结果' : '订单导入结果',
        report: r.report,
      });
      loadBackups();
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  const doBackup = async (): Promise<void> => {
    try {
      const r = (await api.backup.create()) as { path: string; size: number };
      void message.success(`备份完成：${r.path}（${fmtBytes(r.size)}）`);
      loadBackups();
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  const doRestore = async (): Promise<void> => {
    try {
      const r = (await api.backup.pickAndRestore()) as { preRestorePath: string } | null;
      if (!r) {
        void message.info('已取消');
        return;
      }
      setRestoreInfo(r);
      loadBackups();
    } catch (e) {
      void message.error(errorMessage(e));
    }
  };

  return (
    <Row gutter={[16, 16]}>
      <Col span={12}>
        <Card title="Excel 导出" size="small">
          <Space direction="vertical">
            <Button icon={<FileExcelOutlined />} onClick={() => void api.exportCustomers().then(saved)}>
              导出客户列表
            </Button>
            <Button icon={<FileExcelOutlined />} onClick={() => void api.exportOrders({ page: 1, pageSize: 100000 }).then(saved)}>
              导出订单列表（全部）
            </Button>
            <Button icon={<FileExcelOutlined />} onClick={() => void api.exportItems().then(saved)}>
              导出订单明细（全部）
            </Button>
            <span style={{ color: '#999' }}>单订单详情导出（3 个 sheet）在订单详情页操作</span>
          </Space>
        </Card>
      </Col>
      <Col span={12}>
        <Card title="Excel 导入（行级校验，重复跳过，导入后展示报告）" size="small">
          <Space direction="vertical">
            <Button icon={<DownloadOutlined />} onClick={() => void api.downloadCustomerTemplate().then(saved)}>
              下载客户导入模板
            </Button>
            <Button icon={<DownloadOutlined />} onClick={() => void api.downloadOrderTemplate().then(saved)}>
              下载订单导入模板
            </Button>
            <Button icon={<UploadOutlined />} onClick={() => void doImport('customers')}>
              导入客户
            </Button>
            <Button icon={<UploadOutlined />} onClick={() => void doImport('orders')}>
              导入订单（客户须已存在，成功行自动生成 10 个节点）
            </Button>
          </Space>
        </Card>
      </Col>
      <Col span={24}>
        <Card
          title="数据备份与恢复"
          size="small"
          extra={
            <Space>
              <Button type="primary" icon={<DatabaseOutlined />} onClick={() => void doBackup()}>
                立即备份
              </Button>
              <Popconfirm
                title="恢复备份将覆盖当前所有数据"
                description="恢复前系统会自动备份当前数据；恢复完成后需重启应用。"
                okText="选择备份文件并恢复"
                cancelText="取消"
                onConfirm={() => void doRestore()}
              >
                <Button danger>恢复备份…</Button>
              </Popconfirm>
            </Space>
          }
        >
          <Table<BackupEntry>
            rowKey="name"
            size="small"
            dataSource={backups}
            pagination={false}
            locale={{ emptyText: '暂无备份（备份 zip 包含数据库与附件）' }}
            columns={[
              { title: '备份文件', dataIndex: 'name' },
              { title: '大小', dataIndex: 'size', width: 120, render: (v: number) => fmtBytes(v) },
              { title: '时间', dataIndex: 'mtime', width: 200, render: (v: string) => v.replace('T', ' ').slice(0, 19) },
            ]}
          />
        </Card>
      </Col>

      <Modal
        title={report?.title}
        open={!!report}
        onCancel={() => setReport(null)}
        footer={<Button type="primary" onClick={() => setReport(null)}>关闭</Button>}
      >
        {report && (
          <Descriptions size="small" column={2} style={{ marginBottom: 12 }}>
            <Descriptions.Item label="成功条数">{report.report.successCount}</Descriptions.Item>
            <Descriptions.Item label="失败条数">{report.report.failCount}</Descriptions.Item>
          </Descriptions>
        )}
        {report && report.report.failures.length > 0 && (
          <Table
            size="small"
            rowKey="row"
            pagination={{ pageSize: 8 }}
            dataSource={report.report.failures}
            columns={[
              { title: '行号', dataIndex: 'row', width: 70 },
              { title: '失败原因', dataIndex: 'reason' },
            ]}
          />
        )}
      </Modal>

      <Modal
        title="恢复完成"
        open={!!restoreInfo}
        onCancel={() => setRestoreInfo(null)}
        footer={
          <Space>
            <Button onClick={() => setRestoreInfo(null)}>稍后重启</Button>
            <Button type="primary" onClick={() => api.relaunch()}>
              立即重启应用
            </Button>
          </Space>
        }
      >
        <p>数据已恢复。恢复前已自动备份当前数据：</p>
        <p style={{ wordBreak: 'break-all' }}>{restoreInfo?.preRestorePath}</p>
        <p style={{ color: '#fa8c16' }}>需要重启应用使恢复的数据生效。</p>
      </Modal>
    </Row>
  );
}
