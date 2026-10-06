// 开源产品榜 / Agent Skills 榜（GitHub Star 净增长）→ public/data/{product,skill}/{daily,weekly,monthly}.json + status.json
//
// 原站的榜单数据冻结在 2026-09-05，且没有可直接订阅的上游。这里改为自采集：
//   - 每次运行读取候选仓库的 github.com 页面，记录精确 Star 数（GitHub REST API 匿名额度在共享出口 IP 上经常耗尽）；
//   - 观测点保存在 .data-state/github-stars.json（需持久保存），初始基线来自原站公开的观测点 scripts/data/github-star-seed.json；
//   - 净增长 = 当前 Star − 约 24h / 7d / 30d 前的观测值；某周期基线不足 10 个可比仓库时保留旧榜单文件，不输出残缺榜单。
// 候选池与编辑内容（中文简介、能力标签等）沿用现有榜单文件，新仓库需人工补充 Logo 与简介后再加入候选池。
// DSH 频道已不在前台展示，不再更新（文件保留以兼容旧链接）。
import path from 'node:path';
import { dataDir, getText, readJson, repoRoot, reportFreshness, stateFile, writeJsonIfChanged } from './lib/net.mjs';

const CHANNELS = ['product', 'skill'];
const PERIODS = { daily: 24, weekly: 168, monthly: 720 };
const MAX_LAG_HOURS = { daily: 12, weekly: 36, monthly: 72 }; // 基线允许的最早偏差
const SLACK_HOURS = 2; // 基线允许的最晚偏差（09:00 / 00:00 两次运行间隔不等，留出余量）
const KEEP_DAYS = 45;
const now = new Date(), nowMs = now.getTime();

const seed = readJson(path.join(repoRoot, 'scripts', 'data', 'github-star-seed.json'), { repos: {} });
const statePath = stateFile('github-stars.json');
const state = readJson(statePath, { repos: {} });

// 候选池与编辑字段：固定来自 scripts/data/github-candidates.json（榜单文件只保留前 10，不能作为候选池来源）
const templates = new Map(), channelsOf = new Map(), previousRank = {};
for (const [fullName, row] of Object.entries(readJson(path.join(repoRoot, 'scripts', 'data', 'github-candidates.json'), { repos: {} }).repos)) {
  const { channels, ...template } = row;
  templates.set(fullName.toLowerCase(), { ...template, fullName });
  channelsOf.set(fullName.toLowerCase(), new Set(channels));
}
for (const channel of CHANNELS) for (const period of Object.keys(PERIODS)) {
  const rows = readJson(path.join(dataDir, channel, `${period}.json`), []);
  previousRank[`${channel}/${period}`] = new Map(rows.map(row => [row.fullName.toLowerCase(), row]));
}
for (const [fullName, meta] of Object.entries(seed.repos)) {
  const key = fullName.toLowerCase();
  const points = (state.repos[key] ??= { fullName, points: [] }).points;
  const seen = new Set(points.map(point => point[0]));
  for (const point of meta.points) if (!seen.has(point[0])) points.push(point);
}
const candidates = [...channelsOf.keys()].filter(key => templates.has(key));

function parseRepoPage(html) {
  const number = value => value == null ? null : Number(String(value).replace(/,/g, ''));
  return {
    stars: number(html.match(/aria-label="(\d+) users? starred this repository"/)?.[1]),
    forks: number(html.match(/id="repo-network-counter"[^>]*title="([\d,]+)"/)?.[1]),
  };
}
async function mapLimit(items, limit, task) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const index = next++; results[index] = await task(items[index]); }
  }));
  return results;
}

const failures = [];
const current = new Map();
await mapLimit(candidates, 4, async key => {
  const fullName = templates.get(key).fullName;
  try {
    const info = parseRepoPage(await getText(`https://github.com/${fullName}`, { timeout: 30000, headers: { accept: 'text/html' } }));
    if (!Number.isFinite(info.stars)) throw new Error('页面中未找到 Star 数');
    current.set(key, info);
    const entry = (state.repos[key] ??= { fullName, points: [] });
    entry.points.push([now.toISOString(), info.stars]);
  } catch (error) {
    failures.push(`${fullName}: ${error.message}`);
  }
});
const keepFrom = nowMs - KEEP_DAYS * 864e5;
for (const entry of Object.values(state.repos)) {
  entry.points = entry.points.filter(point => Date.parse(point[0]) >= keepFrom).sort((a, b) => Date.parse(a[0]) - Date.parse(b[0]));
}
writeJsonIfChanged(statePath, state);
if (current.size < candidates.length / 2) throw new Error(`GitHub 页面抓取成功率过低（${current.size}/${candidates.length}）：${failures.slice(0, 3).join('；')}`);

