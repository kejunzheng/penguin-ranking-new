// 模型评测榜 → public/data/benchmarks.json
//
// 两层数据：
//   1. 基线：kejunzheng/penguin-model-capability-ranking 仓库的一次性导入（最后采集 2026-09-21，之后不再更新）。
//      作为模型元数据、SKU 归一与抓取失败时的兜底来源。
//   2. 实时：每次运行直接抓取全部 24 项 benchmark 的官方/公开数据源：
//      - Artificial Analysis 排行榜页面（内嵌数据）：AA 智能指数、AA-LCR、HLE、GPQA Diamond、MMMU-Pro
//      - Epoch AI 公开数据包：FrontierMath Tier 1-3、SimpleQA Verified
//      - ARC Prize、LMArena、OSWorld 2.0
//      - 其余 14 项见 scripts/lib/benchmark-sources.mjs 与 additional-benchmarks.mjs（口径逐一移植自上游导入脚本）
//      实时 benchmark 不再使用基线里的旧记录（避免新旧配置混排），历史快照保存在 .data-state/ 供「近一周/月/季」筛选。
//      同一数据源内容未变化时不新增快照，记录日期即该版本数据首次被抓到的日期。
//
// 抓取失败的数据源沿用上一次成功的快照；从未成功过才退回基线。前台只读取 date / rank / config / source。
import path from 'node:path';
import { dataDir, getBuffer, getJson, getText, readJson, reportFreshness, stateFile, today, writeJsonIfChanged } from './lib/net.mjs';
import { parseCsv, readZip } from './lib/formats.mjs';
import { CODING_REPLACEMENTS } from './lib/coding-benchmarks.mjs';
import { OFFICIAL_SOURCES } from './lib/benchmark-sources.mjs';
import { ADDITIONAL_BENCHMARKS, ADDITIONAL_SOURCES } from './lib/additional-benchmarks.mjs';

const UPSTREAM = 'https://raw.githubusercontent.com/kejunzheng/penguin-model-capability-ranking/main/data';
const STANDARD = '标准/未注明';
const HOME_MAX_AGE_MONTHS = 18;
const HISTORY_KEEP_DAYS = 100;
const HISTORY_OFFSETS = [7, 30, 90]; // 与前台「近一周 / 近一月 / 近一季」筛选对应
const runDate = today();

// ---------- 名称归一（移植自上游 scripts/build_model_skus.py，保证与基线 SKU 的 id 一致） ----------
const CONFIG_WORDS = /\b(?:non[- ]?reasoning|reasoning|thinking|adaptive|effort|fallback|high|low|medium|max|xhigh|auto|none)\b/i;
const SLUG_EFFORT = /\s+(xhigh|high|medium|low|max|minimal|thinking|non[- ]?reasoning|reasoning|adaptive|unknown|default)$/i;
export function extractSku(rawName) {
  let text = String(rawName || '').replace(/[🥇🥈🥉🤖]|🖼️?/gu, '').trim();
  const configuration = [];
  // 新增：OSWorld 等来源用 claude-opus-5[1m] 表示 1M 上下文版本，视为配置，归到基础模型
  const context = text.match(/\s*\[(\d+(?:\.\d+)?[km])\]\s*$/i);
  if (context) { configuration.push(`${context[1].toUpperCase()} 上下文`); text = text.slice(0, context.index).trim(); }
  const slugStyle = /^[a-z0-9_.-]+$/i.test(text) && /[-_]/.test(text);
  if (slugStyle) {
    text = text.replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
    // 新增：LMArena 等来源以 slug 发布（如 claude-opus-5.5-high），末尾的推理强度视为配置。
    for (let match = text.match(SLUG_EFFORT); match; match = text.match(SLUG_EFFORT)) {
      configuration.unshift(match[1]);
      text = text.slice(0, match.index);
    }
  }
  if (/\s*\((?:19|20)\d{2}(?:[-/]?\d{2}){1,2}\)\s*/i.test(text)) {
    text = text.replace(/\s*\((?:19|20)\d{2}(?:[-/]?\d{2}){1,2}\)\s*/gi, ' ');
    configuration.push('日期快照');
  }
  text = text.replace(/\s*\(([^()]*)\)\s*/g, (whole, inside) => {
    if (CONFIG_WORDS.test(inside.trim())) { configuration.push(inside.trim()); return ' '; }
    return whole;
  });
  const trailing = text.match(/\s+(?:w\/|with)\s+(.+)$/i);
  if (trailing && CONFIG_WORDS.test(trailing[1])) { configuration.push(trailing[1].trim()); text = text.slice(0, trailing.index); }
  const suffix = text.match(/\s+(?:thinking|adaptive reasoning|non[- ]?reasoning|reasoning)(?:\s+.*)?$/i);
  if (suffix) { configuration.push(suffix[0].trim()); text = text.slice(0, suffix.index); }
  text = text.replace(/\s+/g, ' ').replace(/^[ -]+|[ -]+$/g, '');
  const claude = text.match(/^Claude\s+(Haiku|Sonnet|Opus)\s+(\d+(?:\.\d+)?)$/i);
  if (claude) text = `Claude ${claude[2]} ${claude[1][0].toUpperCase()}${claude[1].slice(1).toLowerCase()}`;
  const display = text || String(rawName);
  const key = display.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return { key, display, config: [...new Set(configuration)].join('；') || STANDARD };
}
const looseKey = key => key.split('-').sort().join('-');

