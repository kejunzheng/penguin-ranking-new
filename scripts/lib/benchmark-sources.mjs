import { fetchDeepSwe, fetchFrontierCode } from './coding-benchmarks.mjs';
// 模型评测榜：除 AA / Epoch / ARC / LMArena / OSWorld 2.0 之外的 11 个官方数据源。
// 口径（筛选条件、排序方式、原始名称字段）逐一移植自上游 kejunzheng/penguin-model-capability-ranking 的导入脚本，
// 只把「读本地冻结文件」改为「每次在线拉取」。每个函数返回：
//   { date: 快照日期, dataDate: 数据源自身最新条目日期（无法得知时为 null）, rows: [{ benchmarkId, raw, rank, org, releaseDate, openWeights, source }] }
import { getBuffer, getJson, getLastModified, getText, githubFileDate } from './net.mjs';
import { excelDate, parseCsv, readXlsxRows } from './formats.mjs';

const today = () => new Date().toISOString().slice(0, 10);
const number = value => {
  if (value == null) return null;
  const match = String(value).replace(/%/g, '').replace(/\\\|/g, '|').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
};
const maxDate = values => values.map(value => String(value || '').slice(0, 10)).filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort().at(-1) || null;
const decodeHtml = text => String(text).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&nbsp;/g, ' ');
const stripTags = html => decodeHtml(String(html).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const markdownCells = line => line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(cell => cell.trim());
const cleanMarkdown = text => String(text).replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
const ranked = (rows, score) => rows.filter(row => Number.isFinite(score(row))).sort((a, b) => score(b) - score(a));
const ensure = (rows, minimum, label) => { if (rows.length < minimum) throw new Error(`${label} 只解析到 ${rows.length} 行，页面或文件结构可能已变更`); return rows; };
async function mapLimit(items, limit, task) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const index = next++; results[index] = await task(items[index]); }
  }));
  return results;
}
const row = (benchmarkId, source, raw, rank, extra = {}) => ({ benchmarkId, raw: String(raw).trim(), rank, org: null, releaseDate: null, openWeights: null, source, ...extra });

// SWE-bench Verified：官网内嵌 leaderboard JSON；按 resolved 降序、日期升序
export async function fetchSwebench() {
  const url = 'https://www.swebench.com/';
  const html = await getText(url, { timeout: 90000 });
  const json = html.match(/<script type="application\/json" id="leaderboard-data">([\s\S]*?)<\/script>/)?.[1];
  if (!json) throw new Error('未找到 leaderboard-data');
  const verified = JSON.parse(json).find(item => item.name === 'Verified')?.results || [];
  const table = ensure(verified.filter(item => (item.name || item.model_display) && Number.isFinite(Number(item.resolved)))
    .sort((a, b) => Number(b.resolved) - Number(a.resolved) || String(a.date || '').localeCompare(String(b.date || ''))), 20, 'SWE-bench Verified');
  return {
    date: today(), dataDate: maxDate(table.map(item => item.date)),
    rows: table.map((item, index) => row('swe_bench_verified', url, item.name || item.model_display, index + 1, {
      org: item.model_org || item.agent_org || null, releaseDate: item.model_release_date ? String(item.model_release_date).slice(0, 10) : null,
      openWeights: typeof item.os_model === 'boolean' ? item.os_model : null,
    })),
  };
}

