// OpenRouter 全量模型价格 → public/data/openrouter-prices.json
// 1. 抓取 OpenRouter Models API 全量目录（只保留文本输出、有价格的模型；排除 ~别名与 :batch 变体；:free 免费版单独成行，名称带“· Free”，免费筛选可见）。
// 2. 中国厂商模型额外挂上「中国官网价」：来自 models.json 中国官网价格表（与“中国官网价格”榜同一份数据）。
//    匹配顺序：手工映射表 → 同厂商 slug / 名称自动匹配；官方已弃用（retired）的价格不挂。
// 人民币 / 美元互换统一使用 models.json 中的汇率。
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataDir, getJson, readJson, reportFreshness, stateFile, writeJsonIfChanged } from './lib/net.mjs';

export const SOURCE = 'https://openrouter.ai/api/v1/models';

// OpenRouter 厂商前缀 → 中国官网价格表里的 provider。不在表里的厂商视为非中国厂商。
export const CHINA_PROVIDERS = {
  deepseek: 'deepseek', 'z-ai': 'zhipu', qwen: 'qwen', moonshotai: 'moonshot', minimax: 'minimax',
  tencent: 'hunyuan', 'bytedance-seed': 'doubao', bytedance: 'doubao', stepfun: 'step', baidu: 'ernie',
  baichuan: 'baichuan', xiaomi: null, inclusionai: null, meituan: null,
};
const PROVIDER_NAMES = {
  deepseek: 'DeepSeek', 'z-ai': 'Z.ai（智谱）', qwen: 'Qwen（通义千问）', moonshotai: 'Moonshot AI（Kimi）', minimax: 'MiniMax',
  tencent: 'Tencent（混元）', 'bytedance-seed': 'ByteDance Seed（豆包）', bytedance: 'ByteDance', stepfun: 'StepFun（阶跃星辰）',
  baidu: 'Baidu（文心）', xiaomi: 'Xiaomi（MiMo）', inclusionai: 'inclusionAI（百灵）', meituan: 'Meituan（LongCat）',
  'x-ai': 'xAI', mistralai: 'Mistral AI', 'meta-llama': 'Meta', openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google',
};

// 手工映射：OpenRouter slug（去掉变体后缀）→ 中国官网 slug；null 表示确认官网没有对应的在售价格，禁止自动匹配。
export const MANUAL = {
  'deepseek/deepseek-v4.1-flash': 'deepseek-flash',
  'moonshotai/kimi-k2-0905': 'kimi-k2-0905-preview', // 官网已弃用
  'moonshotai/kimi-k2': 'kimi-k2-0711-preview', // 官网已弃用
  'deepseek/deepseek-chat': null, // OpenRouter 的 DeepSeek V3；官网 deepseek-chat 已改为 V4-Flash 别名并弃用
  'deepseek/deepseek-v4-pro-0813': null,
  'deepseek/deepseek-v4-flash-0731': null,
  'qwen/qwen3.8-max-0902': 'qwen3.8-max',
  'qwen/qwen3.5-plus-20260420': 'qwen3.5-plus',
  'qwen/qwen3.5-plus-02-15': 'qwen3.5-plus',
  'qwen/qwen3.5-flash-02-23': 'qwen3.5-flash',
  'qwen/qwen3-coder': 'qwen3-coder-480b-a35b-instruct',
  'qwen/qwen3-235b-a22b-2507': 'qwen3-235b-a22b-instruct-2507',
  'qwen/qwen-2.5-coder-32b-instruct': 'qwen2.5-coder-32b-instruct',
  'qwen/qwen-2.5-7b-instruct': 'qwen2.5-7b-instruct',
  'qwen/qwen-2.5-72b-instruct': 'qwen2.5-72b-instruct',
  'tencent/hy3': 'hy-3',
  'tencent/hunyuan-a13b-instruct': 'hunyuan-a13b',
  'bytedance-seed/seed-2-1-turbo': 'doubao-seed-2.1-turbo',
  'bytedance-seed/seed-2.0-code': 'doubao-seed-2.0-code',
  'bytedance-seed/seed-2.0-lite': 'doubao-seed-2.0-lite',
  'bytedance-seed/seed-2.0-mini': 'doubao-seed-2.0-mini',
  'bytedance-seed/seed-1.6': 'doubao-seed-1.6',
  'bytedance-seed/seed-1.6-flash': 'doubao-seed-1.6-flash',
};

