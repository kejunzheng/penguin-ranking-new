// 评测榜「综合表现指数」：只用名次，Bradley–Terry 批量 MAP 拟合（见《综合指数计算规则 v4》）。
// 模型能力 = 整体水平 g + 领域偏差 δ_d；6 个领域等权、证据平衡；刻度固定（参照组 mean/sd 冻结在锚点文件里）。
import { pickConfigRecord } from '../../src/benchmark-data.js';

export const COMPOSITE_VERSION = '2026.10-bt-v3';
export const MIN_MODELS_PER_BENCHMARK = 10;
export const EXCLUDED_BENCHMARKS = ['aa_intelligence_index', 'livebench_overall'];
export const K_FACTOR = 8;
export const PRIOR_SD_GLOBAL = 1.5;
export const PRIOR_SD_DOMAIN = 0.5;
export const MIN_BENCHMARKS_FOR_SCORE = 2;
export const MIN_BENCHMARKS_FOR_RANK = 5;
export const MIN_DOMAINS_FOR_RANK = 3;

export const DOMAINS = {
  '编程与Agent': ['swe_bench_verified', 'deepswe', 'frontiercode', 'code_arena_webdev', 'terminal_bench_4', 'aa_scicode', 'bfcl_v4', 'gaia', 'agents_last_exam', 'osworld', 'osworld_2'],
  '推理': ['humanitys_last_exam', 'frontiermath', 'arc_agi_2'],
  '知识': ['mmlu_pro', 'gpqa_diamond', 'simpleqa_verified'],
  '长上下文': ['longbench_v2', 'aa_lcr', 'graphwalks'],
  '多模态': ['mmmu_pro', 'chartography', 'videommmu'],
  '真人偏好': ['lmarena_text_overall'],
};
export const DOMAIN_WEIGHTS = Object.fromEntries(Object.keys(DOMAINS).map(d => [d, 1 / 6]));

const domainOf = Object.fromEntries(Object.entries(DOMAINS).flatMap(([d, ids]) => ids.map(id => [id, d])));
const sigmoid = x => (x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x)));

// 第 2、3 节：每项评测只用最新一期，每个模型按配置规则选一条成绩；参评模型不足门槛的评测不参与。
export function prepareBenchmarks(data, options = {}) {
  const minModels = options.minModels ?? MIN_MODELS_PER_BENCHMARK;
  const excluded = new Set([...(options.excluded ?? EXCLUDED_BENCHMARKS), ...(options.dropBenchmarks ?? [])]);
  const used = [];
  for (const benchmark of data.benchmarks) {
    const domain = domainOf[benchmark.id];
    if (!domain || excluded.has(benchmark.id)) continue;
    const entries = [];
    for (const model of data.models) {
      const record = pickConfigRecord((model.records?.[benchmark.id] || []).filter(r => r.date === benchmark.latest_date));
      if (record) entries.push({ id: model.id, rank: record.rank });
    }
    if (entries.length >= minModels) used.push({ id: benchmark.id, domain, date: benchmark.latest_date, entries });
  }
  return used;
}

// 只有至少 2 项入选评测的模型出分、参与拟合；评测内的参评人数 n 按参与拟合的模型计。
function buildProblem(benchmarks) {
  const counts = new Map();
  for (const b of benchmarks) for (const e of b.entries) counts.set(e.id, (counts.get(e.id) || 0) + 1);
  const scoredIds = new Set([...counts].filter(([, c]) => c >= MIN_BENCHMARKS_FOR_SCORE).map(([id]) => id));
  const list = benchmarks.map(b => ({ ...b, entries: b.entries.filter(e => scoredIds.has(e.id)) })).filter(b => b.entries.length >= 2);
  const perDomain = {};
  for (const b of list) perDomain[b.domain] = (perDomain[b.domain] || 0) + 1;
  return { list, perDomain };
}

