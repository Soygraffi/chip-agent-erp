import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { initApp, type AppContext } from './bootstrap';
import { registerIpc } from './ipc/index';

// 禁用硬件加速：部分显卡驱动（尤其核显/远程桌面）会触发 GPU 进程崩溃
//（0x80000003 / LiveKernelEvent 141）导致整个应用退出，改用软件渲染稳定可靠。
app.disableHardwareAcceleration();

// 启动诊断日志（写入 stdout/stderr，启动脚本会捕获）
function log(...args: unknown[]): void {
  console.log('[main]', new Date().toISOString().slice(11, 19), ...args);
}

const ctxRef: { ctx: AppContext | null } = { ctx: null };

function createWindow(): void {
  log('creating window');
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f5f5f5',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  log('window object created');

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    log('did-fail-load', code, desc, url);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    log('render-process-gone', JSON.stringify(details));
  });
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    log('renderer-console', level, message, `${sourceId}:${line}`);
  });
  win.once('ready-to-show', () => {
    log('ready-to-show -> show window');
    win.show();
  });
  win.on('closed', () => log('window closed'));

  // 兜底：5 秒后仍未 ready 也强制显示，避免渲染层加载失败导致窗口永远隐形
  setTimeout(() => {
    if (!win.isDestroyed() && !win.isVisible()) {
      log('force-show (ready-to-show 未触发)');
      win.show();
    }
  }, 5000);

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  const target = devUrl ?? join(__dirname, '../renderer/index.html');
  log('loading', target);
  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// 用户数据目录按 PRD 约定为 %APPDATA%\ChipAgentERP
app.setName('ChipAgentERP');
log('app start, electron', process.versions.electron, 'node', process.versions.node);

app.whenReady().then(() => {
  log('app ready');
  ctxRef.ctx = initApp(app.getPath('userData'));
  log('db initialized at', ctxRef.ctx.dataDir);
  registerIpc(ctxRef as { ctx: AppContext });
  log('ipc registered');
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  log('window-all-closed -> quit');
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  log('before-quit');
  try {
    ctxRef.ctx?.db.close();
  } catch {
    /* ignore */
  }
});
