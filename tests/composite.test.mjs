import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fitComposite, scoreComposite } from '../scripts/lib/composite.mjs';

const DATE = '2026-10-01';
// 6 个领域各取一项评测
const BENCH = ['swe_bench_verified', 'humanitys_last_exam', 'gpqa_diamond', 'longbench_v2', 'mmmu_pro', 'lmarena_text_overall'];

// ranks: { modelId: { benchmarkId: rank | rank[] } }
function makeData(ranks, benchmarks = BENCH) {
  return {
    benchmarks: benchmarks.map(id => ({ id, latest_date: DATE })),
    models: Object.entries(ranks).map(([id, byBench]) => ({
      id,
      records: Object.fromEntries(Object.entries(byBench).map(([b, r]) => [b, [r].flat().map(rank => ({ date: DATE, rank }))])),
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
const abilities = fit => Object.fromEntries(fit.results.map(r => [r.id, r.ability]));
const shuffle = (list, seed) => { const a = [...list]; let s = seed; for (let i = a.length - 1; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

test('合成数据还原已知强弱顺序', () => {
  const fit = fitComposite(makeData(ladder()));
  assert.ok(fit.converged);
  const order = [...fit.results].sort((a, b) => b.ability - a.ability).map(r => r.id);
  assert.deepEqual(order, Object.keys(ladder()).sort());
});

test('打乱模型和评测顺序，结果不变', () => {
  const data = makeData(ladder());
  const base = abilities(fitComposite(data));
  const shuffled = { benchmarks: shuffle(data.benchmarks, 7), models: shuffle(data.models, 11).map(m => ({ ...m, records: Object.fromEntries(shuffle(Object.entries(m.records), 3)) })) };
  const next = abilities(fitComposite(shuffled));
  for (const id of Object.keys(base)) assert.ok(Math.abs(base[id] - next[id]) < 0.01, id);
});

test('同一模型多个配置只算一次', () => {
  const ranks = ladder();
  const before = scoreComposite(fitComposite(makeData(ranks))).rows.map(r => [r.id, r.rank]);
  ranks.m05 = Object.fromEntries(Object.entries(ranks.m05).map(([b, r]) => [b, [r, 20, 21, 22]]));
  const after = scoreComposite(fitComposite(makeData(ranks))).rows.map(r => [r.id, r.rank]);
  assert.deepEqual(after, before);
});

test('只上 2 项小评测且都第一，不高于上全部评测且各项第二', () => {
  const small = ['frontiermath', 'aa_lcr'];
  const ranks = {};
  for (let i = 0; i < 12; i++) ranks['f' + String(i).padStart(2, '0')] = Object.fromEntries([...BENCH, ...small].map(b => [b, i + 3]));
  ranks.all2 = Object.fromEntries([...BENCH, ...small].map(b => [b, 2]));
  ranks.lead = Object.fromEntries(BENCH.map(b => [b, 1]));
  ranks.niche = Object.fromEntries(small.map(b => [b, 1]));
  const rows = scoreComposite(fitComposite(makeData(ranks, [...BENCH, ...small]))).rows;
  const score = id => rows.find(r => r.id === id).score;
  assert.ok(score('niche') <= score('all2'), `${score('niche')} > ${score('all2')}`);
});

test('门槛：1 项无分，2–4 项有分不排名，≥5 项且 ≥3 领域进入排名', () => {
  const ranks = ladder();
  ranks.one = { swe_bench_verified: 13 };
  ranks.three = { swe_bench_verified: 13, gpqa_diamond: 13, mmmu_pro: 13 };
  ranks.five = { swe_bench_verified: 13, humanitys_last_exam: 13, gpqa_diamond: 13, longbench_v2: 13, mmmu_pro: 13 };
  // 5 项但只覆盖 2 个领域
  const twoDomain = ['swe_bench_verified', 'deepswe', 'frontiercode', 'terminal_bench_4', 'gpqa_diamond'];
  for (const id of Object.keys(ranks)) for (const b of twoDomain.slice(1, 4)) if (!ranks[id][b] && id.startsWith('m')) ranks[id][b] = Number(id.slice(1)) + 1;
  ranks.narrow = Object.fromEntries(twoDomain.map(b => [b, 13]));
  const rows = scoreComposite(fitComposite(makeData(ranks, [...BENCH, ...twoDomain.slice(1, 4)]))).rows;
  const row = id => rows.find(r => r.id === id);
  assert.equal(row('one'), undefined);
  assert.ok(Number.isFinite(row('three').score)); assert.equal(row('three').rank, null);
  assert.ok(Number.isFinite(row('narrow').score)); assert.equal(row('narrow').rank, null);
  assert.ok(Number.isInteger(row('five').rank));
});

test('真实数据冒烟：前 4 名与验收基准一致，显示分均为有限数', () => {
  const data = JSON.parse(fs.readFileSync('public/data/benchmarks.json', 'utf8'));
  const { rows } = scoreComposite(fitComposite(data));
  assert.deepEqual(rows.filter(r => r.rank).slice(0, 4).map(r => r.id), ['claude-5-5-opus', 'claude-fable-5-1', 'gpt-6-astra', 'gpt-6-1-sol']);
  assert.ok(rows.every(r => [r.score, r.low, r.high].every(Number.isFinite)));
});