// LiveBench：从前端 bundle 读取发布列表与模型元数据，取最新一期 table/categories；总分 = 各类别均分的平均
export async function fetchLivebench() {
  const home = await getText('https://livebench.ai/');
  const script = home.match(/src="\.?\/?(static\/js\/main\.[^"]+\.js)"/)?.[1];
  if (!script) throw new Error('未找到 LiveBench 前端脚本');
  const js = await getText(`https://livebench.ai/${script}`);
  const releases = [...js.matchAll(/\[("20\d\d-\d\d-\d\d"(?:,"20\d\d-\d\d-\d\d")+)\]/g)].map(match => JSON.parse(`[${match[1]}]`)).sort((a, b) => b.length - a.length)[0];
  const release = releases?.sort().at(-1);
  if (!release) throw new Error('未找到 LiveBench 发布列表');
  const tag = release.replace(/-/g, '_');
  const tableUrl = `https://livebench.ai/table_${tag}.csv`;
  // 发布列表里的日期是题库版本号；同一版本的成绩表会持续追加新模型，因此数据日期取成绩表文件的 Last-Modified。
  const [csv, categories, modified] = await Promise.all([getText(tableUrl), getJson(`https://livebench.ai/categories_${tag}.json`), getLastModified(tableUrl)]);
  const meta = new Map();
  for (const match of js.matchAll(/"([^"{}]+)":\{([^{}]*?displayName:"[^"]+"[^{}]*?)\}/g)) {
    const body = match[2], pick = key => body.match(new RegExp(`${key}:"([^"]+)"`))?.[1];
    meta.set(match[1], { name: pick('displayName'), org: pick('organization'), version: pick('version'), openWeights: body.includes('openweight:!0') });
  }
  const average = values => { const list = values.filter(Number.isFinite); return list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : null; };
  const scored = parseCsv(csv).map(item => ({ item, score: average(Object.values(categories).map(tasks => average(tasks.map(task => number(item[task]))))) }));
  const table = ensure(ranked(scored, entry => entry.score), 20, 'LiveBench');
  return {
    date: today(), dataDate: [release, modified].filter(Boolean).sort().at(-1),
    rows: table.map(({ item }, index) => {
      const info = meta.get(item.model) || {};
      return row('livebench_overall', tableUrl, info.name || item.model, index + 1, {
        org: info.org || null, releaseDate: /^\d{4}-\d{2}-\d{2}$/.test(info.version || '') ? info.version : null, openWeights: info.openWeights ?? null,
      });
    }),
  };
}

// MMLU-Pro：TIGER-Lab 官方提交数据集
export async function fetchMmluPro() {
  const url = 'https://huggingface.co/datasets/TIGER-Lab/mmlu_pro_leaderboard_submission/resolve/main/results.csv';
  const [csv, info] = await Promise.all([getText(url), getJson('https://huggingface.co/api/datasets/TIGER-Lab/mmlu_pro_leaderboard_submission').catch(() => null)]);
  const table = ensure(ranked(parseCsv(csv), item => number(item.Overall)), 50, 'MMLU-Pro');
  return { date: today(), dataDate: maxDate([info?.lastModified]), rows: table.map((item, index) => row('mmlu_pro', url, item.Models, index + 1)) };
}

// VideoMMMU：官方 README 排行表，按 Overall 排序
export async function fetchVideommmu() {
  const url = 'https://raw.githubusercontent.com/EvolvingLMMs-Lab/VideoMMMU/main/README.md';
  const lines = (await getText(url)).split('\n');
  const start = lines.findIndex(line => line.startsWith('| Model | Overall'));
  if (start < 0) throw new Error('未找到 VideoMMMU 排行表');
  const parsed = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith('|')) break;
    const cells = markdownCells(line);
    if (cells.length < 5) continue;
    parsed.push({ raw: cleanMarkdown(cells[0]), score: number(cleanMarkdown(cells[1]).split('|')[0]) });
  }
  const table = ensure(ranked(parsed, item => item.score), 5, 'VideoMMMU');
  return { date: today(), dataDate: await githubFileDate('EvolvingLMMs-Lab/VideoMMMU', 'README.md'), rows: table.map((item, index) => row('videommmu', url, item.raw, index + 1)) };
}

