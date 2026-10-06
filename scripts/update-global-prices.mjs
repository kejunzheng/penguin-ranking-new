// 全球模型价格（OpenRouter Models API）→ public/data/global-prices.json
// 输出结构与现有前台保持一致；人民币价格 = 美元价格 × models.json 中的汇率（与原快照口径相同）。
import path from 'node:path';
import { dataDir, getJson, readJson, reportFreshness, writeJsonIfChanged } from './lib/net.mjs';

const SOURCE = 'https://openrouter.ai/api/v1/models';
const target = path.join(dataDir, 'global-prices.json');
const previous = readJson(target, { models: [] });
const usdToCny = readJson(path.join(dataDir, 'models.json'))?.prices?.usd_to_cny || previous.usd_to_cny;
if (!(usdToCny > 0)) throw new Error('缺少美元兑人民币汇率（models.json prices.usd_to_cny）');

// 优先沿用旧快照里的厂商显示名，保证同一厂商名称稳定。
const providerNames = new Map(previous.models.map(model => [model.provider, model.provider_name]));
const fallbackNames = { 'x-ai': 'xAI', moonshotai: 'Moonshot AI', mistralai: 'Mistral AI', qwen: 'Qwen' };
const perMillion = value => {
  const number = Number(value);
  return Number.isFinite(number) ? Number((number * 1e6).toFixed(6)) : null;
};

const payload = await getJson(SOURCE);
if (!Array.isArray(payload?.data) || payload.data.length < 100) throw new Error('OpenRouter 返回的模型过少');
const date = new Date().toISOString().slice(0, 10);
const seen = new Set();
const models = [];
for (const item of payload.data) {
  const input = perMillion(item.pricing?.prompt), output = perMillion(item.pricing?.completion);
  const inputs = item.architecture?.input_modalities || [], outputs = item.architecture?.output_modalities || [];
  // 过滤路由器（价格为 -1）、缺价格、非文本输出与重复 slug。
  if (input == null || output == null || input < 0 || output < 0 || !outputs.includes('text') || seen.has(item.id)) continue;
  seen.add(item.id);
  const provider = item.id.replace(/^~/, '').split('/')[0];
  const [prefix, ...rest] = String(item.name).split(': ');
  models.push({
    slug: item.id,
    name: rest.length ? rest.join(': ') : item.name,
    provider,
    provider_name: providerNames.get(provider) || fallbackNames[provider] || (rest.length ? prefix : provider),
    category: inputs.some(x => x !== 'text') || outputs.some(x => x !== 'text') ? 'multimodal' : 'general',
    context_length: item.context_length ?? null,
    is_open_source: null,
    supports_tools: (item.supported_parameters || []).includes('tools'),
    supports_vision: inputs.includes('image'),
    release_date: null,
    status: 'active',
    has_price_tiers: Array.isArray(item.pricing?.overrides) && item.pricing.overrides.length > 0,
    latest: { date, input_usd: input, output_usd: output, input_cny: input * usdToCny, output_cny: output * usdToCny },
    history: [],
    source: 'openrouter',
    source_url: `https://openrouter.ai/${item.id.replace(/^~/, '')}`,
  });
}
if (models.length < 100) throw new Error(`OpenRouter 有效模型过少（${models.length}）`);

const output = {
  updated_at: new Date().toISOString(),
  source_url: SOURCE,
  usd_to_cny: usdToCny,
  exchange_rate_note: previous.exchange_rate_note || 'CNY estimate uses the original China dataset exchange rate; OpenRouter bills in USD.',
  models,
};
writeJsonIfChanged(target, output);
console.log(`GLOBAL_PRICES_UPDATED models=${models.length} date=${date}`);
reportFreshness([{ dataset: '全球模型价格（OpenRouter）', file: 'data/global-prices.json', source: SOURCE, mode: 'live', latest: output.updated_at }]);
