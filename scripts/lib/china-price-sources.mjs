// 国内厂商官方定价页解析。每个数据源返回 [{ id, input, output, tier, tiered, context }]，价格单位统一为「元 / 百万 tokens」。
//
// 大多数定价页是「模型 | 条件 | 输入单价 | 输出单价 | …」形式的表格，用 parsePriceTables 按表头识别列；
// DeepSeek（模型横向排列）单独解析。各数据源只取文本模型的按量（后付费、在线推理）价格：
//   - 阶梯计价取最低档（与原站口径一致），并记录档位说明；
//   - 峰谷计价取空闲时段（最低档，原站同口径），档位说明中注明；
//   - 同一模型在页面中出现多次时取第一次（如阿里云百炼默认先列华北2（北京）地域）。
import { extractTables } from './formats.mjs';
import { getJson, getText } from './net.mjs';

const SKIP_TABLE = /批量|batch|离线|预付费|资源包|量包|微调|精调|训练|保障|tpm|国际|海外|新加坡|美国|德国|节省计划|增购|算力|一体机|实例|部署|私有化/i;
const has = (text, re) => re.test(text || '');

function numbers(text) {
  return [...String(text).replace(/,/g, '').matchAll(/\d+(?:\.\d+)?/g)].map(match => Number(match[0]));
}
function priceOf(text, pick = 'first') {
  if (text == null) return null;
  const value = String(text).trim();
  if (!value || /^[-—–\/]$|不支持|暂不|^n\/?a$/i.test(value)) return null;
  const list = numbers(value.replace(/\d+\s*[kKmM]\b|[\[(（][^\])）]*[\])）]/g, ' '));
  if (!list.length) return /免费/.test(value) ? 0 : null;
  return pick === 'last' ? list.at(-1) : list[0];
}
function unitFactor(...texts) {
  for (const text of texts) {
    if (!text) continue;
    if (/千\s*tokens?|元\s*\/\s*千|每\s*千|1k\s*tokens?|\/\s*k\s*tokens?/i.test(text)) return 1000;
    if (/百万|1m\b|1m\s*tokens?|m\s*tokens|每百万|million/i.test(text)) return 1;
  }
  return null;
}
const round = value => value == null ? null : Number(value.toFixed(6));

