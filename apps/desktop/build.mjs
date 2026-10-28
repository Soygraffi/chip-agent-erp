/**
 * Rollup 构建脚本（ADR-002：沙箱内无子进程的构建方案）
 * main/preload → CJS（external: electron 与 node: 内置模块）
 * renderer → 单文件 ESM bundle + 复制静态资源
 */
import { rollup } from 'rollup';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = __dirname;
const outDir = join(root, 'out');

function tsPlugin(tsconfig) {
  return typescript({
    tsconfig,
    compilerOptions: {
      module: 'ESNext',
      target: 'ES2022',
      noEmit: false,
      declaration: false,
      sourceMap: false,
    },
  });
}

async function buildMainPreload() {
  const shared = [
    nodeResolve({ preferBuiltins: true, extensions: ['.ts', '.js', '.mjs', '.cjs'] }),
    commonjs(),
    tsPlugin(join(root, 'tsconfig.node.json')),
  ];
  const external = (id) => id === 'electron' || id.startsWith('node:') || id.startsWith('electron/');

  for (const [input, file] of [
    ['src/main/index.ts', 'out/main/index.js'],
    ['src/main/smoke.ts', 'out/main/smoke.js'],
    ['src/preload/index.ts', 'out/preload/index.js'],
  ]) {
    const bundle = await rollup({
      input: join(root, input),
      external,
      plugins: shared,
      onwarn(warning, warn) {
        if (warning.code === 'CIRCULAR_DEPENDENCY') return;
        warn(warning);
      },
    });
    await bundle.write({
      format: 'cjs',
      file: join(root, file),
      exports: 'auto',
      sourcemap: false,
    });
    await bundle.close();
    console.log('built', file);
  }
}

async function buildRenderer() {
  const bundle = await rollup({
    input: join(root, 'src/renderer/src/main.tsx'),
    plugins: [
      nodeResolve({ browser: true, extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'] }),
      commonjs(),
      tsPlugin(join(root, 'tsconfig.web.json')),
    ],
    onwarn(warning, warn) {
      if (warning.code === 'CIRCULAR_DEPENDENCY') return;
      if (warning.code === 'THIS_IS_UNDEFINED') return;
      warn(warning);
    },
  });
  await bundle.write({
    format: 'es',
    file: join(outDir, 'renderer/index.js'),
    sourcemap: false,
    // 渲染层无 Node 环境：给引用了 process 的依赖（React 生态）注入兼容垫片，
    // 否则白屏（Uncaught ReferenceError: process is not defined）
    intro: 'var process = window.process || { env: { NODE_ENV: "production" } };',
  });
  await bundle.close();
  console.log('built out/renderer/index.js');
}

function copyStatic() {
  const rendererDir = join(outDir, 'renderer');
  mkdirSync(rendererDir, { recursive: true });

  // index.html（引用构建产物与样式）
  writeFileSync(
    join(rendererDir, 'index.html'),
    `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:" />
    <link rel="stylesheet" href="./antd-reset.css" />
    <link rel="stylesheet" href="./styles.css" />
    <title>芯片代理商客户订单进度管理系统</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./index.js"></script>
  </body>
</html>`,
    'utf8',
  );

  let antdReset = join(root, 'node_modules/antd/dist/reset.css');
  if (!existsSync(antdReset)) antdReset = join(root, '../../node_modules/antd/dist/reset.css');
  cpSync(antdReset, join(rendererDir, 'antd-reset.css'));
  cpSync(join(root, 'src/renderer/src/styles.css'), join(rendererDir, 'styles.css'));
  console.log('copied static assets');
}

rmSync(outDir, { recursive: true, force: true });
await buildMainPreload();
await buildRenderer();
copyStatic();
console.log('BUILD OK');
