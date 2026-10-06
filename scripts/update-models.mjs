// 模型调用榜（OpenRouter 周调用量趋势）+ 国内模型价格 → public/data/models.json
// 数据源与原站一致：腾讯 CDN 上的 frontend-data.json，结构与本站 models.json 完全相同，校验后原样写入（不缩进）。
import path from 'node:path';
import { dataDir, getJson, getJsonViaCurl, readJson, reportFreshness, writeJsonIfChanged } from './lib/net.mjs';

const SOURCE = 'https://mat1.gtimg.com/qqcdn/openrouterllm/model-trends/data/frontend-data.json';
const target = path.join(dataDir, 'models.json');

// 该 CDN 不同节点返回的版本不一致（实测同一时刻可拿到 09-25 / 10-03 / 10-06 三个版本），
// 因此带随机参数多取几次，选 trends.updated_at 最新的一份。
const attempts = await Promise.allSettled([
  ...Array.from({ length: 4 }, (_, index) => getJson(`${SOURCE}?t=${Date.now()}-${index}`, { retries: 2 })),
  ...Array.from({ length: 2 }, (_, index) => getJsonViaCurl(`${SOURCE}?t=${Date.now()}-c${index}`)),
]);
const candidates = attempts.filter(item => item.status === 'fulfilled' && item.value?.trends?.updated_at).map(item => item.value);
if (!candidates.length) throw new Error(attempts.find(item => item.status === 'rejected')?.reason?.message || 'models 数据源无有效返回');
const raw = candidates.sort((a, b) => String(b.trends.updated_at).localeCompare(String(a.trends.updated_at)))[0];
const trends = raw?.trends, prices = raw?.prices;
const problems = [];
if (!Date.parse(raw?.generated_at)) problems.push('generated_at 无效');
if (!Array.isArray(trends?.weeks) || trends.weeks.length < 26) problems.push('trends.weeks 少于 26 周');
if (!Array.isArray(trends?.models) || !trends.models.length || !Array.isArray(trends?.points) || !trends.points.length) problems.push('trends.models/points 为空');
if (!Array.isArray(prices?.models) || prices.models.length < 50) problems.push('prices.models 少于 50 个');
if (!(prices?.usd_to_cny > 0)) problems.push('usd_to_cny 无效');
if (problems.length) throw new Error(`models 数据校验失败：${problems.join('；')}`);

const previous = readJson(target);
if (previous?.trends?.updated_at && trends.updated_at < previous.trends.updated_at) {
  throw new Error(`上游调用量数据（${trends.updated_at}）比本地（${previous.trends.updated_at}）旧，保留本地数据`);
}
const changed = writeJsonIfChanged(target, raw);
const priceDate = prices.models.map(model => model.latest?.date).filter(Boolean).sort().at(-1) || prices.updated_at;
console.log(`MODELS_${changed ? 'UPDATED' : 'UNCHANGED'} usage_updated_at=${trends.updated_at} china_price_date=${priceDate} weeks=${trends.weeks.length} price_models=${prices.models.length}`);
reportFreshness([
  { dataset: '模型调用榜（OpenRouter 调用量）', file: 'data/models.json#trends', source: SOURCE, mode: 'live', latest: trends.updated_at },
  { dataset: '国内模型价格', file: 'data/models.json#prices', source: SOURCE, mode: 'live', latest: priceDate,
    note: '数据源本身的国内价格停留在该日期，上游未更新时本站也无法更新' },
]);
