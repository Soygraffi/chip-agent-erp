/** 浠庣紦瀛?zip 瑙ｅ帇 Electron 鍒?node_modules/electron/dist锛堜笉閲嶆柊涓嬭浇锛?*/
import AdmZip from 'adm-zip';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const version = '44.7.0';
const zipPath = join(root, '.tmp-store-probe', `electron-v${version}-win32-x64.zip`);
const distDir = join(root, 'node_modules', 'electron', 'dist');

if (!existsSync(zipPath)) {
  console.error('cached zip missing:', zipPath);
  process.exit(1);
}
const zip = new AdmZip(zipPath);
mkdirSync(distDir, { recursive: true });
zip.extractAllTo(distDir, true);
writeFileSync(join(root, 'node_modules', 'electron', 'path.txt'), 'electron.exe', 'utf8');
console.log('EXTRACT OK ->', existsSync(join(distDir, 'electron.exe')));