// ---------- 国家归一 ----------
const CHINA_CREATORS = ['Z AI', 'Zhipu AI', 'Kimi', 'Moonshot AI', 'Xiaomi', 'China Mobile', 'Alibaba', 'Qwen', 'DeepSeek', 'StepFun', 'MiniMax', 'InclusionAI', 'ByteDance Seed', 'ByteDance', 'LongCat', 'Meituan', 'Nanbeige', 'Tencent', 'Baidu', 'KwaiKAT', 'Kuaishou', 'OpenBMB', 'Baichuan', '01.AI'];
const US_CREATORS = ['OpenAI', 'Anthropic', 'Google', 'Google DeepMind', 'Meta', 'SpaceXAI', 'xAI', 'Amazon', 'Microsoft', 'NVIDIA', 'IBM', 'Perplexity', 'Inception', 'Databricks', 'Snowflake', 'Thinking Machines', 'Allen Institute for AI', 'ServiceNow', 'Arcee AI', 'Deep Cogito', 'Liquid AI', 'Nous Research', 'Reka AI', 'Prime Intellect'];

async function upstreamBaseline() {
  const read = name => getJson(`${UPSTREAM}/${name}`, { timeout: 120000 });
  const [benchmarkPayload, skus, records, snapshots] = await Promise.all(['benchmarks.json', 'model_skus.json', 'evaluation_records.json', 'leaderboard_snapshots.json'].map(read));
  return { benchmarkPayload, skus, records, snapshots };
}

// ---------- 实时数据源：每个返回 { date, rows:[{benchmarkId, raw, rank, org, country, releaseDate, openWeights, source, displayHint}] } ----------
async function fetchArtificialAnalysis() {
  const url = 'https://artificialanalysis.ai/leaderboards/models';
  const html = await getText(url, { timeout: 90000 });
  const payload = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)].map(match => JSON.parse(match[1])).join('');
  const extractArray = (key, predicate) => {
    let best = null;
    for (let start = payload.indexOf(key); start >= 0; start = payload.indexOf(key, start + 1)) {
      let depth = 0, end = start + key.length - 1, inString = false;
      for (; end < payload.length; end++) {
        const char = payload[end];
        if (inString) { if (char === '\\') end++; else if (char === '"') inString = false; continue; }
        if (char === '"') inString = true;
        else if (char === '[') depth++;
        else if (char === ']' && --depth === 0) break;
      }
      try {
        const items = JSON.parse(payload.slice(start + key.length - 1, end + 1));
        if (predicate(items) && (!best || items.length > best.length)) best = items;
      } catch {}
    }
    return best || [];
  };
  const models = extractArray('{"models":[', items => items.some(item => 'intelligenceIndex' in item));
  const releases = extractArray('"releases":[', items => items.some(item => item.releaseDate));
  if (models.length < 100) throw new Error(`AA 页面只解析到 ${models.length} 个模型，页面结构可能已变更`);
  const releaseBySlug = new Map(releases.map(item => [item.slug, item.releaseDate]));
  const fields = { intelligenceIndex: 'aa_intelligence_index', lcr: 'aa_lcr', hle: 'humanitys_last_exam', gpqa: 'gpqa_diamond', mmmuPro: 'mmmu_pro' };
  const rows = [];
  for (const [field, benchmarkId] of Object.entries(fields)) {
    const scored = models.filter(model => Number.isFinite(model[field])).sort((a, b) => b[field] - a[field]);
    scored.forEach((model, index) => rows.push({
      benchmarkId, raw: model.name, rank: index + 1, org: model.modelCreatorName, releaseDate: releaseBySlug.get(model.slug) || null,
      openWeights: typeof model.isOpenWeights === 'boolean' ? model.isOpenWeights : null, source: url,
      displayHint: releases.find(item => item.slug === model.slug)?.name || null,
    }));
  }
  // 价格斩杀线：AA 智能指数分数 + AA 标价（美元 / 百万 Token）。只要实测分数（排除 AA 估算值）且三项价格中至少有输入、输出价
  const points = models
    .filter(model => Number.isFinite(model.intelligenceIndex) && !model.intelligenceIndexIsEstimated && Number.isFinite(model.price1mInputTokens) && Number.isFinite(model.price1mOutputTokens))
    .map(model => ({ raw: model.name, score: model.intelligenceIndex, input: model.price1mInputTokens, output: model.price1mOutputTokens, cache: Number.isFinite(model.cacheHitPrice) ? model.cacheHitPrice : null }));
  return { date: runDate, rows, points, note: `${models.length} 个模型配置` };
}