/** 从单元格中取出模型 ID：去掉前导中文说明（如「模型调用」）与尾部的说明、条件。 */
export function modelName(text) {
  return String(text).replace(/^[^A-Za-z]+/, '').split(/\s*[>＞（(≤≥<*：:【\[]|\s+(?=[一-鿿])|[一-鿿]/)[0].replace(/\s+/g, ' ').trim();
}

/**
 * 通用价格表解析。
 * options: accept(id) 过滤模型；pick 取单元格中第一个/最后一个数字；names(cell) 自定义单元格 → 模型 ID 列表；defaultUnit 无单位时的倍数。
 */
export function parsePriceTables(tables, { accept = () => true, pick = 'first', names = cell => [modelName(cell)], defaultUnit = 1 } = {}) {
  const byId = new Map();
  for (const [tableNo, { grid, before }] of tables.entries()) {
    if (grid.length < 2 || has(before, SKIP_TABLE)) continue;
    // 表头：第一行；第二行若不含价格数字则视为表头的第二层（如「非思考模式 / 思考模式」）
    let header = grid[0].map(cell => cell || '');
    let start = 1;
    const second = grid[1] || [];
    if (grid.length > 2 && second.every((cell, index) => cell === grid[0][index] || !/\d/.test(cell))) {
      header = header.map((cell, index) => second[index] && second[index] !== cell ? `${cell} ${second[index]}` : cell);
      start = 2;
    }
    const find = (test, from = 0) => header.findIndex((cell, index) => index >= from && test(cell));
    const modelCol = find(cell => /版本名称/.test(cell)) >= 0 ? find(cell => /版本名称/.test(cell)) : find(cell => /模型|model|产品名|计费项/i.test(cell));
    if (modelCol < 0) continue;
    if (header.some(cell => SKIP_TABLE.test(cell) && !/批量推理/.test(cell))) continue;
    const isInput = cell => /输入/.test(cell) && !/(?<!未)命中|缓存存储|缓存写入|(?<![非])音频|条件|长度|token\s*数|范围|子项|模态/i.test(cell);
    const inputCandidates = header.map((cell, index) => isInput(cell) ? index : -1).filter(index => index >= 0 && index !== modelCol);
    const inputCol = inputCandidates.find(index => /未命中/.test(header[index])) ?? inputCandidates[0] ?? -1;
    const outputCol = find(cell => /输出/.test(cell) && !/长度|条件|token\s*数|范围|缓存/i.test(cell));
    const tierCols = header.map((cell, index) => /条件|长度|token\s*数|范围|阶梯|峰谷|时段/i.test(cell) && index !== inputCol && index !== outputCol ? index : -1).filter(index => index >= 0);
    const contextCol = find(cell => /上下文|context/i.test(cell));
    const unitCol = find(cell => /^单位$|计费单位/.test(cell));
    const subitemCol = find(cell => /子项/.test(cell));
    const serviceCol = find(cell => /服务内容/.test(cell));
    const valueCol = subitemCol >= 0 ? find(cell => /在线推理|后付费|按量/.test(cell)) : -1;
    const inlineCol = inputCol < 0 && outputCol < 0 ? find(cell => /价格|刊例价|单价/.test(cell)) : -1;
    if (!(inputCol >= 0 && outputCol >= 0) && valueCol < 0 && inlineCol < 0) continue;

    for (const row of grid.slice(start)) {
      const cell = row[modelCol];
      if (!cell) continue;
      const tierText = [...tierCols.map(index => row[index]), contextCol >= 0 && !/^\d+(\.\d+)?\s*[KkMm]?$/.test(row[contextCol] || '') ? row[contextCol] : '']
        .filter(value => value && !/^[-—–]$/.test(value)).join('，');
      let input = null, output = null, part = null;
      if (valueCol >= 0) { // 千帆：每个模型按「子项」分多行（输入 / 输出 / 缓存命中）
        const sub = row[subitemCol] || '';
        if (serviceCol >= 0 && row[serviceCol] && !/推理/.test(row[serviceCol])) continue;
        const factor = unitFactor(row[unitCol], header[valueCol]) ?? defaultUnit;
        const value = priceOf(row[valueCol], pick);
        if (value == null) continue;
        if (/^输入/.test(sub) && !/缓存|命中/.test(sub)) { input = value * factor; part = 'input'; }
        else if (/^输出/.test(sub)) { output = value * factor; part = 'output'; }
        else continue;
      } else if (inlineCol >= 0) { // 百川 / 混元旧页：「输入：0.5元 输出：2元」
        const text = row[inlineCol] || '';
        const factor = unitFactor(text, header[inlineCol]) ?? defaultUnit;
        const inMatch = text.match(/输入[^\d免]*?(\d+(?:\.\d+)?|免费)/), outMatch = text.match(/输出[^\d免]*?(\d+(?:\.\d+)?|免费)/);
        if (inMatch && outMatch) {
          input = (inMatch[1] === '免费' ? 0 : Number(inMatch[1])) * factor;
          output = (outMatch[1] === '免费' ? 0 : Number(outMatch[1])) * factor;
        } else if (/元\s*\/\s*(千|百万)\s*tokens?/i.test(text) && priceOf(text) != null) { // 输入输出同价（「包含输入和输出」）
          input = output = priceOf(text) * factor;
        } else continue;
      } else {
        const factor = unitFactor(header[inputCol], row[unitCol], row[inputCol]) ?? defaultUnit;
        const outFactor = unitFactor(header[outputCol], row[unitCol], row[outputCol]) ?? factor;
        input = priceOf(row[inputCol], pick); output = priceOf(row[outputCol], pick);
        if (input == null || output == null) continue;
        input *= factor; output *= outFactor;
      }
      for (const id of names(cell).filter(Boolean)) {
        if (!accept(id)) continue;
        const key = id.toLowerCase();
        const entry = byId.get(key) || { id, rows: [], table: tableNo };
        if (entry.table !== tableNo) continue; // 只取第一次出现该模型的表
        if (part) { // 合并子项行
          const tiers = entry.subtiers ??= { input: [], output: [] };
          tiers[part].push({ value: part === 'input' ? input : output, tier: row[subitemCol].replace(/^(输入|输出)/, '').replace(/^[（(]|[）)]$/g, '') });
          entry.partial = true;
        } else entry.rows.push({ input, output, tier: tierText, context: contextCol >= 0 ? row[contextCol] : null });
        byId.set(key, entry);
      }
    }
  }
  const results = [];
  for (const entry of byId.values()) {
    let rows = entry.rows;
    if (entry.subtiers) {
      const { input, output } = entry.subtiers;
      if (!input.length || !output.length) continue;
      rows = input.map((item, index) => ({ input: item.value, output: (output[index] || output[0]).value, tier: item.tier }));
    }
    if (!rows.length) continue;
    // 峰谷计价取空闲时段（最低档，与原站「录入夜间价」及前台「展示最低计费档」口径一致）
    const offPeak = rows.filter(row => /空闲|闲时|夜间/.test(row.tier));
    const chosen = (offPeak.length ? offPeak : rows)[0];
    const distinct = new Set(rows.map(row => `${row.input}/${row.output}`)).size > 1;
    const base = offPeak.length ? chosen.tier.replace(/空闲时段|闲时\S*/, '').replace(/^[，\s]+|[，\s]+$/g, '') : chosen.tier;
    const tier = distinct ? [base, offPeak.length ? '空闲时段价（高峰时段更高）' : null].filter(Boolean).join('，') || null : null;
    results.push({ id: entry.id, input: round(chosen.input), output: round(chosen.output), tiered: distinct, tier, context: parseContext(chosen.context) });
  }
  return results;
}
function parseContext(text) {
  const match = String(text || '').replace(/\s/g, '').match(/^(\d+(?:\.\d+)?)([KkMm])$/);
  return match ? Math.round(Number(match[1]) * (match[2].toLowerCase() === 'm' ? 1048576 : 1024)) : null;
}

const fetchText = url => getText(url, { timeout: 45000, retries: 3, headers: { accept: 'text/html,text/markdown,*/*' } });
const tablesFrom = async urls => (await Promise.all(urls.map(fetchText))).flatMap(text => extractTables(text));

// DeepSeek：模型横向排列（列 = 模型，行 = 计费项）
async function deepseek() {
  const url = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing';
  const [{ grid }] = extractTables(await fetchText(url));
  const head = grid.find(row => row[0] === '模型');
  const versions = grid.find(row => row[0] === '模型版本') || [];
  const columns = head.map((cell, index) => cell !== '模型' && index > 0 ? index : -1).filter(index => index >= 0);
  // 分时段计价取空闲时段（最低档）
  const offPeak = cells => /空闲/.test(cells.join(' '));
  const row = (re, idle) => grid.find(cells => re.test(cells.join(' ')) && (!idle || offPeak(cells)));
  const input = row(/输入.*未命中/, true) || row(/输入.*未命中/), output = row(/输出/, true) || row(/输出/);
  const peak = offPeak(input || []);
  return { url, rows: columns.map(index => ({
    id: head[index].replace(/\s*\(\d+\)\s*$/, ''), display: versions[index] || null,
    input: priceOf(input[index]), output: priceOf(output[index]),
    tiered: peak, tier: peak ? '空闲时段价（高峰时段为 2 倍）' : null, context: null,
  })).filter(item => item.input != null && item.output != null) };
}

export const TEXT_ONLY = id => !/embed|rerank|tts|asr|image|video|speech|realtime|cogview|cogvideo|wanx|wan2|captioner|ocr|world|panorama|3d|voice|music|vidu|t2a|s2s|livetranslate|seedream|seedance|seededit/i.test(id);

export const CHINA_PRICE_SOURCES = {
  deepseek: { fetch: deepseek },
  zhipu: {
    url: 'https://docs.bigmodel.cn/cn/guide/start/pricing',
    accept: id => /^(glm|codegeex|charglm|emohaa|autoglm)/i.test(id),
  },
  qwen: {
    url: 'https://help.aliyun.com/zh/model-studio/model-pricing.md',
    // 只取千问系列（第三方模型章节之前）
    cut: text => text.slice(0, Math.max(0, text.indexOf('## 文本生成-第三方模型')) || undefined),
    accept: id => /^(qwen|qwq|qvq)/i.test(id),
  },
  moonshot: { url: 'https://platform.moonshot.cn/docs/pricing/chat.md', accept: id => /^(kimi|moonshot)/i.test(id) },
  minimax: { url: 'https://platform.minimaxi.com/docs/guides/pricing-paygo', accept: id => /^minimax/i.test(id), pick: 'last' }, // 「原价 折后价」取折后价
  ernie: {
    url: 'https://cloud.baidu.com/doc/qianfan/s/wmh4sv6ya',
    accept: id => /^ernie/i.test(id),
    names: cell => cell.replace(/[（(][^）)]*[）)]/g, ' ').split(/\s+/).filter(token => /^ERNIE-[\w.\-]+$/i.test(token)),
  },
  hunyuan: {
    urls: ['https://cloud.tencent.com/document/product/1823/130055', 'https://cloud.tencent.com/document/product/1729/97731'], // TokenHub 优先，原混元计费页兜底
    accept: id => /^(hy|hunyuan|tencent hy)/i.test(id),
  },
  doubao: {
    fetch: async () => {
      const url = 'https://www.volcengine.com/docs/82379/1544106';
      const json = await getJson('https://www.volcengine.com/api/doc/getDocDetail?LibraryID=82379&DocumentID=1544106&type=online', { timeout: 45000 });
      const rows = parsePriceTables(extractTables(json?.Result?.MDContent || ''), { accept: id => /^doubao/i.test(id) });
      return { url, rows, updatedAt: json?.Result?.UpdatedTime || null };
    },
  },
  baichuan: { url: 'https://platform.baichuan-ai.com/prices', accept: id => /^baichuan/i.test(id) },
  step: { url: 'https://platform.stepfun.com/docs/zh/pricing/details', accept: id => /^step/i.test(id) },
};

export async function fetchChinaPrices(provider) {
  const source = CHINA_PRICE_SOURCES[provider];
  if (source.fetch) return source.fetch();
  const urls = source.urls || [source.url];
  const texts = await Promise.all(urls.map(fetchText));
  const tables = texts.flatMap(text => extractTables(source.cut ? source.cut(text) : text));
  const rows = parsePriceTables(tables, { accept: source.accept, pick: source.pick, names: source.names });
  return { url: urls[0], rows };
}