function pickBaseline(points, period) {
  const target = nowMs - PERIODS[period] * 3600e3;
  const latest = target + SLACK_HOURS * 3600e3, earliest = target - MAX_LAG_HOURS[period] * 3600e3;
  return points.filter(point => { const time = Date.parse(point[0]); return time >= earliest && time <= latest; }).at(-1) || null;
}
const rankRows = rows => rows.filter(row => row.starGrowth > 0)
  .sort((a, b) => b.starGrowth - a.starGrowth || b.stars - a.stars || a.repositoryId - b.repositoryId).slice(0, 10);

const status = readJson(path.join(dataDir, 'status.json'), {});
const periodStatus = {}, freshness = [];
for (const channel of CHANNELS) for (const [period] of Object.entries(PERIODS)) {
  const file = path.join(dataDir, channel, `${period}.json`);
  const previous = previousRank[`${channel}/${period}`];
  const comparable = [];
  let baselineAt = null;
  for (const key of candidates) {
    if (!channelsOf.get(key)?.has(channel) || !current.has(key)) continue;
    const baseline = pickBaseline(state.repos[key]?.points || [], period);
    if (!baseline) continue;
    baselineAt = !baselineAt || baseline[0] < baselineAt ? baseline[0] : baselineAt;
    const { stars, forks } = current.get(key);
    const template = templates.get(key);
    comparable.push({
      ...template,
      stars, forks: forks ?? template.forks,
      starGrowth: stars - baseline[1],
      growthRate: baseline[1] > 0 ? Number(((stars - baseline[1]) / baseline[1] * 100).toFixed(2)) : 0,
      trend: (state.repos[key].points || []).slice(-12).map(point => point[1]),
    });
  }
  const ranked = rankRows(comparable);
  const mature = ranked.length >= 10;
  periodStatus[period] = { ...(periodStatus[period] || {}), [channel]: { mature, comparable: comparable.length, baselineAt } };
  if (mature) {
    const day = now.toISOString().slice(0, 10);
    const rows = ranked.map((row, index) => {
      const before = previous.get(row.fullName.toLowerCase());
      const rank = index + 1;
      return {
        ...row, rank,
        rankChange: before?.rank ? before.rank - rank : 0,
        isNew: !before,
        firstRankedAt: before?.firstRankedAt || day,
        consecutiveAppearances: before ? (before.consecutiveAppearances || 1) + 1 : 1,
        bestRank: Math.min(rank, before?.bestRank || rank),
      };
    });
    writeJsonIfChanged(file, rows);
  }
  freshness.push({
    dataset: `${channel === 'product' ? '开源产品榜' : 'Agent Skills 榜'} · ${{ daily: '日榜', weekly: '周榜', monthly: '月榜' }[period]}`,
    file: `data/${channel}/${period}.json`, source: 'github.com 仓库页面（自采集 Star 快照）', mode: 'live',
    latest: mature ? now.toISOString() : status.updatedAt || '2026-09-05T23:00:01.574Z',
    note: mature ? null : `基线积累中：只有 ${comparable.length} 个仓库有约 ${PERIODS[period] / 24} 天前的观测值（需 ≥10），沿用旧榜单`,
  });
}
const anyUpdated = Object.values(periodStatus).some(item => Object.values(item).some(value => value.mature));
writeJsonIfChanged(path.join(dataDir, 'status.json'), {
  ...status,
  updatedAt: anyUpdated ? now.toISOString() : status.updatedAt,
  lastAttemptAt: now.toISOString(),
  source: 'github.com repository pages (self-collected star snapshots)',
  mode: 'live',
  periods: Object.fromEntries(Object.entries(periodStatus).map(([period, byChannel]) => [period, {
    mature: Object.values(byChannel).every(value => value.mature),
    baselineAt: Object.values(byChannel).map(value => value.baselineAt).filter(Boolean).sort()[0] || null,
    channels: byChannel,
  }])),
  failures: failures.slice(0, 20),
});
console.log(`GITHUB_${anyUpdated ? 'UPDATED' : 'BASELINE_PENDING'} repos=${current.size}/${candidates.length} failures=${failures.length} ` +
  Object.entries(periodStatus).map(([period, byChannel]) => `${period}=${Object.entries(byChannel).map(([channel, value]) => `${channel}:${value.mature ? 'ok' : `pending(${value.comparable})`}`).join('/')}`).join(' '));
reportFreshness(freshness);