async function fetchEpoch() {
  const zip = readZip(await getBuffer('https://epoch.ai/data/benchmark_data.zip', { timeout: 120000 }), ['frontiermath_tiers_1_3_v2.csv', 'simpleqa_verified.csv', 'model_metadata.csv']);
  const metadata = new Map(parseCsv(zip.get('model_metadata.csv')?.toString() || '').filter(row => row.model_version).map(row => [row.model_version, row]));
  const rows = [];
  for (const [file, benchmarkId, source] of [
    ['frontiermath_tiers_1_3_v2.csv', 'frontiermath', 'https://epoch.ai/benchmarks/frontiermath-tiers-1-3-v2'],
    ['simpleqa_verified.csv', 'simpleqa_verified', 'https://epoch.ai/benchmarks/simple-qa-verified'],
  ]) {
    const table = parseCsv(zip.get(file)?.toString() || '').filter(row => Number.isFinite(Number.parseFloat(row.mean_score)));
    if (table.length < 20) throw new Error(`Epoch ${file} 只有 ${table.length} 行`);
    table.sort((a, b) => Number(b.mean_score) - Number(a.mean_score)).forEach((row, index) => {
      const meta = metadata.get(row['Model version']);
      rows.push({
        benchmarkId, raw: meta?.display_name || row['Model version'], rank: index + 1, org: row.Organization || meta?.organization || null,
        country: row.Country || meta?.country || null, releaseDate: row['Release date'] || meta?.date || null, openWeights: null, source,
        displayHint: meta?.model_group || null,
      });
    });
  }
  return { date: runDate, rows };
}

async function fetchArcAgi2() {
  const [evaluations, models] = await Promise.all([
    getJson('https://arcprize.org/media/data/evaluations.json'),
    getJson('https://arcprize.org/media/data/models.json'),
  ]);
  const modelById = new Map(models.map(model => [model.id, model]));
  const table = evaluations.filter(row => row.datasetId === 'v2_Semi_Private' && row.display !== false && row.modelId !== '2025_human_panel' && Number.isFinite(Number(row.score)))
    .sort((a, b) => Number(b.score) - Number(a.score));
  if (table.length < 20) throw new Error(`ARC-AGI-2 只有 ${table.length} 行`);
  return {
    date: runDate,
    rows: table.map((row, index) => {
      const meta = modelById.get(row.modelId) || {};
      return { benchmarkId: 'arc_agi_2', raw: meta.displayName || row.modelId, rank: index + 1, org: meta.providerId || null,
        releaseDate: (meta.modelReleaseDate || '').slice(0, 10) || null, openWeights: null, source: 'https://arcprize.org/media/data/evaluations.json',
        displayHint: null };
    }),
  };
}

async function fetchLmarena() {
  const base = 'https://datasets-server.huggingface.co/rows?dataset=lmarena-ai/leaderboard-dataset&config=text&split=latest';
  const rows = [];
  let seenOverall = false;
  for (let offset = 0; offset < 3000; offset += 100) {
    const page = await getJson(`${base}&offset=${offset}&length=100`, { timeout: 90000 });
    const items = (page.rows || []).map(item => item.row);
    if (!items.length) break;
    const overall = items.filter(item => item.category === 'overall');
    rows.push(...overall);
    if (overall.length) seenOverall = true;
    if (seenOverall && overall.length < items.length) break; // overall 分类是连续的一段，读完即停
  }
  if (rows.length < 50) throw new Error(`LMArena overall 只有 ${rows.length} 行`);
  const date = rows.map(row => row.leaderboard_publish_date).filter(Boolean).sort().at(-1) || runDate;
  return {
    date,
    rows: rows.filter(row => Number.isFinite(row.rank)).map(row => ({
      benchmarkId: 'lmarena_text_overall', raw: row.model_name, rank: Math.round(row.rank), org: row.organization || null, releaseDate: null,
      openWeights: row.license ? !/proprietary/i.test(row.license) : null, source: 'https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset',
    })),
  };
}

async function fetchOsworld2() {
  const url = 'https://osworld-v2.xlang.ai/static/data/leaderboard/official-results.json';
  const payload = await getJson(url);
  // 沿用上游口径：只取官方默认版本 / 全量数据集 / 默认步数预算，不跨配置平均
  const version = 'v2.1', scope = 'full', steps = 500; // 官方 default 字段可能是 'all'，这里固定为上游导入时的协议
  const table = (payload.results || []).filter(row => row.releaseVersion === version && row.datasetScope === scope && row.stepBudget === steps && Number.isFinite(row.binaryAccuracy))
    .sort((a, b) => b.binaryAccuracy - a.binaryAccuracy);
  if (!table.length) throw new Error(`OSWorld 2.0 只有 ${table.length} 行`);
  return {
    date: String(payload.updatedAt || runDate).slice(0, 10),
    rows: table.map((row, index) => ({
      benchmarkId: 'osworld_2', raw: row.reasoning ? `${row.model} (${row.reasoning})` : row.model, rank: index + 1, org: row.modelFamily || null,
      releaseDate: null, openWeights: null, source: url,
    })),
  };
}

