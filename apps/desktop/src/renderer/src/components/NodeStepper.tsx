import React from 'react';
import { CheckOutlined } from '@ant-design/icons';
import type { OrderNode } from '../models';
import { NODE_STATUS_COLORS, NODE_STATUS_LABELS } from '../models';

interface NodeStepperProps {
  nodes: OrderNode[];
  onSelect: (node: OrderNode) => void;
  compact?: boolean;
}

/**
 * 可点击的横向进度步骤条（V1.6.3）。
 * 不使用 antd Steps：其 onChange 在“点击当前步骤”时不会触发，导致第一个节点点不动。
 * 这里整块区域都可点击，任意节点（含第一步）都能打开“更新进度”。
 */
export function NodeStepper({ nodes, onSelect, compact = false }: NodeStepperProps): JSX.Element {
  const sorted = [...nodes].sort((a, b) => a.sortOrder - b.sortOrder);
  if (sorted.length === 0) return <div style={{ color: '#999' }}>暂无进度节点</div>;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        overflowX: 'auto',
        padding: compact ? '4px 0 6px' : '6px 0 10px',
        gap: 0,
      }}
    >
      {sorted.map((n, i) => {
        const color = NODE_STATUS_COLORS[n.status] ?? '#8C8C8C';
        const isDone = n.status === 'done';
        return (
          <div
            key={n.id}
            role="button"
            title="点击修改当前进度"
            onClick={() => onSelect(n)}
            style={{
              flex: '1 0 108px',
              minWidth: 108,
              cursor: 'pointer',
              padding: '4px 6px 6px',
              borderRadius: 8,
              transition: 'background .15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = '#f5f8ff';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = 'transparent';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <div style={{ flex: 1, height: 2, background: i === 0 ? 'transparent' : '#e5e5e5' }} />
              <div
                style={{
                  width: compact ? 18 : 22,
                  height: compact ? 18 : 22,
                  borderRadius: '50%',
                  background: isDone ? color : '#fff',
                  border: `2px solid ${color}`,
                  color: isDone ? '#fff' : color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: compact ? 10 : 12,
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {isDone ? <CheckOutlined /> : i + 1}
              </div>
              <div
                style={{
                  flex: 1,
                  height: 2,
                  background: i === sorted.length - 1 ? 'transparent' : '#e5e5e5',
                }}
              />
            </div>
            <div
              style={{
                marginTop: 6,
                textAlign: 'center',
                fontSize: compact ? 12 : 13,
                fontWeight: isDone ? 400 : 600,
                color: isDone ? '#8c8c8c' : '#262626',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={n.name}
            >
              {n.name}
            </div>
            <div
              style={{
                marginTop: 2,
                textAlign: 'center',
                fontSize: 11,
                color,
              }}
            >
              {NODE_STATUS_LABELS[n.status] ?? n.status}
            </div>
          </div>
        );
      })}
    </div>
  );
}
