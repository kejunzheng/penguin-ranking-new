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
