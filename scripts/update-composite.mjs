// 由 public/data/benchmarks.json 计算 AI 趋势榜综合分，写入 public/data/composite.json。
// 参照组首次运行时冻结到 .data-state/composite-anchor.json，之后只读不改（见《综合分实施说明 v2》）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataDir, readJson, stateFile, writeJsonIfChanged } from './lib/net.mjs';
import { DOMAINS, fitComposite, makeAnchor, scoreComposite } from './lib/composite.mjs';

const round = (value, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;

export function buildComposite(data, anchor) {
  const fit = fitComposite(data);
  if (!fit.converged) throw new Error('composite fit did not converge');
  const { reference, rows } = scoreComposite(fit, anchor);
  const scale = 15 / reference.sd;
  return {
    method: 'composite-v2',
    benchmark_date: data.generated_at || null,
    benchmarks: fit.benchmarks,
    reference_size: reference.size,
    domains: Object.keys(DOMAINS),
    rows: rows.map(row => ({
      id: row.id,
      score: round(row.score),
      low: round(row.low),
      high: round(row.high),
      rank: row.rank,
      benchmarks: row.benchmarkCount,
      domains: Object.fromEntries(row.domains.map(d => [d, round(50 + (row.domainAbility[d] - reference.mean) * scale)])),
    })),
  };
}

export function updateComposite() {
  const data = readJson(path.join(dataDir, 'benchmarks.json'));
  if (!data?.benchmarks?.length) throw new Error('benchmarks.json missing');
  const anchorFile = stateFile('composite-anchor.json');
  let anchor = readJson(anchorFile);
  if (!anchor?.reference_model_ids?.length) {
    anchor = { ...makeAnchor(fitComposite(data)), created_at: new Date().toISOString().slice(0, 10) };
    fs.writeFileSync(anchorFile, JSON.stringify(anchor, null, 2) + '\n');
    console.log(`composite anchor frozen: ${anchor.reference_model_ids.length} reference models`);
  }
  const output = buildComposite(data, anchor);
  writeJsonIfChanged(path.join(dataDir, 'composite.json'), output);
  console.log(`composite: ${output.rows.length} scored, ${output.rows.filter(r => r.rank).length} ranked`);
  return output;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) updateComposite();
