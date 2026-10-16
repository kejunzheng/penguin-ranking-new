import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { computeComposite, fitComposite, prepareBenchmarks, referenceStats, resolveAnchor, DOMAINS } from '../scripts/lib/composite.mjs';
import { compareComposite, pickConfigRecord, reasoningTier, resolveBenchmarkModel, withCompositeColumn } from '../src/benchmark-data.js';

const DATE = '2026-10-01';
// 6 个领域各取一项评测
const BENCH = ['swe_bench_verified', 'humanitys_last_exam', 'gpqa_diamond', 'longbench_v2', 'mmmu_pro', 'lmarena_text_overall'];

// ranks: { modelId: { benchmarkId: rank | { rank, config }[] | rank[] } }
function makeData(ranks, benchmarks = BENCH) {
  return {
    generated_at: DATE + 'T00:00:00Z',
    benchmarks: benchmarks.map(id => ({ id, latest_date: DATE })),
    models: Object.entries(ranks).map(([id, byBench]) => ({
      id, name: id,
      records: Object.fromEntries(Object.entries(byBench).map(([b, r]) => [b, [r].flat().map(x => (typeof x === 'object' ? { date: DATE, ...x } : { date: DATE, rank: x }))])),
    })),
  };
}
// 12 个模型，强弱 m00 > m01 > …；每项评测按强弱给名次，少量相邻互换
function ladder(count = 12) {
  const ranks = {};
  for (let i = 0; i < count; i++) {
    const id = 'm' + String(i).padStart(2, '0');
    ranks[id] = {};
    BENCH.forEach((b, k) => { let r = i + 1; if (k % 2 && i % 4 === 1) r = i + 2; else if (k % 2 && i % 4 === 2) r = i; ranks[id][b] = r; });
  }
  return ranks;
}
const run = (data, anchor = null, options = {}) => computeComposite(data, anchor, { sensitivity: false, today: DATE, ...options });
const abilities = fit => Object.fromEntries(fit.results.map(r => [r.id, r.ability]));
const shuffle = (list, seed) => { const a = [...list]; let s = seed; for (let i = a.length - 1; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

test('1 合成数据还原已知强弱顺序', () => {
  const fit = fitComposite(makeData(ladder()));
  assert.ok(fit.converged);
  const order = [...fit.results].sort((a, b) => b.ability - a.ability).map(r => r.id);
  assert.deepEqual(order, Object.keys(ladder()).sort());
});

test('2 打乱模型和记录顺序，结果不变', () => {
  const data = makeData(ladder());
  const base = abilities(fitComposite(data));
  const shuffled = { ...data, benchmarks: shuffle(data.benchmarks, 7), models: shuffle(data.models, 11).map(m => ({ ...m, records: Object.fromEntries(shuffle(Object.entries(m.records), 3)) })) };
  const next = abilities(fitComposite(shuffled));
  for (const id of Object.keys(base)) assert.ok(Math.abs(base[id] - next[id]) < 0.01, id);
});

test('3 给模型加低档位的较差成绩，结果不变', () => {
  const ranks = ladder();
  for (const b of BENCH) ranks.m05[b] = [{ rank: ranks.m05[b], config: 'High' }];
  const before = abilities(fitComposite(makeData(ranks)));
  for (const b of BENCH) ranks.m05[b] = [...ranks.m05[b], { rank: 1, config: 'Low' }, { rank: 2, config: 'Non-reasoning' }];
  const after = abilities(fitComposite(makeData(ranks)));
  for (const id of Object.keys(before)) assert.ok(Math.abs(before[id] - after[id]) < 1e-9, id);
});

test('4 只上 2 项且都第一的模型，不高于各项都第二的全覆盖模型，且不进入排名', () => {
  const small = ['frontiermath', 'aa_lcr'];
  const ranks = {};
  for (let i = 0; i < 12; i++) ranks['f' + String(i).padStart(2, '0')] = Object.fromEntries([...BENCH, ...small].map(b => [b, i + 3]));
  ranks.all2 = Object.fromEntries([...BENCH, ...small].map(b => [b, 2]));
  ranks.lead = Object.fromEntries(BENCH.map(b => [b, 1]));
  ranks.niche = Object.fromEntries(small.map(b => [b, 1]));
  const { rows } = run(makeData(ranks, [...BENCH, ...small]));
  const row = id => rows.find(r => r.id === id);
  assert.ok(row('niche').score <= row('all2').score, `${row('niche').score} > ${row('all2').score}`);
  assert.equal(row('niche').rank, null);
});

test('5 门槛：1 项不出分，2–4 项出分不排名，≥5 项且 ≥3 领域进入排名', () => {
  const extra = ['deepswe', 'frontiercode', 'terminal_bench_4'];
  const ranks = ladder();
  for (const id of Object.keys(ranks)) extra.forEach(b => { ranks[id][b] = Number(id.slice(1)) + 1; });
  ranks.one = { swe_bench_verified: 13 };
  ranks.three = { swe_bench_verified: 13, gpqa_diamond: 13, mmmu_pro: 13 };
  ranks.five = { swe_bench_verified: 13, humanitys_last_exam: 13, gpqa_diamond: 13, longbench_v2: 13, mmmu_pro: 13 };
  ranks.narrow = { swe_bench_verified: 13, deepswe: 13, frontiercode: 13, terminal_bench_4: 13, gpqa_diamond: 13 }; // 5 项但只覆盖 2 个领域
  const { rows } = run(makeData(ranks, [...BENCH, ...extra]));
  const row = id => rows.find(r => r.id === id);
  assert.equal(row('one'), undefined);
  assert.ok(Number.isFinite(row('three').score)); assert.equal(row('three').rank, null);
  assert.ok(Number.isFinite(row('narrow').score)); assert.equal(row('narrow').rank, null);
  assert.ok(Number.isInteger(row('five').rank));
});

test('6 参照组首次生成后被沿用，不再改写', () => {
  const first = run(makeData(ladder()));
  assert.ok(first.anchorChanged);
  const ranked = first.rows.filter(r => r.ranked).map(r => r.id).sort();
  assert.deepEqual(first.anchor.reference_model_ids, ranked);
  const ranks = ladder(14);
  const second = run(makeData(ranks), first.anchor);
  assert.deepEqual(second.anchor.reference_model_ids, first.anchor.reference_model_ids);
  assert.equal(second.anchorChanged, false);
});

test('7 综合分列加入表格，不计入覆盖数', () => {
  const data = makeData(ladder());
  const result = run(data);
  const withScores = { ...data, composite: result.summary, models: data.models.map(m => ({ ...m, composite: result.models.get(m.id) })) };
  const out = withCompositeColumn(withScores);
  assert.equal(out.compositeColumn.date, result.summary.date);
  assert.equal(out.benchmarks.length, BENCH.length);
  const model = resolveBenchmarkModel(withScores.models[0], BENCH, DATE);
  assert.equal(model.coverage, BENCH.length);
  assert.equal(withCompositeColumn({ ...data }).compositeColumn, null);
  // 综合分排序：已排名按名次，倒序只翻转已排名，没有名次的在最后
  const a = { composite: { rank: 1 }, name: 'a' }, b = { composite: { rank: 5 }, name: 'b' }, c = { composite: { rank: null }, name: 'c' };
  assert.deepEqual([c, b, a].sort((x, y) => compareComposite(x, y, 'asc')).map(m => m.name), ['a', 'b', 'c']);
  assert.deepEqual([c, a, b].sort((x, y) => compareComposite(x, y, 'desc')).map(m => m.name), ['b', 'a', 'c']);
});

test('8 真实数据：Opus 5.5 第一，名次连续，指数为有限数，入选评测都 ≥ 10 个模型', () => {
  const data = JSON.parse(fs.readFileSync('public/data/benchmarks.json', 'utf8'));
  const result = run(data, JSON.parse(fs.readFileSync('scripts/composite-anchor.json', 'utf8')));
  const ranked = result.rows.filter(r => r.rank);
  assert.equal(ranked[0].id, 'claude-5-5-opus');
  assert.deepEqual(ranked.map(r => r.rank), ranked.map((_, i) => i + 1));
  assert.ok(result.rows.every(r => Number.isFinite(r.score)));
  assert.ok(prepareBenchmarks(data).every(b => b.entries.length >= 10));
  assert.ok(result.summary.benchmarks.length > 0);
});

test('9 推理档位识别表', () => {
  const tier = reasoningTier;
  assert.equal(tier('Non-reasoning, High'), 1);
  assert.equal(tier('Instant'), 1);
  assert.equal(tier('Max, Default Fallback'), 6);
  assert.equal(tier('adaptive/max'), 6);
  assert.equal(tier('XHigh'), 5);
  assert.equal(tier('Extra High'), 5);
  assert.equal(tier('high'), 4);
  assert.equal(tier('Medium'), 3);
  assert.equal(tier('low'), 2);
  assert.ok(Math.abs(tier('Thinking 16K') - 3.16) < 1e-9);
  assert.equal(tier('Thinking 1000K'), 5.9);
  assert.equal(tier('Reasoning'), 4);
  assert.equal(tier('原生函数调用（FC）'), null);
  assert.equal(tier('标准/未注明'), null);
});

test('10 按档位选成绩，不按名次；无法识别时优先标准/未注明，否则取居中一条', () => {
  const rec = (config, rank) => ({ config, rank });
  assert.equal(pickConfigRecord([rec('High', 4), rec('XHigh', 6), rec('Max', 9), rec('Medium', 23), rec('Low', 54)]).rank, 9);
  assert.equal(pickConfigRecord([rec('标准/未注明', 3), rec('FC', 2), rec('工具增强', 1)]).rank, 3);
  assert.equal(pickConfigRecord([rec('A', 10), rec('B', 2), rec('C', 6)]).rank, 6);
  assert.equal(pickConfigRecord([rec('A', 10), rec('B', 2), rec('C', 6), rec('D', 12)]).rank, 6); // 偶数条取中间两条里靠前的
  assert.equal(pickConfigRecord([rec('FC', 1), rec('Low', 8)]).rank, 8); // 能识别的和不能识别的并存，只在能识别的里选
  assert.equal(pickConfigRecord([rec('High', 4)]).rank, 4);
  assert.equal(pickConfigRecord([]), null);
});

test('11 默认口径使用档位规则', () => {
  const ranks = ladder();
  ranks.m03.humanitys_last_exam = [{ rank: 1, config: 'Low' }, { rank: 9, config: 'Max' }];
  const entry = prepareBenchmarks(makeData(ranks)).find(b => b.id === 'humanitys_last_exam').entries.find(e => e.id === 'm03');
  assert.equal(entry.rank, 9);
});

test('12 领域证据平衡开启时仍能正确排序', () => {
  const on = fitComposite(makeData(ladder()), { balanceDomains: true });
  const off = fitComposite(makeData(ladder()), { balanceDomains: false });
  const order = fit => [...fit.results].sort((a, b) => b.ability - a.ability).map(r => r.id).join();
  assert.equal(order(on), Object.keys(ladder()).sort().join());
  assert.equal(order(off), order(on));
});

test('13 名次范围包含主结果名次，指数范围包含主结果指数', () => {
  const result = computeComposite(makeData(ladder()), null, { sensitivity: true, today: DATE });
  assert.equal(result.summary.sensitivity_runs, BENCH.length);
  for (const row of result.rows.filter(r => r.ranked)) {
    const m = result.models.get(row.id);
    assert.ok(m.rank_range[0] <= m.rank && m.rank <= m.rank_range[1], row.id);
    assert.ok(m.score_range[0] <= m.score + 0.05 && m.score - 0.05 <= m.score_range[1], row.id);
  }
});

test('14 刻度固定：首次写入 mean/sd；加入新模型再算一次，刻度不变，锚点不被改写', () => {
  const first = run(makeData(ladder()));
  assert.ok(Number.isFinite(first.anchor.mean) && Number.isFinite(first.anchor.sd));
  const snapshot = JSON.stringify(first.anchor);
  const bigger = ladder(16);
  const second = run(makeData(bigger), first.anchor);
  assert.equal(second.anchorChanged, false);
  assert.equal(JSON.stringify(second.anchor), snapshot);
  // 旧版本锚点缺 mean/sd：按参照组算一次补上
  const { mean, sd, ...legacy } = first.anchor;
  const fit = fitComposite(makeData(ladder()));
  const upgraded = resolveAnchor(fit, legacy, DATE);
  assert.ok(upgraded.changed);
  assert.ok(Math.abs(upgraded.anchor.mean - mean) < 1e-9 && Math.abs(upgraded.anchor.sd - sd) < 1e-9);
  assert.ok(Math.abs(referenceStats(fit, legacy.reference_model_ids).sd - sd) < 1e-9);
});

test('15 checks：每个模型每项评测都有一条，胜率在 0–100 之间；最强模型实际 100、期望 > 80', () => {
  const result = run(makeData(ladder()));
  for (const m of result.models.values()) {
    assert.equal(m.checks.length, BENCH.length);
    for (const c of m.checks) assert.ok(c.actual >= 0 && c.actual <= 100 && c.expected >= 0 && c.expected <= 100 && c.games > 0);
  }
  const top = result.models.get('m00');
  assert.ok(top.checks.every(c => c.actual === 100 && c.expected > 80));
  assert.deepEqual(Object.keys(DOMAINS).length, 6);
});
