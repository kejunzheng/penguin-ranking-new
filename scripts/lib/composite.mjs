// AI 趋势榜综合分：只用名次，Bradley–Terry 批量 MAP 拟合（见《综合分实施说明 v2》）。
// 模型能力 = 整体水平 g + 领域偏差 δ_d；6 个领域等权合成；牛顿法求解，Hessian 求标准误。

export const MIN_MODELS_PER_BENCHMARK = 10;
export const EXCLUDED_BENCHMARKS = ['aa_intelligence_index', 'livebench_overall'];
export const K_FACTOR = 8;
export const PRIOR_SD_GLOBAL = 1.5;
export const PRIOR_SD_DOMAIN = 0.5;
export const MIN_BENCHMARKS_FOR_SCORE = 2;
export const MIN_BENCHMARKS_FOR_RANK = 5;
export const MIN_DOMAINS_FOR_RANK = 3;
export const Z90 = 1.6448536269514722;

export const DOMAINS = {
  coding_agent: ['swe_bench_verified', 'deepswe', 'frontiercode', 'terminal_bench_4', 'bfcl_v4', 'gaia', 'agents_last_exam', 'osworld', 'osworld_2'],
  reasoning: ['humanitys_last_exam', 'frontiermath', 'arc_agi_2'],
  knowledge: ['mmlu_pro', 'gpqa_diamond', 'simpleqa_verified'],
  long_context: ['longbench_v2', 'aa_lcr', 'graphwalks'],
  multimodal: ['mmmu_pro', 'chartography', 'videommmu'],
  human_preference: ['lmarena_text_overall'],
};
export const DOMAIN_WEIGHTS = {
  coding_agent: 1 / 6, reasoning: 1 / 6, knowledge: 1 / 6, long_context: 1 / 6, multimodal: 1 / 6, human_preference: 1 / 6,
};
export const DOMAIN_LABELS = {
  coding_agent: { zh: '编程与 Agent', en: 'Coding & agents' },
  reasoning: { zh: '推理', en: 'Reasoning' },
  knowledge: { zh: '知识', en: 'Knowledge' },
  long_context: { zh: '长上下文', en: 'Long context' },
  multimodal: { zh: '多模态', en: 'Multimodal' },
  human_preference: { zh: '真人偏好', en: 'Human preference' },
};

const domainOf = Object.fromEntries(Object.entries(DOMAINS).flatMap(([d, ids]) => ids.map(id => [id, d])));
const sigmoid = x => (x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x)));

// 每项评测只取 latest_date 一期；每个模型只取 rank 最小的一条配置。
export function prepareBenchmarks(data, options = {}) {
  const minModels = options.minModels ?? MIN_MODELS_PER_BENCHMARK;
  const excluded = new Set(options.excluded ?? EXCLUDED_BENCHMARKS);
  const used = [];
  for (const benchmark of data.benchmarks) {
    const domain = domainOf[benchmark.id];
    if (!domain || excluded.has(benchmark.id)) continue;
    const entries = [];
    for (const model of data.models) {
      let best = Infinity;
      for (const record of model.records?.[benchmark.id] || []) {
        if (record.date === benchmark.latest_date && Number.isFinite(record.rank) && record.rank < best) best = record.rank;
      }
      if (best < Infinity) entries.push({ id: model.id, rank: best });
    }
    if (entries.length >= minModels) used.push({ id: benchmark.id, domain, date: benchmark.latest_date, entries });
  }
  return used;
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

export function fitComposite(data, options = {}) {
  const benchmarks = prepareBenchmarks(data, options);
  const weights = options.domainWeights ?? DOMAIN_WEIGHTS;
  const K = options.k ?? K_FACTOR;
  const varG = (options.priorSdGlobal ?? PRIOR_SD_GLOBAL) ** 2;
  const varD = (options.priorSdDomain ?? PRIOR_SD_DOMAIN) ** 2;

  // 参数下标：每个出现过的模型一个 g，每个 (模型, 已测领域) 一个 δ。按 id 排序，保证与输入顺序无关。
  const modelIds = [...new Set(benchmarks.flatMap(b => b.entries.map(e => e.id)))].sort();
  const index = new Map();
  let n = 0;
  for (const id of modelIds) index.set(id, n++);
  const deltaIndex = new Map();
  const tested = new Map(modelIds.map(id => [id, { benchmarks: [], domains: new Set() }]));
  for (const b of benchmarks) for (const e of b.entries) { const t = tested.get(e.id); t.benchmarks.push(b.id); t.domains.add(b.domain); }
  for (const id of modelIds) for (const d of [...tested.get(id).domains].sort()) deltaIndex.set(id + '\u0000' + d, n++);

  // 对决：同一评测内名次高者胜，并列不计；每场权重 K/(n−1)。
  const pairs = [];
  for (const b of benchmarks) {
    const w = K / (b.entries.length - 1);
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
    if (maxStep < 1e-10) { converged = true; iterations++; break; }
  }
  // 收敛点处的 Hessian 用于标准误。
  buildSystem();
  if (!cholesky(H, n)) throw new Error('Hessian is not positive definite');

  const results = modelIds.map(id => {
    const info = tested.get(id);
    const u = new Float64Array(n);
    const gi = index.get(id);
    u[gi] = 1;
    let ability = theta[gi];
    const domainAbility = {};
    for (const [d, w] of Object.entries(weights)) {
      const di = deltaIndex.get(id + '\u0000' + d);
      const delta = di === undefined ? 0 : theta[di];
      domainAbility[d] = theta[gi] + delta;
      if (di !== undefined) { u[di] += w; ability += w * delta; }
    }
    const se = Math.sqrt(choleskySolve(H, n, u).reduce((s, v, i) => s + v * u[i], 0));
    const benchmarkCount = info.benchmarks.length, domainCount = info.domains.size;
    return {
      id, ability, se, global: theta[gi], domainAbility,
      benchmarkCount, domainCount, benchmarks: info.benchmarks.sort(), domains: [...info.domains].sort(),
      scored: benchmarkCount >= MIN_BENCHMARKS_FOR_SCORE,
      ranked: benchmarkCount >= MIN_BENCHMARKS_FOR_RANK && domainCount >= MIN_DOMAINS_FOR_RANK,
    };
  });
  return { benchmarks: benchmarks.map(b => ({ id: b.id, domain: b.domain, date: b.date, models: b.entries.length })), pairCount, parameters: n, iterations, converged, results };
}

// 显示分 = 50 + 15 × z，z 以参照组（首次进入排名的模型，冻结）的均值与标准差标准化。
export function makeAnchor(fit) {
  return { created_from: 'composite-v2', reference_model_ids: fit.results.filter(r => r.ranked).map(r => r.id).sort() };
}
export function scoreComposite(fit, anchor = makeAnchor(fit)) {
  const ref = new Set(anchor.reference_model_ids);
  const refAbilities = fit.results.filter(r => ref.has(r.id)).map(r => r.ability);
  const mean = refAbilities.reduce((s, v) => s + v, 0) / refAbilities.length;
  const sd = Math.sqrt(refAbilities.reduce((s, v) => s + (v - mean) ** 2, 0) / refAbilities.length);
  const scale = 15 / sd;
  const rows = fit.results.filter(r => r.scored).map(r => {
    const score = 50 + (r.ability - mean) * scale, half = Z90 * r.se * scale;
    return { ...r, score, low: score - half, high: score + half };
  }).sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  let rank = 0;
  for (const row of rows) row.rank = row.ranked ? ++rank : null;
  return { reference: { size: refAbilities.length, mean, sd }, rows };
}
