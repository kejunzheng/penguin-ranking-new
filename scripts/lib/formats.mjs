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
  const [header, ...body] = rows.filter(item => item.some(value => value !== ''));
  return body.map(values => Object.fromEntries(header.map((key, index) => [key, values[index] ?? ''])));
}