// 中国官网价格表（models.json）尚未覆盖的厂商：手工核对官网人民币价（每百万 Tokens，未命中缓存的输入价）。
const MIMO_URL = 'https://mimo.mi.com/static/docs/price/pay-as-you-go.md';
const LONGCAT_URL = 'https://longcat.chat/platform/docs/zh/pricing/longcat-2.0';
export const EXTRA_OFFICIAL = {
  'xiaomi/mimo-v2.6-pro': { slug: 'mimo-v2.6-pro', name: 'MiMo-V2.6-Pro', input_cny: 3, output_cny: 6, source_url: MIMO_URL },
  'xiaomi/mimo-v2.5-pro': { slug: 'mimo-v2.5-pro', name: 'MiMo-V2.5-Pro', input_cny: 3, output_cny: 6, source_url: MIMO_URL, status: 'legacy', note: '官方公告 2026-10-21 下线' },
  'xiaomi/mimo-v2.6-flash': { slug: 'mimo-v2.6-flash', name: 'MiMo-V2.6-Flash', input_cny: 1, output_cny: 2, source_url: MIMO_URL },
  'xiaomi/mimo-v2.5': { slug: 'mimo-v2.5', name: 'MiMo-V2.5', input_cny: 1, output_cny: 2, source_url: MIMO_URL, status: 'legacy', note: '官方公告 2026-10-21 下线' },
  'xiaomi/mimo-v2.6-pro-ultraspeed': { slug: 'mimo-v2.6-pro-ultraspeed', name: 'MiMo-V2.6-Pro-UltraSpeed', input_cny: 30, output_cny: 60, source_url: MIMO_URL },
  'meituan/longcat-2.0': { slug: 'longcat-2.0', name: 'LongCat-2.0', input_cny: 2, output_cny: 8, source_url: LONGCAT_URL, note: '官网标注为限时折扣价' },
};
export const EXTRA_CHECKED_AT = '2026-10-15';
// 没有中国官网价时给出原因，前台直接展示。
const NO_PRICE = {
  stopped: '官网已停售',
  unlisted: '官网价格页未单列',
  unpublished: '官网暂未公布人民币价',
};
const UNPUBLISHED_PROVIDERS = new Set(['inclusionai']);

const norm = s => String(s).toLowerCase().replace(/^[^:]+:\s*/, '').replace(/\(.*?\)/g, '').replace(/[^a-z0-9.]/g, '');
const perMillion = value => { const n = Number(value); return Number.isFinite(n) ? Number((n * 1e6).toFixed(6)) : null; };

const RETIRED_FAMILIES = [/^deepseek\/deepseek-(chat|r1|v3)/];

export function matchChina(slug, name, chinaModels) {
  const provider = slug.split('/')[0];
  if (!(provider in CHINA_PROVIDERS)) return { china: false };
  if (EXTRA_OFFICIAL[slug]) {
    const x = EXTRA_OFFICIAL[slug];
    return { china: true, match: { ...x, status: x.status || 'active', status_note: x.note || null, latest: { input_cny: x.input_cny, output_cny: x.output_cny, date: EXTRA_CHECKED_AT }, price_source_url: x.source_url } };
  }
  const pool = chinaModels.filter(m => m.provider === CHINA_PROVIDERS[provider]);
  const usable = m => m && (m.status ?? 'active') !== 'retired' ? m : null;
  const base = slug.split('/')[1], key = norm(name), slugKey = norm(base);
  let found;
  if (slug in MANUAL) found = MANUAL[slug] && chinaModels.find(m => m.slug === MANUAL[slug]);
  else found = pool.find(m => m.slug === base) || pool.find(m => norm(m.name) === key || norm(m.slug) === slugKey);
  if (usable(found)) return { china: true, match: found };
  const reason = found || RETIRED_FAMILIES.some(r => r.test(slug)) || slug === 'deepseek/deepseek-chat' ? NO_PRICE.stopped
    : UNPUBLISHED_PROVIDERS.has(provider) ? NO_PRICE.unpublished : NO_PRICE.unlisted;
  return { china: true, match: null, reason };
}

