// 国内模型价格：直接抓取各厂商官方定价页 → 覆盖 public/data/models.json 中的 prices 部分。
//
// 背景：原站数据源（腾讯 CDN 的 frontend-data.json）中的国内价格自 2026-08-18 起不再更新，调用量部分仍正常。
// 因此 update-models.mjs 照常写入原站数据后，由本脚本把官方价格叠加上去：
//   1. 叠加历史：.data-state/china-prices.json 保存本站采集过的模型（含逐日价格历史），每次运行先合并回原站数据；
//   2. 抓取官方定价页（scripts/lib/china-price-sources.mjs），按模型 ID 匹配并更新最新价格、追加当日历史；
//   3. 某厂商解析健康（匹配到 ≥2 个已有模型）时：官网不再列出的在售模型标记为 legacy（前台隐藏，历史保留），
//      官网新出现的文本模型自动收录（日期快照版本除外）；
//   4. 价格较上次变化超过 10 倍视为解析异常，跳过该模型。
// 抓取失败的厂商保留上一次的数据，并在新鲜度报告中注明。零一万物官网已无价格页，沿用原站快照。
import path from 'node:path';
import { CHINA_PRICE_SOURCES, TEXT_ONLY, fetchChinaPrices } from './lib/china-price-sources.mjs';
import { dataDir, getJson, readJson, reportFreshness, stateFile, writeJsonIfChanged } from './lib/net.mjs';

const target = path.join(dataDir, 'models.json');
const statePath = stateFile('china-prices.json');
const data = readJson(target);
if (!data?.prices?.models?.length) throw new Error('models.json 中没有 prices 数据，请先运行 update-models.mjs');
const prices = data.prices;
const rate = prices.usd_to_cny;
const state = readJson(statePath, { models: {}, sources: {} });
const now = new Date();
const today = new Date(now.getTime() + 8 * 3600e3).toISOString().slice(0, 10); // 北京时间日期
const HISTORY_LIMIT = 400;

const key = text => String(text || '').toLowerCase().replace(/^tencent\s+/, '').replace(/[\s\-_]/g, '');
const round4 = value => Number(value.toFixed(4));
function mergeHistory(...lists) {
  const byDate = new Map();
  for (const list of lists) for (const entry of list || []) byDate.set(entry[0], entry);
  return [...byDate.values()].sort((a, b) => a[0].localeCompare(b[0])).slice(-HISTORY_LIMIT);
}

// 1. 原站数据 + 本站已采集数据
const models = new Map(prices.models.map(model => [model.slug, model]));
for (const [slug, saved] of Object.entries(state.models)) {
  const upstream = models.get(slug);
  if (!upstream) { models.set(slug, saved); continue; }
  const latest = (upstream.latest?.date || '') > (saved.latest?.date || '') ? upstream.latest : saved.latest; // 原站恢复更新时以较新的为准
  models.set(slug, { ...upstream, ...saved, latest, history: mergeHistory(upstream.history, saved.history) });
}

// 2. 抓取官方定价页
const providers = Object.keys(CHINA_PRICE_SOURCES);
const results = await Promise.allSettled(providers.map(provider => fetchChinaPrices(provider)));
const report = [], touched = new Set(), warnings = [];
const isSnapshot = id => /-(\d{4}|\d{6}|\d{8}|\d{4}-\d{2}-\d{2})$|-latest$/i.test(id);
// 官方 ID → 展示名（与原站风格一致，如 qwen3.8-max → Qwen3.8 Max、doubao-seed-2.1-lite → Doubao Seed 2.1 Lite）
const BRANDS = { qwen: 'Qwen', qvq: 'QVQ', qwq: 'QwQ', doubao: 'Doubao', step: 'Step', kimi: 'Kimi', glm: 'GLM', ernie: 'ERNIE', hy: 'Hy', minimax: 'MiniMax', deepseek: 'DeepSeek', baichuan: 'Baichuan', hunyuan: 'Hunyuan' };
function displayName(id) {
  if (/[A-Z]/.test(id) && !/ [a-z]/.test(id)) return id;
  return id.split(/[-\s]+/).map(token => {
    const brand = Object.keys(BRANDS).find(prefix => token.toLowerCase().startsWith(prefix) && /^[\d.]*$/.test(token.slice(prefix.length)));
    if (brand) return BRANDS[brand] + token.slice(brand.length);
    if (/^(a?\d+(\.\d+)?[bkmt]|vl|ocr|mt\d*|r\d|x\d.*|z\d)$/i.test(token)) return token.toUpperCase();
    return token[0].toUpperCase() + token.slice(1);
  }).join(' ');
}
const guessCategory = id => /omni/i.test(id) ? 'multimodal' : /audio/i.test(id) ? 'audio' : /vl|vision|ocr|qvq|\dv\b|\dv-/i.test(id) ? 'vision' : /coder|code/i.test(id) ? 'coding' : /think|reason|qwq|-r1|z1|x1/i.test(id) ? 'reasoning'
  : /mt|translat/i.test(id) ? 'translation' : /long/i.test(id) ? 'long-context' : /flash|lite|mini|turbo|air|speed/i.test(id) ? 'lite' : 'flagship';

