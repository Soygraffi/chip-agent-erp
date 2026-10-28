/**
 * Electron 浜岃繘鍒舵墜鍔ㄤ笅杞斤紙甯﹂噸璇曪級+ 瑙ｅ帇鍒?node_modules/electron/dist
 * 缃戠粶涓嶇ǔ瀹氭椂 got 鏃犻噸璇曞鑷?ECONNRESET锛涙澶勭敤 fetch 娴佸紡涓嬭浇 + 鏁存枃浠堕噸璇? */
import { createWriteStream, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const electronDir = join(root, 'node_modules', 'electron');
const version = '44.7.0';
const MIRRORS = [
  `https://npmmirror.com/mirrors/electron/v${version}/electron-v${version}-win32-x64.zip`,
  `https://registry.npmmirror.com/-/binary/electron/v${version}/electron-v${version}-win32-x64.zip`,
  `https://github.com/electron/electron/releases/download/v${version}/electron-v${version}-win32-x64.zip`,
];
const zipPath = join(root, '.tmp-store-probe', `electron-v${version}-win32-x64.zip`);
const distDir = join(electronDir, 'dist');

const MAX_ATTEMPTS = 12;

async function downloadOnce(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15 * 60 * 1000) });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const file = createWriteStream(zipPath);
  let received = 0;
  try {
    for await (const chunk of res.body) {
      received += chunk.length;
      if (!file.write(chunk)) {
        await new Promise((resolve) => file.once('drain', resolve));
      }
    }
  } finally {
    file.end();
    await new Promise((resolve) => file.once('close', resolve));
  }
  const size = statSync(zipPath).size;
  console.log(`downloaded ${(size / 1024 / 1024).toFixed(1)} MB`);
  return size > 50 * 1024 * 1024; // 鍚堟硶鍖呰繙澶т簬 50MB
}

async function main() {
  mkdirSync(dirname(zipPath), { recursive: true });
  let ok = false;
  for (const url of MIRRORS) {
    console.log(`trying mirror: ${url.slice(0, 80)}...`);
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        console.log(`  attempt ${attempt}/${MAX_ATTEMPTS} ...`);
        if (await downloadOnce(url)) {
          console.log('DOWNLOAD OK');
          ok = true;
          break;
        }
        console.log('  incomplete download, retrying');
      } catch (e) {
        console.log(`  attempt ${attempt} failed: ${e instanceof Error ? e.message : String(e)}`);
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
    if (ok) break;
  }
  if (!ok) {
    console.error('ALL MIRRORS FAILED');
    process.exit(1);
  }
  const AdmZip = (await import('adm-zip')).default;
  const zip = new AdmZip(zipPath);
  mkdirSync(distDir, { recursive: true });
  zip.extractAllTo(distDir, true);
  writeFileSync(join(electronDir, 'path.txt'), 'electron.exe', 'utf8');
  console.log('EXTRACT OK ->', join(distDir, 'electron.exe'), existsSync(join(distDir, 'electron.exe')));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