const LIVE_SOURCES = [
  { name: 'Artificial Analysis', benchmarks: ['aa_intelligence_index', 'aa_lcr', 'humanitys_last_exam', 'gpqa_diamond', 'mmmu_pro'], fetch: fetchArtificialAnalysis },
  { name: 'Epoch AI', benchmarks: ['frontiermath', 'simpleqa_verified'], fetch: fetchEpoch },
  { name: 'ARC Prize', benchmarks: ['arc_agi_2'], fetch: fetchArcAgi2 },
  { name: 'LMArena', benchmarks: ['lmarena_text_overall'], fetch: fetchLmarena },
  { name: 'OSWorld 2.0', benchmarks: ['osworld_2'], fetch: fetchOsworld2 },
  ...OFFICIAL_SOURCES,
  ...ADDITIONAL_SOURCES,
];
const LIVE_BENCHMARKS = new Set(LIVE_SOURCES.flatMap(source => source.benchmarks));
// 所有数据源与基线同时发起抓取（各源互不依赖，原先串行约 95 秒，并发后约 5 秒）；
// 结果仍在下方按 LIVE_SOURCES 的固定顺序逐个合并，保证输出与串行抓取完全一致。
const fetchedSources = LIVE_SOURCES.map(source => source.fetch().then(value => ({ value }), error => ({ error })));

// ---------- 主流程 ----------
const { benchmarkPayload, skus, records: upstreamRecords, snapshots } = await upstreamBaseline();
// 在原 Coding 列位置替换基准，移除旧记录而非仅修改显示名称。
benchmarkPayload.benchmarks = benchmarkPayload.benchmarks.map(benchmark => {
  const replacement = CODING_REPLACEMENTS[benchmark.id];
  return replacement ? { ...benchmark, ...replacement, update_mode: 'result_addition', ingestion_status: 'live' } : benchmark;
});
// AndroidWorld、RULER 暂无匹配成绩；MathVista 被专业图表基准 Chartography 替换，以维持 24 项。
const RETIRED_BENCHMARKS = new Set(['mathvista', 'androidworld', 'ruler']);
benchmarkPayload.benchmarks = benchmarkPayload.benchmarks.filter(benchmark => !RETIRED_BENCHMARKS.has(benchmark.id) && !ADDITIONAL_BENCHMARKS.some(item => item.id === benchmark.id)).concat(ADDITIONAL_BENCHMARKS);
const benchmarkOrder = ["lmarena_text_overall", "aa_intelligence_index", "livebench_overall", "swe_bench_verified", "deepswe", "frontiercode", "mmlu_pro", "gpqa_diamond", "simpleqa_verified", "humanitys_last_exam", "frontiermath", "arc_agi_2", "mmmu_pro", "chartography", "videommmu", "terminal_bench_4", "bfcl_v4", "gaia", "agents_last_exam", "osworld", "osworld_2", "longbench_v2", "aa_lcr", "graphwalks"];
benchmarkPayload.benchmarks.sort((a,b) => benchmarkOrder.indexOf(a.id) - benchmarkOrder.indexOf(b.id));
const activeBenchmarkIds = new Set(benchmarkPayload.benchmarks.map(benchmark => benchmark.id));
const recordsById = new Map(upstreamRecords.map(record => [record.record_id, record]));
const snapshotsById = new Map(snapshots.map(snapshot => [snapshot.snapshot_id, snapshot]));
const snapshotDate = record => snapshotsById.get(record.snapshot_id)?.snapshot_at?.slice(0, 10) || record.run_date || null;
const skuById = new Map(skus.map(sku => [sku.sku_id, sku]));
const skuByRawName = new Map();
for (const sku of skus) for (const raw of sku.raw_model_names || []) if (!skuByRawName.has(raw)) skuByRawName.set(raw, sku.sku_id);
const eligibleIds = new Set(skus.filter(sku => sku.homepage_eligible).map(sku => sku.sku_id));
const looseEligible = new Map();
for (const id of eligibleIds) { const key = looseKey(id); looseEligible.set(key, looseEligible.has(key) ? null : id); }
const countryByOrg = new Map();
for (const sku of skus) if (sku.organization && sku.organization_country && !countryByOrg.has(sku.organization.toLowerCase())) countryByOrg.set(sku.organization.toLowerCase(), sku.organization_country);
CHINA_CREATORS.forEach(org => countryByOrg.set(org.toLowerCase(), 'China'));
US_CREATORS.forEach(org => { if (!countryByOrg.has(org.toLowerCase())) countryByOrg.set(org.toLowerCase(), 'United States of America'); });

