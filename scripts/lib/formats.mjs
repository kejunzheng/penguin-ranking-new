// 无依赖的 ZIP 读取与 CSV 解析（Epoch AI 的 benchmark_data.zip 使用）。
import zlib from 'node:zlib';

/** 读取 ZIP 中的指定文件（基于中央目录，支持 store / deflate）。返回 Map<name, Buffer>。 */
export function readZip(buffer, wanted) {
  const want = new Set(wanted);
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('不是有效的 ZIP 文件');
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let index = 0; index < count; index++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('ZIP 中央目录损坏');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28), extraLength = buffer.readUInt16LE(offset + 30), commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    const base = name.split('/').at(-1);
    if (want.has(name) || want.has(base)) {
      const start = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
      const data = buffer.subarray(start, start + compressedSize);
      files.set(base, method === 8 ? zlib.inflateRawSync(data) : method === 0 ? Buffer.from(data) : (() => { throw new Error(`不支持的压缩方式 ${method}`); })());
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

/** RFC 4180 CSV → 对象数组（首行为表头）。 */
export function parseCsv(text) {
  const [header, ...body] = parseCsvRows(text);
  return (body || []).map(values => Object.fromEntries((header || []).map((key, index) => [key, values[index] ?? ''])));
}
/** RFC 4180 CSV → 二维数组（支持引号内换行），过滤全空行。 */
export function parseCsvRows(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter(item => item.some(value => value !== ''));
}

/** 读取 xlsx 第一个工作表 → 二维数组（共享字符串、行内字符串、数字；不处理公式与样式）。 */
export function readXlsxRows(buffer) {
  const files = readZip(buffer, ['xl/sharedStrings.xml', 'xl/worksheets/sheet1.xml']);
  const decode = text => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))).replace(/&amp;/g, '&');
  const shared = [...(files.get('sharedStrings.xml')?.toString() || '').matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map(match => decode([...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(item => item[1]).join('')));
  const sheet = files.get('sheet1.xml')?.toString() || '';
  const column = ref => [...ref.replace(/\d+/g, '')].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
  return [...sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map(row => {
    const values = [];
    for (const cell of row[1].matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const type = cell[2].match(/t="(\w+)"/)?.[1], body = cell[3] || '';
      const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      values[column(cell[1])] = type === 's' ? shared[Number(raw)] ?? '' : type === 'inlineStr' ? decode(body.replace(/<[^>]+>/g, '')) : raw != null ? decode(raw) : '';
    }
    return Array.from(values, value => value ?? '');
  });
}
/** Excel 日期序列号 → YYYY-MM-DD */
export const excelDate = serial => Number.isFinite(Number(serial)) && Number(serial) > 20000 ? new Date(Date.UTC(1899, 11, 30) + Number(serial) * 864e5).toISOString().slice(0, 10) : null;

// ---- 表格解析（厂商定价页）：HTML / MDX 中的 <table> 与 Markdown 管道表格，展开 rowspan/colspan 为二维文本网格 ----
const decode = text => text.replace(/&nbsp;|&#160;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
export const cellText = html => decode(String(html).replace(/<br\s*\/?>/gi, ' ').replace(/<\/?[A-Za-z!][^>]*>/g, ' ')).replace(/\\([<>\-_*|[\]()])/g, '$1').replace(/\s+/g, ' ').trim();

function expandSpans(rows) {
  const grid = [], pending = []; // pending[col] = { text, left }
  for (const cells of rows) {
    const row = [];
    let col = 0;
    const fillPending = () => { while (pending[col]?.left > 0) { row[col] = pending[col].text; pending[col].left--; col++; } };
    for (const cell of cells) {
      fillPending();
      for (let span = 0; span < cell.colspan; span++, col++) {
        row[col] = cell.text;
        if (cell.rowspan > 1) pending[col] = { text: cell.text, left: cell.rowspan - 1 };
      }
    }
    fillPending();
    while (pending.length > row.length && pending.slice(row.length).some(item => item?.left > 0)) { col = row.length; if (pending[col]?.left > 0) { row[col] = pending[col].text; pending[col].left--; } else row[col] = ''; }
    grid.push(Array.from(row, value => value ?? ''));
  }
  return grid;
}

/** 返回 [{ grid, before }]：grid 为展开后的二维文本，before 为表格前最近的标题文字（用于区分章节）。 */
export function extractTables(source) {
  const text = String(source).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/\\</g, '&lt;');
  const tables = [];
  const headingAt = index => {
    const head = text.slice(Math.max(0, index - 20000), index);
    const matches = [...head.matchAll(/^#{1,4} +(.+)$|<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gim)];
    const last = matches.at(-1);
    return last ? cellText(last[1] || last[2]) : '';
  };
  for (const match of text.matchAll(/<table[\s\S]*?<\/table>/gi)) {
    const rows = (match[0].match(/<tr[\s\S]*?<\/tr>/gi) || []).map(tr => (tr.match(/<t[hd][\s>][\s\S]*?<\/t[hd]>/gi) || []).map(cell => ({
      text: cellText(cell),
      rowspan: Number(cell.match(/^<t[hd][^>]*rowspan=["{]?(\d+)/i)?.[1] || 1),
      colspan: Number(cell.match(/^<t[hd][^>]*colspan=["{]?(\d+)/i)?.[1] || 1),
    })));
    if (rows.length) tables.push({ grid: expandSpans(rows), before: headingAt(match.index), index: match.index });
  }
  // Markdown 管道表格：空的首列单元格视为与上一行合并（火山方舟文档的写法）
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*\|/.test(lines[i]) || !/^\s*\|?\s*:?-{3,}/.test(lines[i + 1] || '')) continue;
    const split = line => line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(cellText);
    const grid = [split(lines[i])];
    let j = i + 2;
    for (; j < lines.length && /^\s*\|/.test(lines[j]); j++) {
      const row = split(lines[j]);
      const previous = grid.at(-1);
      if (grid.length > 1 && row[0] === '') row[0] = previous[0];
      grid.push(row);
    }
    const index = lines.slice(0, i).join('\n').length;
    tables.push({ grid, before: headingAt(index), index });
    i = j;
  }
  // MDX <DocTable columns={[{ title: ".." }]} rows={[[..], ..]} />（Kimi 文档）
  for (const match of text.matchAll(/<DocTable[\s\S]*?columns=\{\[([\s\S]*?)\]\}[\s\S]*?rows=\{\[([\s\S]*?)\]\}\s*\/>/g)) {
    const header = [...match[1].matchAll(/title:\s*"([^"]*)"/g)].map(item => item[1]);
    const rows = [...match[2].matchAll(/\[([^\[\]]*)\]/g)].map(item => [...item[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(cell => cellText(cell[1])));
    tables.push({ grid: [header, ...rows], before: headingAt(match.index), index: match.index });
  }
  return tables.sort((a, b) => a.index - b.index);
}
