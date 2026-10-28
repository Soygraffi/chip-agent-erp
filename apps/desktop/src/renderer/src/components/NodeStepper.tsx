import React from 'react';
import { Steps, Tag } from 'antd';
import type { OrderNode } from '../models';
import { NODE_STATUS_COLORS, NODE_STATUS_LABELS } from '../models';

interface NodeStepperProps {
  nodes: OrderNode[];
  onSelect: (node: OrderNode) => void;
  compact?: boolean;
}

function stepStatus(n: OrderNode): 'wait' | 'process' | 'finish' | 'error' {
  if (n.status === 'done') return 'finish';
  if (n.status === 'delayed') return 'error';
  if (n.status === 'in_progress') return 'process';
  return 'wait';
}

/**
 * 进度步骤条（V1.6.4）：保留原有 antd Steps 外观，
 * 但叠加透明点击层，解决 antd Steps「点击当前步骤不触发 onChange」导致第一个节点点不动的问题。
 */
export function NodeStepper({ nodes, onSelect }: NodeStepperProps): JSX.Element {
  const sorted = [...nodes].sort((a, b) => a.sortOrder - b.sortOrder);
  if (sorted.length === 0) return <div style={{ color: '#999' }}>暂无进度节点</div>;

  return (
    <div style={{ position: 'relative', paddingBottom: 4 }}>
      <Steps
        size="small"
        current={Math.max(0, sorted.findIndex((n) => n.status !== 'done'))}
        items={sorted.map((n) => ({
          title: n.name,
          status: stepStatus(n),
          description: <Tag color={NODE_STATUS_COLORS[n.status]}>{NODE_STATUS_LABELS[n.status]}</Tag>,
        }))}
      />
      {/* 透明点击层：覆盖每个步骤的标题/圆点区域，任意步骤（含当前步骤）都可点击编辑 */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'stretch',
        }}
      >
        {sorted.map((n, i) => (
          <div
            key={n.id}
            role="button"
            tabIndex={0}
            title="点击修改当前进度"
            onClick={() => onSelect(n)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelect(n);
            }}
            style={{
              flex: 1,
              cursor: 'pointer',
              borderRadius: 6,
              transition: 'background .15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = 'rgba(22,119,255,0.05)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = 'transparent';
            }}
          />
        ))}
      </div>
    </div>
  );
}