// 去掉日期/版本后缀与连字符差异后再与已入选模型比对（如 claude-haiku-4-5-20251001 → claude-4-5-haiku，o3-2025-04-16 → o3，qwen-3-6-plus → qwen3-6-plus）。
const stripSuffix = key => key.replace(/-(?:20\d\d-\d\d-\d\d|20\d{6}|\d{4})$/, '').replace(/-(?:instruct|chat)$/, '');
// 名称兜底匹配的候选：基线入选模型 + 上一次已上榜的模型。基线截止 2026-09-21，只用基线会让之后新上榜的模型
// （如 Claude Sonnet 5.5）在其他数据源里的变体名（claude-sonnet-5-5-xhigh-effort）全部匹配失败。
// 只影响“能否对上已有模型”，入选规则不变。
const matchableIds = new Set([...eligibleIds, ...(readJson(path.join(dataDir, 'benchmarks.json'))?.models || []).map(model => model.id)]);
const indexBy = transform => { const map = new Map(); for (const id of matchableIds) { const key = transform(id); map.set(key, map.has(key) ? null : id); } return map; };
// flatExact 先于去后缀比对：否则 qwen3-8-max 与 qwen3-8-max-0902 去后缀后相同、互相冲突，qwen-3-8-max 两边都对不上。
const flatExact = indexBy(id => id.replace(/-/g, ''));
const looseStripped = indexBy(id => looseKey(stripSuffix(id))), flatStripped = indexBy(id => stripSuffix(id).replace(/-/g, ''));
// 数据源只写产品名、站内 SKU 带参数规模的个别模型，逐个登记（不做通用的规模后缀剥离，避免 qwen3-8 误配 Qwen3.8 27B）。
const MODEL_ALIASES = { 'nemotron-3-ultra': 'nemotron-3-ultra-550b-a55b' };
const toEligible = id => {
  if (matchableIds.has(id)) return id;
  if (MODEL_ALIASES[id] && matchableIds.has(MODEL_ALIASES[id])) return MODEL_ALIASES[id];
  return flatExact.get(id.replace(/-/g, '')) || looseStripped.get(looseKey(stripSuffix(id))) || flatStripped.get(stripSuffix(id).replace(/-/g, '')) || null;
};
const TRAILING_EFFORT = /\s+(xhigh|high|medium|low|max|minimal|none)(?:\s+effort)?$/i;
const VENDOR_PREFIX = /^(?:openai|anthropic|google|meta|xai|moonshotai|mistralai)\s+/i;
function resolveModelId(raw) {
  const parsed = extractSku(raw);
  const direct = skuByRawName.get(raw) || parsed.key;
  const id = toEligible(direct) || toEligible(parsed.key);
  if (id) return { ...parsed, id };
  // 兜底：名称末尾不带括号的推理强度（如 “Grok 4.6 xHigh”“Claude Fable 5.1 Max Effort”）。
  // 只有去掉后能命中已入选模型才采用，避免把 “Qwen 3 Max” 这类产品名误拆。
  const effort = parsed.display.match(TRAILING_EFFORT);
  if (effort) {
    const stripped = extractSku(parsed.display.slice(0, effort.index));
    const matched = toEligible(stripped.key);
    if (matched) return { ...stripped, id: matched, config: parsed.config === STANDARD ? effort[0].trim() : `${parsed.config}；${effort[0].trim()}` };
  }
  // 兜底：MMLU-Pro 的月/年快照写法，如 “Gemini-3-Pro(11/25)”。各来源对 (05/28) 这类写法含义不一（月/日、年/月），
  // 因此只在去掉后与站内模型 id 完全一致时才合并，记为日期快照。
  const monthYear = parsed.display.match(/\s*\((?:0?[1-9]|1[0-2])\/\d{2}\)\s*$/);
  if (monthYear) {
    const stripped = extractSku(parsed.display.slice(0, monthYear.index));
    if (matchableIds.has(stripped.key)) return { ...stripped, id: stripped.key, config: stripped.config === STANDARD ? '日期快照' : `${stripped.config}；日期快照` };
  }
  // 兜底：名称前带厂商前缀（如 “OpenAI O3”“Moonshotai-Kimi-K2-Instruct”）。同样只在去掉后能命中已入选模型时采用。
  const vendor = parsed.display.match(VENDOR_PREFIX);
  if (vendor) {
    const stripped = extractSku(parsed.display.slice(vendor[0].length));
    const matched = toEligible(stripped.key);
    if (matched) return { ...stripped, id: matched, config: parsed.config };
  }
  return { ...parsed, id: direct };
}

