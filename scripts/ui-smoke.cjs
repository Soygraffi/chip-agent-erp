/* 渲染冒烟：隐藏窗口加载构建产物，路由到订单详情，检查是否白屏/报错 */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');

app.disableHardwareAcceleration();

const ROOT = 'D:/Programming Projects/ERP for me';

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(ROOT, 'scripts/ui-smoke-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const errors = [];
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) errors.push(String(message).slice(0, 300));
  });
  await win.loadFile(path.join(ROOT, 'apps/desktop/out/renderer/index.html'));
  await win.webContents.executeJavaScript("location.hash = '#/orders/1'");
  await new Promise((r) => setTimeout(r, 1800));
  const text = await win.webContents.executeJavaScript('document.body.innerText');
  console.log('BODY_LEN:', text.length);
  console.log('HAS_CUSTOMER:', text.includes('长沙丹芬瑞'));
  console.log('HAS_ITEM:', text.includes('GD32F407ZGT6'));
  console.log('HAS_BOUNDARY:', text.includes('页面渲染出错'));
  console.log('ERRORS:', JSON.stringify(errors.slice(0, 5)));
  app.exit(0);
});
