import React, { useEffect, useRef, useState } from 'react';
import { HolderOutlined } from '@ant-design/icons';
import { message } from 'antd';

interface SortableListProps<T> {
  items: T[];
  getKey: (item: T) => number;
  renderMain: (item: T) => React.ReactNode;
  renderActions?: (item: T) => React.ReactNode;
  onReorder: (ids: number[]) => Promise<void> | void;
  hint?: string;
}

/**
 * 拖动排序列表（V1.4）：替代手写排序数字。
 * 拖动某行到另一行位置后，本地立即重排并调用 onReorder(有序 id 数组)。
 */
export function SortableList<T>(props: SortableListProps<T>): JSX.Element {
  const { items, getKey, renderMain, renderActions, onReorder, hint } = props;
  const [local, setLocal] = useState<T[]>(items);
  const dragIndex = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  useEffect(() => {
    setLocal(items);
  }, [items]);

  const commit = async (next: T[]): Promise<void> => {
    setLocal(next);
    try {
      await onReorder(next.map(getKey));
    } catch (e) {
      void message.error(e instanceof Error ? e.message : String(e));
      setLocal(items);
    }
  };

  const onDrop = (index: number): void => {
    const from = dragIndex.current;
    dragIndex.current = null;
    setOverIndex(null);
    if (from == null || from === index) return;
    const next = [...local];
    const [moved] = next.splice(from, 1);
    next.splice(index, 0, moved);
    void commit(next);
  };

  return (
    <div>
      {hint && <div style={{ color: '#999', fontSize: 12, marginBottom: 8 }}>{hint}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {local.map((item, index) => (
          <div
            key={getKey(item)}
            draggable
            onDragStart={() => {
              dragIndex.current = index;
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setOverIndex(index);
            }}
            onDragLeave={() => setOverIndex(null)}
            onDrop={() => onDrop(index)}
            onDragEnd={() => {
              dragIndex.current = null;
              setOverIndex(null);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '8px 12px',
              border: '1px solid #f0f0f0',
              borderRadius: 8,
              background: overIndex === index ? '#e6f4ff' : '#fff',
              cursor: 'grab',
              transition: 'background 0.15s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
              <HolderOutlined style={{ color: '#bbb' }} />
              <span style={{ color: '#bbb', width: 20 }}>{index + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>{renderMain(item)}</div>
            </div>
            {renderActions && <div style={{ flexShrink: 0 }}>{renderActions(item)}</div>}
          </div>
        ))}
        {local.length === 0 && <div style={{ color: '#999' }}>暂无数据</div>}
      </div>
    </div>
  );
}