// 历史状态：{ snapshots: { benchmarkId: { date: [[modelId, rank, config, source]] } }, models: { id: meta } }
const historyPath = stateFile('benchmark-history.json');
const history = readJson(historyPath, { snapshots: {}, models: {} });
const freshness = [];
const sourceStatus = new Map();
for (const [index, source] of LIVE_SOURCES.entries()) {
  try {
    const fetched = await fetchedSources[index];
    if (fetched.error) throw fetched.error;
    const { date, rows, note, dataDate = date, points } = fetched.value;
    if (points?.length) history.aaPricePoints = { date, points: points.map(point => { const { id, config } = resolveModelId(point.raw); return [id, point.score, point.input, point.output, point.cache, config]; }) };
    const grouped = new Map(source.benchmarks.map(id => [id, []]));
    for (const row of rows) {
      const { id, config, display } = resolveModelId(row.raw);
      // row.config：数据源给出的完整配置，直接采用；row.configSuffix：只描述一个维度（如 BFCL 的调用方式），
      // 追加到名称里解析出的配置（如推理 / 非推理）之后，避免互相覆盖。
      const merged = row.configSuffix ? (config !== STANDARD ? `${config}；${row.configSuffix}` : row.configSuffix) : row.config || config;
      grouped.get(row.benchmarkId)?.push(Number.isFinite(row.score) ? [id, row.rank, merged, row.source, row.score] : [id, row.rank, merged, row.source]);
      const meta = history.models[id] || {};
      const releaseDate = row.releaseDate && /^\d{4}-\d{2}-\d{2}$/.test(row.releaseDate) ? row.releaseDate : null;
      history.models[id] = {
        name: meta.nameSource === 'hint' ? meta.name : (row.displayHint || meta.name || display),
        nameSource: row.displayHint || meta.nameSource === 'hint' ? 'hint' : 'raw',
        organization: meta.organization || row.org || null,
        country: meta.country || row.country || countryByOrg.get(String(row.org || '').toLowerCase()) || null,
        openWeights: meta.openWeights ?? row.openWeights ?? null,
        releaseDate: [meta.releaseDate, releaseDate].filter(Boolean).sort()[0] || null, // 同一产品取最早发布日期
      };
    }
    for (const [benchmarkId, entries] of grouped) {
      if (!entries.length) continue;
      const byDate = (history.snapshots[benchmarkId] ??= {});
      const previousDate = Object.keys(byDate).filter(day => day < date).sort().at(-1);
      // 数据源内容与上一份快照完全相同时不重复保存（冻结的数据源每天都会抓到同样的内容）
      if (previousDate && JSON.stringify(byDate[previousDate]) === JSON.stringify(entries)) delete byDate[date];
      else byDate[date] = entries;
    }
    sourceStatus.set(source.name, { ok: true, date, note, dataDate });
    (history.sourceDates ??= {})[source.name] = dataDate ?? null;
    console.log(`  ${source.name}: ok date=${date} source_latest=${dataDate ?? '未知'} rows=${rows.length}`);
  } catch (error) {
    sourceStatus.set(source.name, { ok: false, error: error.message });
    console.log(`  ${source.name}: 失败，沿用上次快照（${error.message}）`);
  }
}
// 清理过期历史
const keepFrom = new Date(Date.now() - HISTORY_KEEP_DAYS * 864e5).toISOString().slice(0, 10);
for (const byDate of Object.values(history.snapshots)) for (const date of Object.keys(byDate)) if (date < keepFrom) delete byDate[date];

// 选取要输出的快照：最新一份 + 距最新 7/30/90 天前最近的一份
function selectSnapshots(byDate) {
  const dates = Object.keys(byDate || {}).sort();
  if (!dates.length) return [];
  const latest = dates.at(-1), chosen = new Set([latest]);
  for (const offset of HISTORY_OFFSETS) {
    const cutoff = new Date(Date.parse(latest) - offset * 864e5).toISOString().slice(0, 10);
    const candidate = dates.filter(date => date <= cutoff).at(-1);
    if (candidate) chosen.add(candidate);
  }
  return [...chosen].sort();
}

// GAIA 官方结果表按“提交的 Agent 系统”排名（3800+ 条，绝大多数是 Agent 框架而非模型），
// 原始名次对模型没有可比性；这里只保留能对应到收录模型的条目，同一模型取最好一次，再按收录模型重新排名。
// 历史快照仍保存原始名次，重排只发生在输出阶段。
const RERANK_AMONG_TRACKED = new Set(['gaia']);
function rankedEntries(benchmarkId, entries) {
  if (!RERANK_AMONG_TRACKED.has(benchmarkId)) return entries;
  const best = new Map();
  for (const entry of entries) {
    if (!matchableIds.has(entry[0])) continue;
    if (!best.has(entry[0]) || entry[1] < best.get(entry[0])[1]) best.set(entry[0], entry);
  }
  return [...best.values()].sort((a, b) => a[1] - b[1]).map(([id, , config, source], index) => [id, index + 1, config, source]);
}

