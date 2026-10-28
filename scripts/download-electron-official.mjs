/**
 * 从 GitHub 官方源下载 electron（带重试，独立文件名，不覆盖镜像版）
 */
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const version = '44.7.0';
const url = `https://github.com/electron/electron/releases/download/v${version}/electron-v${version}-win32-x64.zip`;
const zipPath = join(root, '.tmp-store-probe', `electron-v${version}-win32-x64-official.zip`);
const MAX_ATTEMPTS = 20;

async function downloadOnce() {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(20 * 60 * 1000),
    headers: { 'User-Agent': 'electron-downloader', Accept: 'application/octet-stream' },
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const file = createWriteStream(zipPath);
  let received = 0;
  try {
    for await (const chunk of res.body) {
      received += chunk.length;
      if (!file.write(chunk)) await new Promise((resolve) => file.once('drain', resolve));
      if (received % (20 * 1024 * 1024) < 64 * 1024) console.log(`  ${(received / 1024 / 1024).toFixed(1)} MB ...`);
    }
  } finally {
    file.end();
    await new Promise((resolve) => file.once('close', resolve));
  }
  const size = statSync(zipPath).size;
  console.log(`downloaded ${(size / 1024 / 1024).toFixed(1)} MB`);
  return size > 80 * 1024 * 1024;
}

async function main() {
  mkdirSync(dirname(zipPath), { recursive: true });
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      console.log(`attempt ${attempt}/${MAX_ATTEMPTS} ...`);
      if (await downloadOnce()) {
        console.log('DOWNLOAD OK');
        process.exit(0);
      }
      console.log('incomplete, retrying');
    } catch (e) {
      console.log(`attempt ${attempt} failed: ${e instanceof Error ? e.message : String(e)}`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
  console.error('ALL ATTEMPTS FAILED');
  process.exit(1);
}

main();
