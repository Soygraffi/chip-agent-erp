/**
 * 便携版打包（沙箱可用，纯 JS）：
 * 1. 复制 Electron 运行库（node_modules/electron/dist）到 release/win-unpacked/
 * 2. 重命名 electron.exe → 芯片订单管理.exe
 * 3. 用 @electron/asar（纯 JS）打包 apps/desktop 的 out/ + package.json → resources/app.asar
 * 产物双击即可运行；正式安装包用 electron-builder（真机）另出。
 */
import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import asar from '@electron/asar';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const appDir = join(root, 'apps', 'desktop');
const electronDist = join(root, 'node_modules', 'electron', 'dist');
const releaseDir = join(appDir, 'release');
const unpacked = join(releaseDir, 'win-unpacked');

rmSync(releaseDir, { recursive: true, force: true });
mkdirSync(unpacked, { recursive: true });

// 1. 复制 Electron 运行库
cpSync(electronDist, unpacked, { recursive: true });
console.log('electron runtime copied');

// 2. 重命名可执行文件（ASCII 文件名，避免 cmd/批处理代码页问题）
const { renameSync, rmSync: rm } = await import('node:fs');
renameSync(join(unpacked, 'electron.exe'), join(unpacked, 'ChipAgentERP.exe'));
rm(join(unpacked, 'LICENSE.electron.txt'), { force: true });
console.log('exe renamed');

// 3. 打包 app.asar（仅 out/ 与 package.json）
const resourcesDir = join(unpacked, 'resources');
mkdirSync(resourcesDir, { recursive: true });
const staging = join(releaseDir, '.app-staging');
rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });
cpSync(join(appDir, 'out'), join(staging, 'out'), { recursive: true });
writeFileSync(join(staging, 'package.json'), JSON.stringify({
  name: 'chip-agent-erp',
  version: '0.1.0',
  main: 'out/main/index.js',
}, null, 2));
await asar.createPackage(staging, join(resourcesDir, 'app.asar'));
rmSync(staging, { recursive: true, force: true });
console.log('app.asar created');

// 4. 附上启动脚本（带日志，便于排查）
writeFileSync(
  join(unpacked, 'launch.bat'),
  '@echo off\r\n' +
    'cd /d "%~dp0"\r\n' +
    'echo ===== %date% %time% launch ===== >> launch.log\r\n' +
    '"ChipAgentERP.exe" --disable-gpu --disable-gpu-compositing >> launch.log 2>&1\r\n' +
    'echo exit code: %errorlevel% >> launch.log\r\n' +
    'type launch.log\r\n' +
    'echo.\r\n' +
    'echo --- window will stay open, close it manually ---\r\n' +
    'pause >nul\r\n',
  'ascii',
);
console.log('launch.bat written');

// 校验
console.log('RESULT:', existsSync(join(unpacked, 'ChipAgentERP.exe')), existsSync(join(resourcesDir, 'app.asar')));