const modelRecords = new Map(); // id -> { benchmarkId: [record] }
const addRecord = (id, benchmarkId, record) => ((modelRecords.has(id) ? modelRecords : modelRecords.set(id, {})).get(id)[benchmarkId] ??= []).push(record);
const liveFromState = new Set();
for (const benchmarkId of LIVE_BENCHMARKS) {
  const dates = selectSnapshots(history.snapshots[benchmarkId]);
  if (!dates.length) continue;
  liveFromState.add(benchmarkId);
  for (const date of dates) {
    for (const [id, rank, config, source, score] of rankedEntries(benchmarkId, history.snapshots[benchmarkId][date])) {
      // 保留所选快照的全部来源条目：同配置也可能有多个独立名次，不能按模型+配置覆盖。
      addRecord(id, benchmarkId, { date, rank, source, config, ...(Number.isFinite(score) ? { score } : {}) });
    }
  }
}
// 基线记录：冻结 benchmark 全部保留；实时 benchmark 仅在从未成功抓取时作为兜底
for (const sku of skus) {
  for (const recordId of sku.record_ids) {
    const record = recordsById.get(recordId);
    if (!record || !activeBenchmarkIds.has(record.benchmark_id) || (LIVE_BENCHMARKS.has(record.benchmark_id) && liveFromState.has(record.benchmark_id))) continue;
    addRecord(sku.sku_id, record.benchmark_id, { date: snapshotDate(record), rank: record.rank, source: record.source_url, config: sku.record_configurations[recordId] || STANDARD });
  }
}

// 显示名称统一为官方写法：Claude 4 起型号名在前（Claude Opus 4.8），基线沿用旧写法（Claude 4.8 Opus）。
// 只改显示名称，模型 id 与成绩匹配不变；Claude 3.x 官方本就是 “Claude 3.5 Sonnet”，保持原样。
// 官方写法：Claude 4 起为“Claude 家族 版本”；GPT 用连字符（GPT-5.2），gpt-oss 全小写；数据源给出全小写的 DeepSeek 名称时恢复大小写（DeepSeek V4 Flash）
const officialName = name => String(name)
  .replace(/^Claude (\d+(?:\.\d+)?) (Haiku|Sonnet|Opus)$/, (whole, version, family) => Number.parseFloat(version) >= 4 ? `Claude ${family} ${version}` : whole)
  .replace(/^gpt[- ]oss[- ](\d+)b$/i, 'gpt-oss-$1b')
  .replace(/^Deepseek\b/, 'DeepSeek')
  .replace(/^deepseek( [a-z0-9. ]+)$/, (whole, rest) => `DeepSeek${rest.replace(/ ([a-z])/g, (space, letter) => ` ${letter.toUpperCase()}`)}`)
  .replace(/^gpt[ -](\d+(?:\.\d+)?)\b(.*)$/i, (whole, version, rest) => `GPT-${version}${rest.replace(/\b(instant|codex|pro)\b/g, word => word[0].toUpperCase() + word.slice(1))}`);
// 入选规则沿用基线：基线已入选的模型保留；新模型需有可靠发布日期、≤18 个月、覆盖 ≥2 项 benchmark
const cutoffDate = new Date(); cutoffDate.setUTCMonth(cutoffDate.getUTCMonth() - HOME_MAX_AGE_MONTHS);
const recencyCutoff = cutoffDate.toISOString().slice(0, 10);
const models = [];
for (const [id, records] of modelRecords) {
  const sku = skuById.get(id), meta = history.models[id] || {};
  const coverage = Object.keys(records).length;
  const releaseDate = sku?.model_release_date || meta.releaseDate || null;
  const admitted = eligibleIds.has(id) || (releaseDate && releaseDate >= recencyCutoff && releaseDate <= runDate && coverage >= 2);
  if (!admitted) continue;
  for (const entries of Object.values(records)) entries.sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER));
  models.push({
    id,
    name: officialName(sku?.homepage_eligible ? sku.display_name : meta.name || sku?.display_name || id),
    // 基线已入选模型沿用基线元数据；新模型优先用实时来源（AA/Epoch 的厂商名大小写更规范）
    organization: (eligibleIds.has(id) ? sku?.organization : meta.organization) || sku?.organization || meta.organization || null,
    country: (eligibleIds.has(id) ? sku?.organization_country : meta.country) || sku?.organization_country || meta.country || null,
    openWeights: (eligibleIds.has(id) ? sku?.open_weights : meta.openWeights) ?? sku?.open_weights ?? meta.openWeights ?? null,
    releaseDate,
    records,
  });
}
models.sort((a, b) => (b.releaseDate || '').localeCompare(a.releaseDate || '') || a.id.localeCompare(b.id));

