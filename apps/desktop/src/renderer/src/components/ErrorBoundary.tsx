import React from 'react';
import { Button, Result, Typography } from 'antd';

interface Props {
  children: React.ReactNode;
}
interface State {
  error: Error | null;
}

/** 渲染错误兜底：避免整页白屏，并展示错误信息、支持一键重载 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const detail = `[render-error] ${error.message}\n${error.stack ?? ''}\n${info.componentStack ?? ''}`;
    void window.api.invoke('system:logError', detail);
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <Result
          status="error"
          title="页面渲染出错"
          subTitle="已记录日志。可点击下方按钮重新加载；如反复出现，请把错误信息发给开发者。"
          extra={[
            <Button
              key="reload"
              type="primary"
              onClick={() => {
                this.setState({ error: null });
                window.location.reload();
              }}
            >
              重新加载
            </Button>,
            <Button
              key="back"
              onClick={() => {
                this.setState({ error: null });
                window.location.hash = '#/dashboard';
              }}
            >
              返回首页
            </Button>,
          ]}
        >
          <Typography.Paragraph type="danger" style={{ whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto' }}>
            {this.state.error.message}
          </Typography.Paragraph>
        </Result>
      );
    }
    return this.props.children;
  }
}