// Cholesky 分解（原地，下三角），返回 false 表示非正定。
function cholesky(a, n) {
  for (let j = 0; j < n; j++) {
    const rj = j * n;
    let sum = a[rj + j];
    for (let k = 0; k < j; k++) sum -= a[rj + k] * a[rj + k];
    if (!(sum > 0)) return false;
    const diag = Math.sqrt(sum);
    a[rj + j] = diag;
    for (let i = j + 1; i < n; i++) {
      const ri = i * n;
      let s = a[ri + j];
      for (let k = 0; k < j; k++) s -= a[ri + k] * a[rj + k];
      a[ri + j] = s / diag;
    }
  }
  return true;
}
function choleskySolve(l, n, b) {
  const y = Float64Array.from(b);
  for (let i = 0; i < n; i++) { const ri = i * n; let s = y[i]; for (let k = 0; k < i; k++) s -= l[ri + k] * y[k]; y[i] = s / l[ri + i]; }
  for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= l[k * n + i] * y[k]; y[i] = s / l[i * n + i]; }
  return y;
}

// 批量 MAP 求解（牛顿法，结果与对决顺序无关）。init 为上一次拟合的参数，用于热启动。
export function fitComposite(data, options = {}) {
  const benchmarks = options.prepared ?? prepareBenchmarks(data, options);
  const { list, perDomain } = buildProblem(benchmarks);
  const weights = options.domainWeights ?? DOMAIN_WEIGHTS;
  const K = options.k ?? K_FACTOR;
  const balance = options.balanceDomains ?? true;
  const varG = (options.priorSdGlobal ?? PRIOR_SD_GLOBAL) ** 2;
  const varD = (options.priorSdDomain ?? PRIOR_SD_DOMAIN) ** 2;

  const modelIds = [...new Set(list.flatMap(b => b.entries.map(e => e.id)))].sort();
  const index = new Map();
  let n = 0;
  for (const id of modelIds) index.set(id, n++);
  const tested = new Map(modelIds.map(id => [id, { benchmarks: [], domains: new Set() }]));
  for (const b of list) for (const e of b.entries) { const t = tested.get(e.id); t.benchmarks.push(b.id); t.domains.add(b.domain); }
  const deltaIndex = new Map();
  for (const id of modelIds) for (const d of [...tested.get(id).domains].sort()) deltaIndex.set(id + '\u0000' + d, n++);

  // 每场权重 = K ÷ (n−1) ÷ m_d
  const pairs = [];
  for (const b of list) {
    const w = K / (b.entries.length - 1) / (balance ? perDomain[b.domain] : 1);
    const sorted = [...b.entries].sort((x, y) => x.rank - y.rank || (x.id < y.id ? -1 : 1));
    const players = sorted.map(e => [index.get(e.id), deltaIndex.get(e.id + '\u0000' + b.domain), e.rank]);
    for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) {
      if (players[i][2] === players[j][2]) continue;
      pairs.push(players[i][0], players[i][1], players[j][0], players[j][1], w);
    }
  }
  const pairCount = pairs.length / 5;
  const isDelta = new Uint8Array(n);
  for (const v of deltaIndex.values()) isDelta[v] = 1;

  const theta = new Float64Array(n);
  if (options.init) {
    for (const [id, i] of index) theta[i] = options.init.get('g|' + id) ?? 0;
    for (const [key, i] of deltaIndex) theta[i] = options.init.get('d|' + key) ?? 0;
  }
  const H = new Float64Array(n * n);
  const grad = new Float64Array(n);
  let iterations = 0, converged = false;
  const buildSystem = () => {
    H.fill(0); grad.fill(0);
    for (let p = 0; p < n; p++) { const v = isDelta[p] ? varD : varG; H[p * n + p] = 1 / v; grad[p] = theta[p] / v; }
    for (let k = 0; k < pairCount; k++) {
      const o = k * 5, wg = pairs[o], wd = pairs[o + 1], lg = pairs[o + 2], ld = pairs[o + 3], w = pairs[o + 4];
      const x = theta[wg] + theta[wd] - theta[lg] - theta[ld];
      const p = sigmoid(x), g = -w * (1 - p), h = w * p * (1 - p);
      grad[wg] += g; grad[wd] += g; grad[lg] -= g; grad[ld] -= g;
      const idx = [wg, wd, lg, ld], sgn = [1, 1, -1, -1];
      for (let a = 0; a < 4; a++) for (let c = 0; c < 4; c++) H[idx[a] * n + idx[c]] += sgn[a] * sgn[c] * h;
    }
  };
  for (; iterations < 100; iterations++) {
    buildSystem();
    if (!cholesky(H, n)) throw new Error('Hessian is not positive definite');
    const step = choleskySolve(H, n, grad);
    let maxStep = 0;
    for (let p = 0; p < n; p++) { theta[p] -= step[p]; maxStep = Math.max(maxStep, Math.abs(step[p])); }
    if (maxStep < 1e-9) { converged = true; iterations++; break; }
  }

  const params = new Map();
  for (const [id, i] of index) params.set('g|' + id, theta[i]);
  for (const [key, i] of deltaIndex) params.set('d|' + key, theta[i]);
  const abilityOf = {};
  const results = modelIds.map(id => {
    const info = tested.get(id), gi = index.get(id);
    let ability = theta[gi];
    const domainAbility = {}, deltas = {};
    for (const [d, w] of Object.entries(weights)) {
      const di = deltaIndex.get(id + '\u0000' + d);
      const delta = di === undefined ? 0 : theta[di];
      deltas[d] = delta;
      domainAbility[d] = theta[gi] + delta;
      ability += w * delta;
    }
    abilityOf[id] = { global: theta[gi], domain: domainAbility };
    const benchmarkCount = info.benchmarks.length, domainCount = info.domains.size;
    return {
      id, ability, global: theta[gi], deltas, domainAbility,
      benchmarkCount, domainCount, benchmarks: info.benchmarks.sort(), domains: [...info.domains].sort(),
      scored: benchmarkCount >= MIN_BENCHMARKS_FOR_SCORE,
      ranked: benchmarkCount >= MIN_BENCHMARKS_FOR_RANK && domainCount >= MIN_DOMAINS_FOR_RANK,
    };
  });
  return {
    benchmarks: list.map(b => ({ id: b.id, domain: b.domain, date: b.date, models: b.entries.length })),
    prepared: benchmarks, problem: list, pairCount, parameters: n, iterations, converged, results, params, abilityOf,
  };
}

