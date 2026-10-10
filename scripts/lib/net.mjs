// 抓取脚本共用的网络与状态工具：超时、重试、状态目录（.data-state/，不入库，需持久保存）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const dataDir = path.join(repoRoot, 'public', 'data');
export const stateDir = process.env.PENGUIN_STATE_DIR || path.join(repoRoot, '.data-state');
const UA = 'Mozilla/5.0 (compatible; PenguinIndex/1.0; +https://yonge6.github.io/penguin-index/)';

export async function fetchWithRetry(url, { retries = 3, timeout = 60000, headers = {}, as = 'json' } = {}) {
  let lastError;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { 'user-agent': UA, ...headers } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (as === 'json') return await response.json();
      if (as === 'buffer') return Buffer.from(await response.arrayBuffer());
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < retries - 1) await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
    }
  }
  throw new Error(`${url} 抓取失败：${lastError?.message}`);
}
export const getJson = (url, options) => fetchWithRetry(url, { ...options, as: 'json' });
export const getText = (url, options) => fetchWithRetry(url, { ...options, as: 'text' });
export const getBuffer = (url, options) => fetchWithRetry(url, { ...options, as: 'buffer' });

export function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
export function writeJsonIfChanged(file, value) {
  const next = JSON.stringify(value);
  let previous = null;
  try { previous = fs.readFileSync(file, 'utf8'); } catch {}
  if (previous === next) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, next);
  return true;
}
export function stateFile(name) {
  fs.mkdirSync(stateDir, { recursive: true });
  return path.join(stateDir, name);
}
// 每个抓取脚本最后输出一行 FRESHNESS JSON，daily-cdn.mjs 汇总进 manifest 与新鲜度报告。
export function reportFreshness(items) {
  console.log('FRESHNESS ' + JSON.stringify(items));
}
export const today = () => new Date().toISOString().slice(0, 10);

// 用系统 curl 取 JSON：curl 会遵循 HTTPS_PROXY 等代理环境变量，而 Node 内置 fetch 不会，
// 两条链路可能落到不同的 CDN 节点，用于交叉获取更新的版本。curl 不可用时返回 null。
export async function getJsonViaCurl(url, { timeout = 60 } = {}) {
  const { execFile } = await import('node:child_process');
  return new Promise(resolve => {
    execFile('curl', ['-sfL', '--max-time', String(timeout), url], { maxBuffer: 256 * 1024 * 1024 }, (error, stdout) => {
      if (error) return resolve(null);
      try { resolve(JSON.parse(stdout)); } catch { resolve(null); }
    });
  });
}

// GitHub token：环境变量 GITHUB_TOKEN，或仓库根目录的 .env.github（GITHUB_TOKEN=...，已被 .gitignore 的 .env* 忽略，
// 且 Vite 只在 mode=github 时才会读取该文件，不会进入前端构建）。只需公开仓库只读权限；没有时返回 null。
export function githubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
  try {
    const line = fs.readFileSync(path.join(repoRoot, '.env.github'), 'utf8').split('\n').find(item => item.startsWith('GITHUB_TOKEN='));
    return line ? line.slice('GITHUB_TOKEN='.length).trim() || null : null;
  } catch { return null; }
}

// 数据文件在 GitHub 上最后一次提交的日期（YYYY-MM-DD），用于没有自带更新日期的数据源；取不到时返回 null，不影响抓取。
export async function githubFileDate(repo, file) {
  try {
    const token = githubToken();
    const response = await fetch(`https://api.github.com/repos/${repo}/commits?path=${encodeURIComponent(file)}&per_page=1`, {
      signal: AbortSignal.timeout(20000),
      headers: { accept: 'application/vnd.github+json', 'user-agent': UA, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    });
    if (!response.ok) return null;
    return (await response.json())[0]?.commit?.committer?.date?.slice(0, 10) || null;
  } catch { return null; }
}

// HTTP Last-Modified（YYYY-MM-DD）；取不到时返回 null。
export async function getLastModified(url) {
  try {
    const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(20000), headers: { 'user-agent': UA } });
    const value = response.ok ? response.headers.get('last-modified') : null;
    return value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString().slice(0, 10) : null;
  } catch { return null; }
}
