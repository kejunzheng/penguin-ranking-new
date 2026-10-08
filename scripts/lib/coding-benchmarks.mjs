import { getJson, getText, today } from './net.mjs';

export const CODING_REPLACEMENTS = {
  livecodebench: { id: 'deepswe', display_name: 'DeepSWE', canonical_name: 'DeepSWE v1.1', official_url: 'https://deepswe.datacurve.ai/' },
  aider_polyglot: { id: 'frontiercode', display_name: 'FrontierCode', canonical_name: 'FrontierCode 1.1', official_url: 'https://cognition.com/frontiercode' },
};

const validScore = score => typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 1;
const isoDate = value => /^\d{4}-\d{2}-\d{2}/.test(String(value || '')) ? String(value).slice(0, 10) : null;
function rankBest(entries, benchmarkId, source) {
  const best = new Map();
  for (const item of entries) {
    if (!item.model || !validScore(item.score)) continue;
    if (!best.has(item.model) || item.score > best.get(item.model).score) best.set(item.model, item);
  }
  if (!best.size) throw new Error(`${benchmarkId} 没有有效成绩，拒绝替换旧快照`);
  return [...best.values()].sort((a, b) => b.score - a.score || a.model.localeCompare(b.model)).map((item, index) => ({
    benchmarkId, raw: item.model, rank: index + 1, source,
    config: `${benchmarkId === 'deepswe' ? 'v1.1 · pass@1' : 'v1.1 · Main · new_score'}；${item.harness || '未注明 Agent'}；${item.effort || '未注明推理强度'}；每模型最高分配置`,
  }));
}

export function parseDeepSwe(payload) {
  if (!Array.isArray(payload?.rows)) throw new Error('DeepSWE rows 格式变更');
  const rows = rankBest(payload.rows.map(item => ({ model: item.model, score: item.pass_at_1, harness: item.harness, effort: item.reasoning_effort })), 'deepswe', CODING_REPLACEMENTS.livecodebench.official_url);
  return { date: today(), dataDate: isoDate(payload.generated_at), rows };
}
export async function fetchDeepSwe() {
  const parsed = parseDeepSwe(await getJson('https://deepswe.datacurve.ai/artifacts/v1.1/leaderboard-live.json'));
  if (parsed.rows.length < 5) throw new Error('DeepSWE 模型数量异常，保留上次快照');
  return parsed;
}

export function parseFrontierCode(payload, dataDate = null) {
  const revision = payload?.v1_1;
  if (!Array.isArray(revision?.models) || !revision.data || !revision.efforts) throw new Error('FrontierCode v1_1 格式变更');
  const entries = revision.models.flatMap(model => (revision.efforts[model] || []).map(effort => ({
    model, effort, harness: revision.harness?.[model], score: revision.data[model]?.[effort]?.main?.new_score,
  })));
  return { date: today(), dataDate: isoDate(dataDate), rows: rankBest(entries, 'frontiercode', CODING_REPLACEMENTS.aider_polyglot.official_url) };
}
export async function fetchFrontierCode() {
  const [payload, html] = await Promise.all([
    getJson('https://cognition.com/data/frontiercode-leaderboard/data.json'),
    getText('https://cognition.com/frontiercode'),
  ]);
  // 使用官方 Changelog 的最新日期，不能把每天抓取时间当作榜单更新时间。
  const dates = [...html.matchAll(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}, 20\d{2}\b/g)]
    .map(match => Date.parse(`${match[0]} UTC`)).filter(Number.isFinite).sort((a, b) => b - a);
  const parsed = parseFrontierCode(payload, dates.length ? new Date(dates[0]).toISOString() : null);
  if (parsed.rows.length < 5) throw new Error('FrontierCode 模型数量异常，保留上次快照');
  return parsed;
}