// LongBench v2：官网 HTML 排行表，w/ CoT 总分
export async function fetchLongbench() {
  const url = 'https://longbench2.github.io/';
  const html = await getText(url);
  const body = html.match(/<table[^>]+id="results"[^>]*>([\s\S]*?)<\/table>/)?.[1];
  if (!body) throw new Error('未找到 LongBench v2 排行表');
  const parsed = [];
  for (const rowHtml of body.match(/<tr>[\s\S]*?<\/tr>/g) || []) {
    const rawCells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(match => match[1]);
    if (rawCells.length < 17) continue;
    const cells = rawCells.map(stripTags);
    const link = rawCells[1].match(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    let raw = (link ? stripTags(link[2]) : cells[1]).replace('🧠', '').trim();
    const org = rawCells[1].match(/<p[^>]*>([\s\S]*?)<\/p>/) ? stripTags(rawCells[1].match(/<p[^>]*>([\s\S]*?)<\/p>/)[1]) : null;
    if (org && raw.endsWith(` ${org}`)) raw = raw.slice(0, -(org.length + 1)).trim();
    const score = number(cells[6]);
    if (raw && score != null) parsed.push({ raw, org, release: cells[4], score });
  }
  const table = ensure(ranked(parsed, item => item.score), 10, 'LongBench v2');
  return {
    date: today(), dataDate: maxDate(table.map(item => item.release)),
    rows: table.map((item, index) => row('longbench_v2', url, item.raw, index + 1, { org: item.org, releaseDate: /^\d{4}-\d{2}-\d{2}$/.test(item.release) ? item.release : null })),
  };
}

// BFCL v4：官方结果归档仓库，取最新日期目录的 data_overall.csv（使用表内 Rank）
export async function fetchBfcl() {
  const page = await getText('https://github.com/HuanzhiMao/BFCL-Result', { headers: { accept: 'text/html' } });
  const latest = [...new Set(page.match(/20\d\d-\d\d-\d\d/g) || [])].sort().at(-1);
  if (!latest) throw new Error('未找到 BFCL 结果目录');
  const url = `https://raw.githubusercontent.com/HuanzhiMao/BFCL-Result/main/${latest}/score/data_overall.csv`;
  const table = ensure(parseCsv(await getText(url)).filter(item => item.Model && Number.isFinite(Number(item.Rank))), 20, 'BFCL');
  // 模型名末尾的 (FC) / (Prompt) 是调用方式，拆成配置；否则 “Claude-Opus-4-5-20251101 (FC)” 无法与站内模型匹配
  const MODES = { fc: '原生函数调用（FC）', prompt: '提示词模式（Prompt）' };
  return {
    date: today(), dataDate: latest,
    rows: table.map(item => {
      const mode = String(item.Model).match(/\s*\((FC|Prompt)\)\s*$/i);
      return row('bfcl_v4', url, mode ? item.Model.slice(0, mode.index) : item.Model, Number(item.Rank), {
        org: item.Organization || null, ...(mode ? { configSuffix: MODES[mode[1].toLowerCase()] } : {}),
      });
    }),
  };
}

// Terminal-Bench 4.0：官方仓库 leaderboard/submissions/*.json（Agent 系统成绩）
export async function fetchTerminalBench() {
  const repo = 'harbor-framework/terminal-bench', directory = 'leaderboard/submissions';
  let files = [];
  try {
    const tree = await getJson(`https://api.github.com/repos/${repo}/git/trees/main?recursive=1`, { retries: 1, headers: { accept: 'application/vnd.github+json' } });
    files = (tree.tree || []).map(item => item.path).filter(path => path.startsWith(`${directory}/`) && path.endsWith('.json')).map(path => path.split('/').at(-1));
  } catch {}
  if (!files.length) {
    // GitHub API 匿名额度耗尽时，改读目录网页（不受 API 额度限制）
    const html = await getText(`https://github.com/${repo}/tree/main/${directory}`, { headers: { accept: 'text/html' } });
    files = [...new Set(html.match(/20\d\d-\d\d-\d\d-[\w.-]+?\.json/g) || [])];
  }
  if (!files.length) throw new Error('未找到 Terminal-Bench 提交文件');
  const submissions = await mapLimit(files, 6, file => getJson(`https://raw.githubusercontent.com/${repo}/main/${directory}/${file}`, { retries: 2 }).catch(() => null));
  const valid = submissions.filter(item => item?.metadata?.model_display?.label && Number.isFinite(item?.metrics?.accuracy));
  const table = ensure(valid.sort((a, b) => b.metrics.accuracy - a.metrics.accuracy), 3, 'Terminal-Bench');
  const source = `https://github.com/${repo}/tree/main/${directory}`;
  return {
    date: today(), dataDate: maxDate(table.map(item => item.metadata.date)),
    rows: table.map((item, index) => {
      const { metadata } = item;
      let name = metadata.model_display.label;
      // 提交里的模型名常省略品牌（如 “Opus 5.5”），按厂商补全以便与其他榜单的同一模型对齐
      if (/anthropic/i.test(metadata.model_org?.label || '') && !/claude/i.test(name)) name = `Claude ${name}`;
      const effort = metadata.reasoning_effort || item.source_filter?.reasoning_effort;
      return row('terminal_bench_4', source, effort ? `${name} (${effort})` : name, index + 1, {
        org: metadata.model_org?.label || null, releaseDate: metadata.release_date || null,
      });
    }),
  };
}

// GAIA：官方公开结果数据集（gaia-benchmark/results_public，2023 test）
// 优先直接下载仓库里的单个 parquet 文件（约 170 KB，一次请求、约 2 秒）；
// 失败时退回 datasets-server 逐页读取（约 39 页、约 50 秒，且容易触发 HF 429 限流）。
const GAIA_PARQUET = 'https://huggingface.co/datasets/gaia-benchmark/results_public/resolve/main/2023/test-00000-of-00001.parquet';
async function gaiaRowsFromParquet() {
  const { parquetReadObjects } = await import('hyparquet');
  const buffer = await getBuffer(GAIA_PARQUET, { timeout: 90000, retries: 3 });
  const file = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return parquetReadObjects({ file, columns: ['model', 'organisation', 'score', 'date'] });
}
async function gaiaRowsFromPages() {
  const base = 'https://datasets-server.huggingface.co/rows?dataset=gaia-benchmark/results_public&config=2023&split=test';
  const items = [];
  for (let offset = 0; offset < 5000; offset += 100) {
    // 顺序翻页：任一页失败会让整个榜单作废，因此加大重试并在页间稍作间隔，避免触发 HF 限流
    if (offset) await new Promise(resolve => setTimeout(resolve, 300));
    const page = await getJson(`${base}&offset=${offset}&length=100`, { timeout: 90000, retries: 5 });
    const rows = (page.rows || []).map(item => item.row);
    items.push(...rows);
    if (rows.length < 100) break;
  }
  return items;
}
export async function fetchGaia() {
  let items;
  try {
    items = await gaiaRowsFromParquet();
  } catch (error) {
    console.log(`  GAIA: parquet 读取失败，改用逐页读取（${error.message}）`);
    items = await gaiaRowsFromPages();
  }
  const table = ensure(ranked(items.filter(item => item.model), item => item.score), 20, 'GAIA');
  return {
    date: today(), dataDate: maxDate(table.map(item => item.date)),
    rows: table.map((item, index) => row('gaia', 'https://huggingface.co/datasets/gaia-benchmark/results_public', item.model, index + 1, { org: item.organisation || null })),
  };
}

// OSWorld-Verified：官方 xlsx；只取 100 步 / 无额外 a11y 树 / 无代码动作 / 单次 rollout 的标准口径
export async function fetchOsworld() {
  const url = 'https://os-world.github.io/static/data/osworld_verified_results.xlsx';
  const [header, ...body] = readXlsxRows(await getBuffer(url, { timeout: 90000 }));
  const items = body.filter(values => values[0]).map(values => Object.fromEntries(header.map((key, index) => [key, values[index] ?? ''])));
  const standard = items.filter(item => Number(item['Max steps']) === 100 && item['Additional a11y tree used'] === 'No'
    && item['Additional coding-based action'] === 'No' && item['Multiple rollout'] === 'No');
  const table = ensure(ranked(standard, item => number(item['Success rate'])), 5, 'OSWorld-Verified');
  return {
    date: today(), dataDate: maxDate(items.map(item => excelDate(item.Date) || item.Date)),
    rows: table.map((item, index) => row('osworld', url, item.Model, index + 1, { org: item.Institution || null })),
  };
}

export const OFFICIAL_SOURCES = [
  { name: 'SWE-bench', benchmarks: ['swe_bench_verified'], fetch: fetchSwebench },
  { name: 'LiveBench', benchmarks: ['livebench_overall'], fetch: fetchLivebench },
  { name: 'DeepSWE', benchmarks: ['deepswe'], fetch: fetchDeepSwe },
  { name: 'FrontierCode', benchmarks: ['frontiercode'], fetch: fetchFrontierCode },
  { name: 'MMLU-Pro', benchmarks: ['mmlu_pro'], fetch: fetchMmluPro },
  { name: 'VideoMMMU', benchmarks: ['videommmu'], fetch: fetchVideommmu },
  { name: 'Terminal-Bench 4.0', benchmarks: ['terminal_bench_4'], fetch: fetchTerminalBench },
  { name: 'BFCL v4', benchmarks: ['bfcl_v4'], fetch: fetchBfcl },
  { name: 'GAIA', benchmarks: ['gaia'], fetch: fetchGaia },
  { name: 'OSWorld-Verified', benchmarks: ['osworld'], fetch: fetchOsworld },
  { name: 'LongBench v2', benchmarks: ['longbench_v2'], fetch: fetchLongbench },
];
