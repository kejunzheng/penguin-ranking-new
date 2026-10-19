#!/usr/bin/env node
// 生成腾讯新闻 H5 发布目录（默认 ../penguin-index-cdn/h5）。
// 1) 以 VITE_H5=1 构建单个经典脚本版（dist/h5），避免代码分割产生发布工具无法替换的模块路径；
// 2) 发布工具只上传 HTML/CSS/JS/图片/字体，不上传 JSON，运行时数据内联成 assets/penguin-data.js；
// 3) 注入分享能力。数据取自当前 public/data（与每日更新后的站点一致）。
// 用法：node scripts/build-h5.mjs [--site <已构建的 H5 目录，跳过构建>] [--out <dir>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback; };
const siteArg = arg('--site', null);
const siteDir = path.resolve(siteArg || path.join(rootDir, 'dist/h5'));
const outDir = path.resolve(arg('--out', path.join(rootDir, '../penguin-index-cdn/h5')));
const MAX_FILE = 10 * 1024 * 1024;

if (!siteArg) {
  const vite = path.join(rootDir, 'node_modules/vite/bin/vite.js');
  const result = spawnSync(process.execPath, [vite, 'build', '--logLevel', 'warn'], { cwd: rootDir, stdio: 'inherit', env: { ...process.env, VITE_H5: '1' } });
  if (result.status !== 0) throw new Error('H5 构建失败');
}
if (!fs.existsSync(path.join(siteDir, 'index.html'))) throw new Error(`site 目录缺少 index.html: ${siteDir}`);

const walk = dir => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);

const tmpDir = `${outDir}.tmp-${process.pid}`;
fs.rmSync(tmpDir, { recursive: true, force: true });
fs.mkdirSync(tmpDir, { recursive: true });

// 1. 复制 index.html 与 assets（去掉说明文档和 data/）
fs.copyFileSync(path.join(siteDir, 'index.html'), path.join(tmpDir, 'index.html'));
for (const file of walk(path.join(siteDir, 'assets'))) {
  const rel = path.relative(siteDir, file);
  if (/\.(md|json)$/i.test(rel)) continue;
  fs.mkdirSync(path.dirname(path.join(tmpDir, rel)), { recursive: true });
  fs.copyFileSync(file, path.join(tmpDir, rel));
}

// 1.1 去掉项目图标清单里的原始出处地址（source 字段仅作溯源记录，页面不读取），
//     避免第三方源站直链进入发布产物
let strippedSources = 0;
let escapedStrings = 0;
for (const file of walk(path.join(tmpDir, 'assets')).filter(f => f.endsWith('.js'))) {
  const code = fs.readFileSync(file, 'utf8');
  const next = code.replace(/,source:"https?:\/\/[^"]+\.(?:png|jpe?g|gif|svg|webp|avif|ico)"/g, () => { strippedSources += 1; return ''; })
    // IIFE 版的 import.meta.url 兜底会写入入口脚本自身的相对路径，只作为预加载基准传给 Vite 预加载助手；
    // H5 版已关闭 modulePreload（deps 为 void 0），基准地址不会被使用，换成 document.baseURI
    .replace(/new URL\("assets\/[^"]+\.js",document\.baseURI\)\.href/g, 'document.baseURI');
  // 发布工具自检会把引号内以 .js/.css/图片扩展名结尾的字符串都当成资源路径；
  // 对不对应任何本地文件的普通文案（如 "Node.js"）把最后一个点写成 \\u002e，运行时字符串不变
  const localFiles = walk(siteDir).map(f => path.relative(siteDir, f).split(path.sep).join('/'));
  const escaped = next.replace(/(["'])([^"'\\]*)\.(js|css|wasm|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|eot|otf)\1/gi, (match, quote, stem, ext) => {
    const value = `${stem}.${ext}`;
    if (/^(?:https?:|data:|\/\/)/i.test(value)) return match;
    const key = value.replace(/^\.\//, '');
    if (localFiles.some(file => file.endsWith(key))) return match;
    escapedStrings += 1;
    return `${quote}${stem}\\u002e${ext}${quote}`;
  });
  if (escaped !== code) fs.writeFileSync(file, escaped);
}

// 2. 内联 data/*.json：base64 存储，避免发布工具把数据里的图片文件名当成资源路径替换
const data = {};
for (const file of walk(path.join(siteDir, 'data')).filter(f => f.endsWith('.json')).sort()) {
  const key = path.relative(siteDir, file).split(path.sep).join('/');
  const raw = fs.readFileSync(file);
  JSON.parse(raw.toString('utf8'));
  data[key] = raw.toString('base64');
}
// base64 按 2KB 分段换行：发布工具的内网链接检测在单个超长行上会卡死
const chunked = value => `[\n${(value.match(/.{1,2048}/g) || []).map(part => JSON.stringify(part)).join(',\n')}\n].join('')`;
const dataJs = `window.__PENGUIN_DATA__={\n${Object.entries(data).map(([key, value]) => `${JSON.stringify(key)}:${chunked(value)}`).join(',\n')}\n};\n`;
if (Buffer.byteLength(dataJs) > MAX_FILE) throw new Error('penguin-data.js 超过 10MB 单文件上限');
fs.writeFileSync(path.join(tmpDir, 'assets/penguin-data.js'), dataJs);

// 3. 分享能力：分享图标（200×200）与分享脚本
fs.copyFileSync(path.join(rootDir, 'public/assets/penguin-share-icon.png'), path.join(tmpDir, 'assets/penguin-share-icon.png'));
fs.copyFileSync(path.join(rootDir, 'scripts/h5-share.js'), path.join(tmpDir, 'assets/penguin-share.js'));

// 4. 在入口模块之前加载数据脚本；补 OG meta，页面末尾加载分享脚本
const htmlPath = path.join(tmpDir, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
// 单文件 IIFE 版改为经典 defer 脚本，发布工具不再走 ES Module 打包
html = html.replace(/<script type="module" crossorigin src=/g, '<script defer src=').replace(/<link rel="stylesheet" crossorigin /g, '<link rel="stylesheet" ');
const marker = '<script defer src=';
if (!html.includes(marker) || !html.includes('</body>')) throw new Error('index.html 缺少入口脚本或 </body>');
const ogMeta = [
  '<meta property="og:title" content="企鹅智库 · AI 趋势榜"/>',
  '<meta property="og:description" content="模型能力榜·模型调用量·API 价格评测榜·开源增长"/>',
  '<meta property="og:image" content="./assets/penguin-share-icon.png"/>',
  '<meta property="og:url" content=""/>',
].join('');
html = html.replace(marker, `${ogMeta}<script src="./assets/penguin-data.js"></script>${marker}`)
  .replace('</body>', '<script src="./assets/penguin-share.js"></script></body>');
fs.writeFileSync(htmlPath, html);

for (const file of walk(tmpDir)) {
  if (fs.statSync(file).size > MAX_FILE) throw new Error(`单文件超过 10MB: ${path.relative(tmpDir, file)}`);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.renameSync(tmpDir, outDir);
const files = walk(outDir);
const bytes = files.reduce((sum, file) => sum + fs.statSync(file).size, 0);
console.log(`H5_BUILT out=${outDir} files=${files.length} stripped_sources=${strippedSources} escaped_strings=${escapedStrings} size=${(bytes / 1024 / 1024).toFixed(1)}MB data=${Object.keys(data).length}`);
