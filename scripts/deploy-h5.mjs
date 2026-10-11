#!/usr/bin/env node
// 生成 H5 目录并重新发布到腾讯新闻测试环境，发布后回读核验。
// 用法：node scripts/deploy-h5.mjs [--deployer <qqnews-page-deploy 目录>] [--page penguin-trend]
// 发布决策沿用首次发布时用户的确认：标题通过、分享已配置、大同上报暂不接入（skipped_by_user）；
// 第三方资源检测跳过的原因：产物已去除全部第三方直链，规则包把站点自身的相对 CSS 误判为外部资源。
// 只发测试环境；正式环境必须走人工门禁（TODO / TAPD / 安审 / 二次确认）。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback; };
const deployer = path.resolve(arg('--deployer', path.join(rootDir, '../penguin-index-cdn/.h5-deploy/skills/qqnews-page-deploy')));
const page = arg('--page', 'penguin-trend');
const h5Dir = path.resolve(arg('--out', path.join(rootDir, '../penguin-index-cdn/h5')));
const secretsPath = path.resolve(deployer, '../../secrets.json');

function run(label, file, args, opts = {}) {
  const started = Date.now();
  const result = spawnSync(process.execPath, [file, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (result.status !== 0) {
    const tail = `${result.stdout || ''}\n${result.stderr || ''}`.split('\n').filter(Boolean).slice(-25).join('\n');
    // 日志中可能包含凭据片段，统一打码
    console.error(tail.replace(/[A-Za-z0-9_-]{32,}/g, '***'));
    throw new Error(`${label} 失败（exit ${result.status}，${seconds}s）`);
  }
  console.log(`  ✓ ${label} (${seconds}s)`);
  return result.stdout || '';
}

async function fetchText(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`回读 ${url} 返回 ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  if (!fs.existsSync(path.join(deployer, 'scripts/deploy.cjs'))) throw new Error(`未找到发布工具: ${deployer}`);
  if (!fs.existsSync(path.join(deployer, 'node_modules/@tencent/qn-page-deploy'))) throw new Error('发布工具缺少依赖，请在该目录执行 npm install');
  const secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf8'));
  if (!secrets.FOLDER_NAME || !secrets.TUPLOAD_TOKEN) throw new Error('发布凭据不完整');
  const pageUrl = `https://testqqnews.qq.com/qqfile/${secrets.FOLDER_NAME}/${page}.html`;

  console.log('=== H5 测试环境重新发布 ===');
  run('生成 H5 目录', path.join(rootDir, 'scripts/build-h5.mjs'), ['--out', h5Dir], { cwd: rootDir });
  const precheck = path.join(deployer, 'scripts/precheck.cjs');
  run('前置检测', precheck, [h5Dir]);
  run('写回检测决策', precheck, ['decision', h5Dir, 'pass', 'pass', 'skipped_by_user']);
  const report = JSON.parse(fs.readFileSync(path.join(h5Dir, '.precheck-report.json'), 'utf8'));
  if (report.title?.status !== 'pass' || report.share?.status !== 'pass') throw new Error('标题或分享检测未通过，停止发布');
  if (!report.readyForDeploy) throw new Error('readyForDeploy=false，停止发布');

  const output = run('上传', path.join(deployer, 'scripts/deploy.cjs'),
    [h5Dir, page, 'test', '--precheck-passed', '--skip-third-party-check'],
    { cwd: deployer, stdio: ['ignore', 'pipe', 'pipe'] });
  if (!output.includes(`访问地址: ${pageUrl}`)) throw new Error('发布输出中未找到预期的访问地址');

  // 回读核验：页面可访问、数据脚本与本地一致
  const html = (await fetchText(pageUrl)).toString('utf8');
  const dataUrl = (html.match(/src="(https:\/\/mat1\.gtimg\.com\/[^"]*\/penguin-data\.[0-9a-f]+\.js)"/) || [])[1];
  if (!dataUrl) throw new Error('线上页面未引用 penguin-data 脚本');
  const remote = await fetchText(dataUrl);
  const local = fs.readFileSync(path.join(h5Dir, 'assets/penguin-data.js'));
  const hash = buf => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
  if (hash(remote) !== hash(local)) throw new Error(`线上数据与本地不一致（${hash(remote)} ≠ ${hash(local)}）`);
  const status = JSON.parse(fs.readFileSync(path.join(rootDir, 'public/data/status.json'), 'utf8'));
  console.log(`H5_DEPLOYED url=${pageUrl} data=${hash(local)} data_updated_at=${status.updatedAt || "unknown"}`);
}

main().catch(error => {
  console.error(`H5_DEPLOY_FAILED ${error.message}`);
  process.exit(1);
});
