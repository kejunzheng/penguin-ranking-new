#!/usr/bin/env node
/**
 * 每日数据更新 + 静态站点发布（定时任务入口）。
 *
 * 流程：
 *   1. 依赖：node_modules 缺失或 package-lock.json 变化时执行 `npm ci`（仅安装到仓库本地）。
 *   2. 抓取：依次运行 scripts/update-benchmarks.mjs、scripts/update-skillhub.mjs；单个数据源失败不影响其他数据源。
 *   3. 校验：运行数据测试；失败则把 public/data 回滚到本次运行前的版本。
 *   4. 构建：`npm run build`，产物为 dist/client（index.html + assets + data）。
 *   5. 发布：把 dist/client 原子替换到 <out>/site，并写入 <out>/manifest.json。
 *      构建失败时不替换线上目录，旧版本继续可用。
 *
 * 用法：
 *   node scripts/daily-cdn.mjs --out <发布目录>
 *   node scripts/daily-cdn.mjs --out <发布目录> --skip-fetch   # 只重新构建发布，不抓取
 *
 * 退出码：抓取部分失败但其余流程完成时返回 0，并在输出中注明；构建/发布失败返回 1。
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const out = path.resolve(arg('--out', path.join(repo, '..', 'penguin-index-cdn')));
const skipFetch = argv.includes('--skip-fetch');
const dataDir = path.join(repo, 'public', 'data');
const startedAt = new Date();
const log = (...items) => console.log(`[${new Date().toISOString()}]`, ...items);

function run(command, args, { allowFail = false } = {}) {
  log('$', command, args.join(' '));
  const result = spawnSync(command, args, { cwd: repo, encoding: 'utf8', env: { ...process.env, CI: '1' }, maxBuffer: 64 * 1024 * 1024 });
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  if (output) console.log(output.split('\n').filter(line => !line.startsWith('FRESHNESS ')).slice(-15).join('\n'));
  if (result.status !== 0 && !allowFail) throw new Error(`${command} ${args.join(' ')} 失败（exit ${result.status}）`);
  return { ok: result.status === 0, output };
}

const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

// 防止上一次运行未结束时重复执行（锁超过 2 小时视为残留）。
fs.mkdirSync(out, { recursive: true });
const lock = path.join(out, '.lock');
if (fs.existsSync(lock) && Date.now() - fs.statSync(lock).mtimeMs < 2 * 3600 * 1000) {
  console.log('上一次任务仍在运行，本次跳过。');
  process.exit(0);
}
fs.writeFileSync(lock, String(process.pid));

const summary = { fetch: {}, freshness: [], tests: null, build: null };
const backup = path.join(out, '.data-backup');
try {
  // 1. 依赖
  const lockHash = sha256(path.join(repo, 'package-lock.json'));
  const stamp = path.join(repo, 'node_modules', '.penguin-lock-hash');
  if (!fs.existsSync(stamp) || fs.readFileSync(stamp, 'utf8') !== lockHash) {
    run('npm', ['ci', '--no-audit', '--no-fund']);
    fs.writeFileSync(stamp, lockHash);
  }

  // 2. 抓取（先备份当前数据，校验失败时回滚）
  if (!skipFetch) {
    fs.rmSync(backup, { recursive: true, force: true });
    fs.cpSync(dataDir, backup, { recursive: true });
    // 顺序有依赖：china-prices 叠加在 models.json 之上；global-prices 使用 models.json 中的汇率。
    for (const [name, script] of [
      ['models', 'scripts/update-models.mjs'],
      ['china-prices', 'scripts/update-china-prices.mjs'],
      ['global-prices', 'scripts/update-global-prices.mjs'],
      ['benchmarks', 'scripts/update-benchmarks.mjs'],
      ['skillhub', 'scripts/update-skillhub.mjs'],
      ['github', 'scripts/update-github.mjs'],
    ]) {
      const result = run('node', [script], { allowFail: true });
      const lines = result.output.split('\n');
      for (const line of lines) if (line.startsWith('FRESHNESS ')) summary.freshness.push(...JSON.parse(line.slice(10)));
      const message = lines.filter(line => !line.startsWith('FRESHNESS ') && line.trim()).at(-1) || '';
      summary.fetch[name] = result.ok ? message || 'ok' : `失败，保留旧数据：${message}`;
      if (!result.ok) summary.freshness.push({ dataset: name, mode: 'failed', note: message });
    }

    // 3. 校验
    const tests = run('node', ['--test', 'tests/data.test.mjs', 'tests/benchmark-data.test.mjs', 'tests/coding-benchmarks.test.mjs', 'tests/global-prices.test.mjs'], { allowFail: true });
    summary.tests = tests.ok ? 'passed' : 'failed';
    if (!tests.ok) {
      log('数据校验失败，回滚 public/data');
      fs.rmSync(dataDir, { recursive: true, force: true });
      fs.cpSync(backup, dataDir, { recursive: true });
    }
    fs.rmSync(backup, { recursive: true, force: true });
  }

  // 4. 构建
  run('npm', ['run', 'build']);
  summary.build = 'ok';

  // 5. 原子发布：先拷到临时目录，再整体替换 <out>/site
  const client = path.join(repo, 'dist', 'client');
  const staging = path.join(out, `.site-${Date.now()}`);
  const site = path.join(out, 'site');
  const previous = path.join(out, '.site-previous');
  fs.cpSync(client, staging, { recursive: true });
  fs.rmSync(previous, { recursive: true, force: true });
  if (fs.existsSync(site)) fs.renameSync(site, previous);
  fs.renameSync(staging, site);
  fs.rmSync(previous, { recursive: true, force: true });

  const files = {};
  for (const name of fs.readdirSync(path.join(site, 'data'), { recursive: true })) {
    const file = path.join(site, 'data', name);
    if (!fs.statSync(file).isFile()) continue;
    let generatedAt = null;
    try {
      const json = JSON.parse(fs.readFileSync(file, 'utf8'));
      generatedAt = json.generated_at || json.updated_at || json.updatedAt || null;
    } catch {}
    files[`data/${name.split(path.sep).join('/')}`] = { bytes: fs.statSync(file).size, sha256: sha256(file).slice(0, 16), generatedAt };
  }
  const manifest = { publishedAt: new Date().toISOString(), startedAt: startedAt.toISOString(), entry: 'site/index.html', ...summary, files };
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // 新鲜度报告：哪些数据已更新到最新、哪些停在旧快照
  const stale = item => item.mode !== 'live' || item.note;
  const reportLines = [
    `# Penguin Index 数据新鲜度报告`, '', `生成时间：${manifest.publishedAt}`, '',
    '| 数据 | 方式 | 数据最新时间 | 说明 |', '|---|---|---|---|',
    ...summary.freshness.map(item => `| ${item.dataset} | ${{ live: '自动抓取', frozen: '冻结快照', failed: '抓取失败' }[item.mode] || item.mode} | ${String(item.latest || '—').slice(0, 16).replace('T', ' ')} | ${item.note || (item.models ? `${item.models} 个模型` : '')} |`),
    '', `需要关注：${summary.freshness.filter(stale).length} 项未能更新到最新。`,
  ];
  fs.writeFileSync(path.join(out, 'freshness.md'), reportLines.join('\n') + '\n');

  const total = Object.values(files).reduce((sum, item) => sum + item.bytes, 0);
  console.log('\n=== Penguin Index 每日更新完成 ===');
  for (const [name, status] of Object.entries(summary.fetch)) console.log(`${name}: ${status}`);
  console.log(`数据校验: ${summary.tests ?? '跳过'}；构建: ok；数据总量: ${(total / 1024).toFixed(0)} KB`);
  console.log(`未更新到最新的数据: ${summary.freshness.filter(item => item.mode !== 'live' || item.note).length} 项（详见 freshness.md）`);
  console.log(`发布目录: ${site}`);
} catch (error) {
  if (fs.existsSync(backup)) {
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.cpSync(backup, dataDir, { recursive: true });
    fs.rmSync(backup, { recursive: true, force: true });
  }
  console.error(`\n=== Penguin Index 每日更新失败，线上保持上一版本 ===\n${error.message}`);
  process.exitCode = 1;
} finally {
  fs.rmSync(lock, { force: true });
}