// 刻度：指数 = 50 + 15 × z，z = (综合能力 − mean) ÷ sd。mean/sd 来自锚点文件（首次计算时由参照组算出并冻结）。
export function referenceStats(fit, referenceIds) {
  const ref = new Set(referenceIds);
  const abilities = fit.results.filter(r => ref.has(r.id)).map(r => r.ability);
  const mean = abilities.reduce((s, v) => s + v, 0) / abilities.length;
  const sd = Math.sqrt(abilities.reduce((s, v) => s + (v - mean) ** 2, 0) / abilities.length);
  return { size: abilities.length, mean, sd };
}
// 首次：参照组 = 首次进入排名的模型；缺 mean/sd 时算一次补上；之后只读不改。返回 { anchor, changed }。
export function resolveAnchor(fit, anchor, today = new Date().toISOString().slice(0, 10)) {
  let next = anchor ? { ...anchor } : null, changed = false;
  if (!next?.reference_model_ids?.length) {
    next = { version: COMPOSITE_VERSION, created_at: today, reference_model_ids: fit.results.filter(r => r.ranked).map(r => r.id).sort() };
    changed = true;
  }
  if (!Number.isFinite(next.mean) || !Number.isFinite(next.sd)) {
    const { mean, sd } = referenceStats(fit, next.reference_model_ids);
    next = { ...next, mean, sd, frozen_at: today };
    changed = true;
  }
  return { anchor: next, changed };
}

const round = (v, digits = 1) => Math.round(v * 10 ** digits) / 10 ** digits;

function scoreRows(fit, anchor) {
  const scale = 15 / anchor.sd;
  const rows = fit.results.filter(r => r.scored).map(r => ({
    ...r,
    score: 50 + (r.ability - anchor.mean) * scale,
    domainScore: Object.fromEntries(Object.entries(r.domainAbility).map(([d, a]) => [d, 50 + (a - anchor.mean) * scale])),
  })).sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  let rank = 0;
  for (const row of rows) row.rank = row.ranked ? ++rank : null;
  return rows;
}