const officialUrlById = new Map(benchmarkPayload.benchmarks.map(benchmark => [benchmark.id, benchmark.official_url]));
const representedModelIds = new Set(models.map(model => model.id));
const benchmarks = benchmarkPayload.benchmarks.map(benchmark => {
  const dates = models.flatMap(model => (model.records[benchmark.id] || []).map(record => record.date)).filter(Boolean);
  const snapshotDates = liveFromState.has(benchmark.id) ? selectSnapshots(history.snapshots[benchmark.id]) : [];
  const latestSnapshot = snapshotDates.at(-1);
  const sourceEntries = latestSnapshot ? rankedEntries(benchmark.id, history.snapshots[benchmark.id][latestSnapshot]) : [];
  const excludedTop10 = sourceEntries.filter(([id, rank]) => rank <= 10 && !representedModelIds.has(id)).map(([id, rank, config]) => ({ rank, name: history.models[id]?.name || id, config }));
  return { ...benchmark, ...(benchmark.source_name ? { source_data_date: history.sourceDates?.[benchmark.source_name] || null, source_snapshot_date: latestSnapshot } : {}), snapshot_dates: snapshotDates, rank_audit: latestSnapshot ? { snapshot_date: latestSnapshot, rank_basis: RERANK_AMONG_TRACKED.has(benchmark.id) ? 'included_models' : benchmark.rank_basis || 'source', source_entry_count: sourceEntries.length, included_entry_count: sourceEntries.filter(([id]) => representedModelIds.has(id)).length, excluded_top10: excludedTop10 } : null, latest_date: dates.sort().at(-1) || benchmarkPayload.generated_at.slice(0, 10), model_count: models.filter(model => model.records[benchmark.id]?.length).length };
});
// 精简：source 与该 benchmark 官方地址相同时省略（前台以 official_url 兜底）
for (const model of models) for (const [benchmarkId, entries] of Object.entries(model.records)) {
  for (const entry of entries) if (!entry.source || entry.source === officialUrlById.get(benchmarkId)) delete entry.source;
}

if (benchmarks.length < 10 || models.length < 100) throw new Error(`Benchmark 数据过少：benchmarks=${benchmarks.length} models=${models.length}`);
// 价格斩杀线数据：只保留评测榜收录的模型；同一模型多个推理配置时取 AA 分数最高的一条（价格按该配置）
const outputIds = new Set(models.map(model => model.id));
const pricePoints = new Map();
for (const [id, score, input, outputPrice, cache, config] of history.aaPricePoints?.points || []) {
  if (!outputIds.has(id)) continue;
  if (!pricePoints.has(id) || score > pricePoints.get(id).score) pricePoints.set(id, { id, score: Math.round(score * 10) / 10, input, output: outputPrice, cache, config });
}
const globalPrices = readJson(path.join(dataDir, 'global-prices.json'), {});
const priceFrontier = history.aaPricePoints ? {
  source: 'Artificial Analysis',
  source_url: 'https://artificialanalysis.ai/leaderboards/models',
  date: history.aaPricePoints.date,
  currency: 'USD',
  usd_to_cny: globalPrices.usd_to_cny || null,
  blend: { cache: 7, input: 2, output: 1 },
  points: [...pricePoints.values()].sort((a, b) => b.score - a.score),
} : null;

const output = {
  schema_version: '1.1',
  generated_at: new Date().toISOString(),
  source_repository: 'https://github.com/kejunzheng/penguin-model-capability-ranking',
  source_page: 'https://kejunzheng.github.io/penguin-model-capability-ranking/',
  benchmarks,
  models,
  price_frontier: priceFrontier,
};
writeJsonIfChanged(stateFile('benchmark-history.json'), history);
const target = path.join(dataDir, 'benchmarks.json');
writeJsonIfChanged(target, output);

const STALE_DAYS = 45;
const staleBefore = new Date(Date.now() - STALE_DAYS * 864e5).toISOString().slice(0, 10);
for (const benchmark of benchmarks) {
  const source = LIVE_SOURCES.find(item => item.benchmarks.includes(benchmark.id));
  const status = source && sourceStatus.get(source.name);
  const sourceLatest = source ? history.sourceDates?.[source.name] : null;
  let note = null;
  if (!source) note = '无自动数据源，停在上游导入时的快照';
  else if (!status?.ok) note = liveFromState.has(benchmark.id) ? `本次抓取失败，沿用上次快照：${status?.error}` : `抓取失败且无历史快照，退回基线：${status?.error}`;
  else if (sourceLatest === null) note = '已接入；数据源未标注更新日期，无法判断是否最新';
  else if (sourceLatest && sourceLatest < staleBefore) note = `已接入；数据源自身最新条目为 ${sourceLatest}，上游近 ${STALE_DAYS} 天未更新`;
  freshness.push({
    dataset: `模型评测榜 · ${benchmark.display_name}`,
    benchmark: benchmark.id,
    source: source ? source.name : '上游仓库一次性导入（kejunzheng/penguin-model-capability-ranking）',
    mode: source ? 'live' : 'frozen',
    latest: sourceLatest || benchmark.latest_date,
    models: benchmark.model_count,
    note,
  });
}
const newModels = models.filter(model => !eligibleIds.has(model.id)).map(model => `${model.name}(${model.releaseDate})`);
console.log(`  新增模型（最新 15 个）：${newModels.slice(0, 15).join('、')}`);
console.log(`BENCHMARKS_UPDATED generated_at=${output.generated_at} benchmarks=${benchmarks.length} models=${models.length} new_models=${newModels.length}`);
reportFreshness(freshness);
