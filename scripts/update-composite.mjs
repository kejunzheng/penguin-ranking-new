// 由 public/data/benchmarks.json 计算评测榜综合表现指数，写回同一个文件（顶层 composite + 每个出分模型的 composite）。
// 参照组与刻度（mean/sd）首次计算时冻结到 scripts/composite-anchor.json（提交到仓库），之后只读不改（见《综合指数计算规则 v4》）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataDir, readJson, repoRoot, writeJsonIfChanged } from './lib/net.mjs';
import { computeComposite } from './lib/composite.mjs';

export const anchorFile = path.join(repoRoot, 'scripts', 'composite-anchor.json');

// 把计算结果写进 data（原地）：先清掉旧的 composite 字段，再写入新的。
export function applyComposite(data, { summary, models }) {
  for (const model of data.models) delete model.composite;
  for (const model of data.models) if (models.has(model.id)) model.composite = models.get(model.id);
  data.composite = summary;
  return data;
}

export function updateComposite({ file = path.join(dataDir, 'benchmarks.json'), anchorPath = anchorFile, sensitivity = true } = {}) {
  const data = readJson(file);
  if (!data?.benchmarks?.length) throw new Error('benchmarks.json missing');
  const result = computeComposite(data, readJson(anchorPath), { sensitivity });
  // 锚点只在首次（或补写 mean/sd）时写入，之后不改。
  if (result.anchorChanged) {
    fs.writeFileSync(anchorPath, JSON.stringify(result.anchor, null, 2) + '\n');
    console.log(`composite anchor frozen: ${result.anchor.reference_model_ids.length} reference models, mean=${result.anchor.mean}, sd=${result.anchor.sd}`);
  }
  applyComposite(data, result);
  writeJsonIfChanged(file, data);
  const { summary } = result;
  console.log(`综合分：${summary.benchmarks.length} 项评测，${summary.pairs} 场对决，出分 ${summary.scored} 个，排名 ${summary.ranked} 个，参照组 ${summary.reference.size} 个`);
  return result;
}

// 计算失败时，把上一版的综合分原样放回刚重写的 benchmarks.json，避免前台突然丢掉综合分列。
export function carryOverComposite(previous, file = path.join(dataDir, 'benchmarks.json')) {
  if (!previous?.composite) return false;
  const data = readJson(file);
  if (!data) return false;
  const old = new Map(previous.models.filter(m => m.composite).map(m => [m.id, m.composite]));
  for (const model of data.models) { delete model.composite; if (old.has(model.id)) model.composite = old.get(model.id); }
  data.composite = previous.composite;
  return writeJsonIfChanged(file, data);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) updateComposite();