// 第 11.1 节：每个出分模型、每项参与的评测，统计实际胜率和按拟合结果算出的期望胜率。
function buildChecks(fit) {
  const checks = new Map();
  for (const b of fit.problem) {
    for (const a of b.entries) {
      const A = fit.abilityOf[a.id].domain[b.domain];
      let games = 0, wins = 0, expected = 0;
      for (const o of b.entries) {
        if (o.id === a.id || o.rank === a.rank) continue;
        games++;
        if (a.rank < o.rank) wins++;
        expected += sigmoid(A - fit.abilityOf[o.id].domain[b.domain]);
      }
      if (!games) continue;
      if (!checks.has(a.id)) checks.set(a.id, []);
      checks.get(a.id).push({ id: b.id, games, actual: round(wins / games * 100), expected: round(expected / games * 100) });
    }
  }
  return checks;
}

// 完整流程：主拟合 + 每项评测各去掉一次的名次范围（敏感性检查，第 10 节）。
export function computeComposite(data, anchorInput, options = {}) {
  const log = options.log ?? (() => {});
  const fit = fitComposite(data, options);
  if (!fit.converged) throw new Error('composite fit did not converge');
  const { anchor, changed } = resolveAnchor(fit, anchorInput, options.today);
  const rows = scoreRows(fit, anchor);

  const range = new Map(rows.filter(r => r.ranked).map(r => [r.id, { ranks: [r.rank], scores: [r.score] }]));
  const runs = options.sensitivity === false ? [] : fit.problem.map(b => b.id);
  runs.forEach((id, i) => {
    log(`sensitivity ${i + 1}/${runs.length}: without ${id}`);
    const prepared = fit.prepared.filter(b => b.id !== id);
    const sub = fitComposite(data, { ...options, prepared, init: fit.params });
    if (!sub.converged) throw new Error(`sensitivity fit without ${id} did not converge`);
    for (const row of scoreRows(sub, anchor)) {
      if (!row.ranked || !range.has(row.id)) continue;
      range.get(row.id).ranks.push(row.rank);
      range.get(row.id).scores.push(row.score);
    }
  });

  const date = (data.generated_at || '').slice(0, 10) || null;
  const checks = buildChecks(fit);
  const models = new Map(rows.map(row => {
    const r = range.get(row.id);
    const missing = Object.keys(DOMAINS).filter(d => !row.domains.includes(d));
    return [row.id, {
      date,
      score: round(row.score),
      rank: row.rank,
      rank_range: r ? [Math.min(...r.ranks), Math.max(...r.ranks)] : null,
      score_range: r ? [round(Math.min(...r.scores)), round(Math.max(...r.scores))] : null,
      benchmarks: row.benchmarkCount,
      domains: row.domainCount,
      missing_domains: missing,
      domain_scores: Object.fromEntries(Object.entries(row.domainScore).map(([d, v]) => [d, round(v)])),
      checks: (checks.get(row.id) || []).sort((x, y) => (x.id < y.id ? -1 : 1)),
    }];
  }));
  const summary = {
    version: COMPOSITE_VERSION,
    date,
    params: {
      MIN_MODELS_PER_BENCHMARK: options.minModels ?? MIN_MODELS_PER_BENCHMARK,
      EXCLUDED_BENCHMARKS: options.excluded ?? EXCLUDED_BENCHMARKS,
      K: options.k ?? K_FACTOR, sigmaG: options.priorSdGlobal ?? PRIOR_SD_GLOBAL, sigmaD: options.priorSdDomain ?? PRIOR_SD_DOMAIN,
      pick: 'tier', balanceDomains: options.balanceDomains ?? true, DOMAIN_WEIGHTS: options.domainWeights ?? DOMAIN_WEIGHTS,
      MIN_BENCHMARKS_FOR_SCORE, MIN_BENCHMARKS_FOR_RANK, MIN_DOMAINS_FOR_RANK,
    },
    benchmarks: fit.benchmarks,
    pairs: fit.pairCount,
    scored: rows.length,
    ranked: rows.filter(r => r.ranked).length,
    sensitivity_runs: runs.length,
    reference: {
      size: anchor.reference_model_ids.length, created_at: anchor.created_at ?? null, frozen_at: anchor.frozen_at ?? null,
      mean: round(anchor.mean, 4), sd: round(anchor.sd, 4), fixed: true,
    },
  };
  return { summary, models, rows, anchor, anchorChanged: changed, fit };
}