function applyPrice(model, row, url) {
  const previous = model.latest;
  if (previous && previous.input_cny > 0 && previous.output_cny > 0) {
    const ratio = Math.max(row.input / previous.input_cny, previous.input_cny / Math.max(row.input, 1e-9), row.output / previous.output_cny, previous.output_cny / Math.max(row.output, 1e-9));
    if (ratio > 10) { warnings.push(`${model.slug}: ${previous.input_cny}/${previous.output_cny} → ${row.input}/${row.output}，变化过大已跳过`); return false; }
  }
  model.latest = { date: today, input_cny: row.input, output_cny: row.output, input_usd: round4(row.input / rate), output_usd: round4(row.output / rate) };
  model.history = mergeHistory(model.history, [[today, row.input, row.output]]);
  if (row.tiered) { model.has_price_tiers = true; model.price_tier_label = row.tier; }
  else if (row.tier) model.price_tier_label = row.tier;
  if (row.context && !model.context_length) model.context_length = row.context;
  model.price_source_url = url;
  touched.add(model.slug);
  return true;
}

for (const [index, provider] of providers.entries()) {
  const result = results[index];
  const own = [...models.values()].filter(model => model.provider === provider);
  if (result.status === 'rejected') {
    report.push({ provider, status: 'failed', error: String(result.reason?.message || result.reason).slice(0, 200), checked_at: now.toISOString() });
    continue;
  }
  const { rows, url } = result.value;
  const index_ = new Map();
  for (const model of own) for (const name of [model.slug, model.name]) if (!index_.has(key(name))) index_.set(key(name), model);
  const matched = new Set(), added = [];
  for (const row of rows) {
    const model = index_.get(key(row.id)) || index_.get(key(row.display));
    if (model) { if (!matched.has(model.slug) && applyPrice(model, row, url)) matched.add(model.slug); continue; }
  }
  // 健康度：至少匹配到在售模型的 20%（且 ≥1 个），否则视为页面改版/解析异常，不做上下线判断
  const activeOwn = own.filter(model => (model.status ?? 'active') === 'active' || model.auto_delisted).length;
  const healthy = matched.size >= Math.max(1, Math.ceil(activeOwn * 0.2));
  if (healthy) {
    const providerName = Object.entries(own.reduce((count, model) => ({ ...count, [model.provider_name]: (count[model.provider_name] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1])[0]?.[0] || provider;
    for (const row of rows) {
      if (index_.has(key(row.id)) || index_.has(key(row.display)) || !TEXT_ONLY(row.id) || isSnapshot(row.id)) continue;
      const slug = row.id.toLowerCase().replace(/\s+/g, '-');
      if (models.has(slug)) continue;
      const model = {
        slug, name: displayName(row.display || row.id), provider, provider_name: providerName, category: guessCategory(row.id),
        context_length: row.context, is_open_source: null, supports_tools: null, supports_vision: /vl|vision|qvq|omni|\dv\b|\dv-/i.test(row.id) ? true : null,
        release_date: null, status: 'active', status_note: `官方定价页新增模型（${today} 自动收录）`, auto_added: today,
        has_price_tiers: false, price_tier_label: null, latest: null, history: [],
      };
      if (applyPrice(model, row, url)) { models.set(slug, model); added.push(slug); index_.set(key(slug), model); }
    }
    for (const model of own) {
      if (matched.has(model.slug)) {
        if (model.auto_delisted) { model.status = 'active'; model.status_note = null; delete model.auto_delisted; touched.add(model.slug); }
      } else if ((model.status ?? 'active') === 'active') {
        model.status = 'legacy';
        model.status_note = `官方定价页已不再列出（${today} 自动检测），保留历史价格`;
        model.auto_delisted = today;
        touched.add(model.slug);
      }
    }
  }
  const delisted = own.filter(model => model.auto_delisted === today).map(model => model.slug);
  report.push({ provider, status: healthy ? 'verified' : 'unmatched', url, checked_at: now.toISOString(), rows: rows.length, matched: matched.size, added, delisted });
}

// 2.5 自动收录的新模型补充资料：官方定价页不含工具调用 / 视觉 / 开放权重信息，从 OpenRouter 模型目录补齐。
//     只填空字段、不覆盖已有值；OpenRouter 不可用时跳过（不影响价格）。
let enriched = 0;
const needsMeta = [...models.values()].filter(model => model.auto_added && [model.supports_tools, model.supports_vision, model.is_open_source, model.context_length].some(value => value == null));
if (needsMeta.length) {
  try {
    const catalog = (await getJson('https://openrouter.ai/api/v1/models', { timeout: 60000, retries: 2 })).data || [];
    const metaKey = text => key(text).replace(/\./g, '');
    const byName = new Map();
    for (const item of catalog) {
      if (/:/.test(item.id.split('/')[1] || '')) continue; // 跳过 :batch / :free 等变体
      for (const name of [item.id.split('/')[1], String(item.name).replace(/^[^:]+:\s*/, '')]) if (!byName.has(metaKey(name))) byName.set(metaKey(name), item);
    }
    for (const model of needsMeta) {
      const item = byName.get(metaKey(model.slug)) || byName.get(metaKey(model.name));
      if (!item) continue;
      const before = JSON.stringify([model.supports_tools, model.supports_vision, model.is_open_source, model.context_length]);
      model.supports_tools ??= (item.supported_parameters || []).includes('tools');
      model.supports_vision ??= (item.architecture?.input_modalities || []).includes('image');
      if (model.is_open_source == null && item.hugging_face_id) model.is_open_source = true; // 无 HF 仓库不能断定闭源，保持未知
      model.context_length ??= item.context_length || null;
      if (JSON.stringify([model.supports_tools, model.supports_vision, model.is_open_source, model.context_length]) !== before) {
        model.metadata_source = `https://openrouter.ai/${item.id}`;
        touched.add(model.slug);
        enriched++;
      }
    }
  } catch (error) {
    warnings.push(`OpenRouter 模型资料补充失败：${error.message}`);
  }
}

// 3. 写回
for (const slug of touched) state.models[slug] = models.get(slug);
state.sources = Object.fromEntries(report.map(item => [item.provider, item]));
writeJsonIfChanged(statePath, state);

const merged = [...models.values()];
const activeDates = merged.filter(model => (model.status ?? 'active') === 'active').map(model => model.latest?.date).filter(Boolean).sort();
const ok = report.filter(item => item.status === 'verified');
const upstreamOnly = [...new Set(prices.models.map(model => model.provider))].filter(provider => !providers.includes(provider));
data.prices = {
  ...prices,
  updated_at: activeDates.at(-1) || prices.updated_at,
  models: merged,
  official_checked_at: now.toISOString(),
  official_check_status: ok.length === providers.length ? 'verified' : 'partial',
  official_sources: [
    ...report.map(({ provider, status, url, checked_at, rows, matched, error }) => ({ provider, status, url, checked_at, rows, matched, error })),
    ...upstreamOnly.map(provider => ({ provider, status: 'upstream', note: '官网无公开价格页，沿用原站快照' })),
  ],
};
const changed = writeJsonIfChanged(target, data);

const failed = report.filter(item => item.status !== 'verified');
for (const item of report) console.log(`  ${item.provider.padEnd(9)} ${item.status}${item.status === 'failed' ? ` ${item.error}` : ` rows=${item.rows} matched=${item.matched} added=${item.added.length} delisted=${item.delisted.length}`}`);
for (const warning of warnings) console.log(`  警告 ${warning}`);
console.log(`CHINA_PRICES_${changed ? 'UPDATED' : 'UNCHANGED'} providers=${ok.length}/${providers.length} models=${merged.length} active=${activeDates.length} enriched=${enriched} updated_at=${data.prices.updated_at}`);
reportFreshness([{
  dataset: '国内模型价格（厂商官方定价页）', file: 'data/models.json#prices', source: '各厂商官方定价页', mode: 'live',
  latest: ok.length ? now.toISOString() : prices.updated_at, models: activeDates.length,
  note: [
    failed.length ? `抓取失败、沿用上次数据：${failed.map(item => item.provider).join('、')}` : null,
    upstreamOnly.length ? `${upstreamOnly.join('、')} 官网无公开价格页，沿用原站快照` : null,
  ].filter(Boolean).join('；') || null,
}]);
