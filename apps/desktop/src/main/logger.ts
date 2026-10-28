import { app } from 'electron';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** 渲染层错误日志（写入 userData/logs/renderer.log） */
export function logRendererError(message: string): void {
  const dir = join(app.getPath('userData'), 'logs');
  try {
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, 'renderer.log'), `[${new Date().toISOString()}] ${message}\n`);
  } catch {
    /* ignore */
  }
  console.error('[renderer]', message);
}