export function buildOpenRouterPrices(payload, chinaPrices, previous = { models: [] }, archive = { models: [] }, now = new Date()) {
  const rate = chinaPrices?.usd_to_cny;
  if (!(rate > 0)) throw new Error('缺少美元兑人民币汇率（models.json prices.usd_to_cny）');
  const date = now.toISOString().slice(0, 10);
  const old = new Map([...(archive.models || []).map(m => [m.slug, { history: [[m.latest.date, m.latest.input_usd, m.latest.output_usd]] }]), ...(previous.models || []).map(m => [m.slug, m])]);
  const chinaModels = chinaPrices.models || [];
  const models = [], seen = new Set();
  for (const item of payload.data) {
    const input = perMillion(item.pricing?.prompt), output = perMillion(item.pricing?.completion);
    const inputs = item.architecture?.input_modalities || [], outputs = item.architecture?.output_modalities || [];
    if (item.id.startsWith('~') || /:batch$/.test(item.id)) continue; // 别名会和正式模型重复；batch 不是标准按量价
    const freeVariant = /:free$/.test(item.id); // OpenRouter 免费版：输入输出均为 0，作为独立条目保留
    if (input == null || output == null || input < 0 || output < 0 || !outputs.includes('text') || seen.has(item.id)) continue;
    if (item.id.startsWith('openrouter/') || (!freeVariant && input === 0 && output === 0)) continue; // 路由器与不按 Token 计费（输入输出均为 0）的非免费版条目
    seen.add(item.id);
    const provider = item.id.split('/')[0];
    const [prefix, ...rest] = String(item.name).split(': ');
    const fullName = (rest.length ? rest.join(': ') : item.name).replace(/\s+/g, ' ').trim();
    const name = freeVariant ? fullName.replace(/\s*\(free\)$/i, '') + ' · Free' : fullName; // 与调用榜的免费版写法一致
    const { china, match, reason } = matchChina(item.id.replace(/:free$/, ''), item.name, chinaModels); // 免费版按原模型匹配中国官网价
    const history = [...(old.get(item.id)?.history || []).filter(r => r[0] !== date), [date, input, output]].slice(-90);
    models.push({
      slug: item.id, name, provider,
      provider_name: PROVIDER_NAMES[provider] || (rest.length ? prefix : provider),
      category: inputs.some(x => x !== 'text') || outputs.some(x => x !== 'text') ? 'multimodal' : 'general',
      context_length: item.context_length ?? null, is_open_source: null,
      supports_tools: (item.supported_parameters || []).includes('tools'), supports_vision: inputs.includes('image'),
      release_date: item.created ? new Date(item.created * 1000).toISOString().slice(0, 10) : null,
      status: 'active',
      has_price_tiers: Array.isArray(item.pricing?.overrides) && item.pricing.overrides.length > 0,
      latest: { date, input_usd: input, output_usd: output, input_cny: input * rate, output_cny: output * rate },
      history, history_currency: 'USD', billing_currency: 'USD', price_scope: 'openrouter',
      source: 'openrouter', source_url: `https://openrouter.ai/${item.id}`,
      is_free_variant: freeVariant,
      is_china: china,
      china_official: match ? {
        slug: match.slug, name: match.name, status: match.status ?? 'active', note: match.status_note || null,
        input_cny: match.latest.input_cny, output_cny: match.latest.output_cny,
        input_usd: match.latest.input_cny / rate, output_usd: match.latest.output_cny / rate,
        tier_label: match.price_tier_label || null, has_price_tiers: Boolean(match.has_price_tiers),
        date: match.latest.date, source_url: match.price_source_url || null,
      } : null,
      china_official_reason: china && !match ? reason : null,
    });
  }
  if (models.length < 100) throw new Error(`OpenRouter 有效模型过少（${models.length}）`);
  const chinaRows = models.filter(m => m.is_china);
  return {
    updated_at: now.toISOString(), source_url: SOURCE, usd_to_cny: rate,
    china_official_updated_at: chinaPrices.updated_at || null,
    exchange_rate_note: 'OpenRouter 以美元计费，人民币为参考汇率换算；中国官网价以人民币计费，美元为参考汇率换算。',
    coverage: {
      models: models.length, free_models: models.filter(m => m.is_free_variant).length, china_models: chinaRows.length, china_matched: chinaRows.filter(m => m.china_official).length,
      china_unmatched: chinaRows.filter(m => !m.china_official).map(m => m.slug),
    },
    models,
  };
}

export async function updateOpenRouterPrices() {
  const target = path.join(dataDir, 'openrouter-prices.json');
  const chinaPrices = readJson(path.join(dataDir, 'models.json'))?.prices;
  const payload = await getJson(SOURCE);
  if (!Array.isArray(payload?.data) || payload.data.length < 100) throw new Error('OpenRouter 返回的模型过少');
  const output = buildOpenRouterPrices(payload, chinaPrices, readJson(target, { models: [] }), readJson(stateFile('global-channel-archive.json'), { models: [] }));
  writeJsonIfChanged(target, output);
  const c = output.coverage;
  console.log(`OPENROUTER_PRICES_UPDATED models=${c.models} china=${c.china_models} china_official=${c.china_matched}`);
  reportFreshness([{ dataset: 'OpenRouter 模型价格', file: 'data/openrouter-prices.json', source: SOURCE, mode: 'live', latest: output.updated_at }]);
  return output;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await updateOpenRouterPrices();
