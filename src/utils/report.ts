/**
 * 大同 UniversalReport H5 SDK 封装（整合自 universal-report skill）
 *
 * SDK 必须由使用方在 index.html 通过 `<script>` 静态引入：
 *
 *   <script
 *     src="https://staticfile.qq.com/datong/universalReportH5/4.6.2/universal-report.min.js"
 *     charset="utf-8"
 *   ></script>
 *
 * ─── Vue 项目推荐接入方式（App.vue） ────────────────────────────────────────
 *
 * ```ts
 * // App.vue
 * import { onMounted } from 'vue';
 * import { initReport, buildPgid } from './utils/report';
 *
 * onMounted(() => {
 *   // ✅ 不 await：new Ctor() 同步完成即注册 Observer；
 *   // iOS / 鸿蒙优先从 WebView Cookie 读取 QIMEI36，Android 等旧链路再由 JSAPI 异步补充
 *   initReport({
 *     publicParams: { project_id: 'yourProject_k7x2' }, // 同时固化 projectId（拉端 srcFrom 自动共用），web_scenes 由 SDK 自动从 URL ?from= 取，缺省用 projectId
 *   });
 * });
 * ```
 *
 * ⚠️  不要在 main.ts 顶层 init：Vue 尚未 mount，dt-params 依赖的异步数据（如
 *     接口返回的 activity_id）可能还是空值，导致首屏 dt_pgin 数据不完整。
 *
 * ⚠️  不要 `await initReport()`：`initReport` 内部先同步创建 SDK 实例（注册
 *     MutationObserver），再后台重试补充端内 QIMEI36。`await` 不会等待 QIMEI36，
 *     也不会带来额外价值，反而让调用方代码变成 async 增加复杂度。
 *
 * ─── 异步数据就绪后释放上报（hold 模式） ─────────────────────────────────────
 *
 * 当 dt-params 依赖异步接口数据时，使用 dt-cmd="hold=true" 先暂停，数据就绪后释放：
 *
 * ```vue
 * <template>
 *   <div
 *     dt-pgid="pg_xxx_home"
 *     :dt-params="reportParams"
 *     :dt-cmd="holdCmd"
 *   >
 *     <!-- 页面内容 -->
 *   </div>
 * </template>
 *
 * <script setup lang="ts">
 * import { ref, computed, onMounted } from 'vue';
 * import { encodeDtParams } from './utils/report';
 *
 * const activityId = ref('');
 * const isReportReady = ref(false);
 *
 * // dt-cmd：数据未就绪时暂停该节点上报
 * const holdCmd = computed(() => isReportReady.value ? 'hold=false' : 'hold=true');
 * const reportParams = computed(() => encodeDtParams({ activity_id: activityId.value }));
 *
 * onMounted(async () => {
 *   const res = await fetchActivityInfo();
 *   activityId.value = res.id;
 *   isReportReady.value = true; // 数据就绪，释放上报
 * });
 * </script>
 * ```
 *
 * ─── React 项目推荐接入方式 ─────────────────────────────────────────────────
 *
 * ```tsx
 * // App.tsx
 * import { useEffect } from 'react';
 * import { initReport } from './utils/report';
 *
 * export function App() {
 *   useEffect(() => {
 *     initReport({
 *       publicParams: { project_id: 'yourProject_k7x2' }, // 同时固化 projectId（拉端 srcFrom 自动共用），web_scenes 由 SDK 自动从 URL ?from= 取，缺省用 projectId
 *     });
 *   }, []);
 *   // ...
 * }
 * ```
 *
 * ─── 拉端 eid 切换（与 app.ts 联动） ────────────────────────────────────────
 *
 * ```ts
 * import { isQQNews } from '@tencent/qn-utils';
 * import { DT_EID, buildBtnId, encodeDtParams } from './utils/report';
 * import { tryOpenApp } from './utils/app';
 *
 * // 端内用 em_btn，端外拉端用 em_pull_news；btn_id 不变
 * const btnEid = isQQNews() ? DT_EID.BTN : DT_EID.PULL_NEWS;
 * const lotteryParams = encodeDtParams({ btn_id: buildBtnId('fans-club', 'lottery') });
 * ```
 *
 * ```html
 * <button :dt-eid="btnEid" :dt-params="lotteryParams" @click="onLottery">立即抽奖</button>
 * ```
 */

import { isQQNews, isIOS, isHarmonyNext } from '@tencent/qn-utils';
import { getAppInfo } from '@tencent/qqnews-jsapi';
import {
  initProjectId,
  getProjectId,
  getWebScenes,
  getActivityId,
} from './common-params';

/** 默认 AppKey：腾讯新闻活动通用 appkey，可在 initReport 时通过 `appkey` 字段覆盖。 */
export const DEFAULT_APPKEY = '0WEB06Z2F15ECXWD';

/** 账号信息（字段命名与大同 SDK v4 规范一致，无 `_h5` 后缀）。 */
export interface AccountInfo {
  /** QQ 号 */
  dt_qq?: string;
  /** QQ openid */
  dt_qqopenid?: string;
  /** 微信 openid */
  dt_wxopenid?: string;
  /** 微博 openid */
  dt_wbopenid?: string;
  /** 主登录类型：qq / wx / weibo / ... */
  dt_mainlogin?: string;
}

/** 业务公参（自定义公共参数，**不能以 `dt_` 开头**）。 */
export interface PublicParams {
  [key: string]: string | number | boolean | undefined;
}

/** 页面参数。 */
export type PageParams = Record<string, unknown>;

/** `initReport` 入参。 */
export interface ReportInitOptions {
  /** 灯塔 AppKey；不传使用 `DEFAULT_APPKEY` */
  appkey?: string;
  /** 业务公参（不能以 `dt_` 开头） */
  publicParams?: PublicParams;
  /** 页面参数 */
  pageParams?: PageParams;
  /** 账号信息 */
  accountInfo?: AccountInfo;
  /** 透传给大同 SDK 的原生配置（高级用法） */
  sdkOptions?: Record<string, unknown>;
}

/** `reportEvent` 入参。 */
export interface ReportEventPayload {
  /** 页面 ID；缺省时使用 SDK 当前页 */
  pgid?: string;
  /** 事件名（必填，由使用方完整传入，含业务前缀） */
  eventName: string;
  /** 业务参数 */
  businessParams?: Record<string, unknown>;
  /** 本次事件的页面参数覆盖 */
  pageParams?: Record<string, unknown>;
  /** 本次事件的公参覆盖 */
  publicParams?: Record<string, unknown>;
  /** 是否使用 sendBeacon 上报 */
  isSendBeacon?: boolean;
}

/** SDK 实例暴露的方法（仅列出本封装会用到的） */
interface IUniversalReporter {
  reportEvent(ctx: ReportEventPayload): void;
  setPageParams(params: Record<string, unknown>): void;
  setAccountInfo(info: AccountInfo): void;
  setPublicParams(params: Record<string, unknown>): void;
  /** 设置大同 / Beacon 原生 QIMEI36 字段（UniversalReport 4.x）。 */
  setQimei?(qimei: string): void;
  getDeviceId?(): string;
}

declare global {
  interface Window {
    UniversalReport?: new (opts: Record<string, unknown>) => IUniversalReporter;
    universalReport?: new (opts: Record<string, unknown>) => IUniversalReporter;
    __UNIVERSAL_REPORTER__?: IUniversalReporter;
  }
}

let reporterInstance: IUniversalReporter | null = null;

const LOG_PREFIX = '[report]';

interface AppInfoWithQimei {
  QIMEI36?: string;
  qimei?: string;
}

let qimei36Ready = false;
let cachedQimei36 = '';
let qimei36Injecting: Promise<string> | null = null;

/** iOS 已注入；鸿蒙客户端完成需求后也使用同一个 Cookie key。 */
const QIMEI36_COOKIE_KEY = 'vdevice_qimei36';
const QIMEI36_RETRY_DELAYS = [0, 80, 160, 300, 500, 800, 1200, 1800, 2500];

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeQimei36Value(value: unknown): string {
  if (typeof value !== 'string') return '';
  const qimei36 = value.trim();
  const lowerValue = qimei36.toLowerCase();
  if (!qimei36 || lowerValue === 'undefined' || lowerValue === 'null') return '';
  return qimei36;
}

function getQimei36FromAppInfo(appInfo: unknown, allowLowercaseQimei: boolean): string {
  const info = appInfo as AppInfoWithQimei | null;
  if (!allowLowercaseQimei) {
    return typeof info?.QIMEI36 === 'string' ? info.QIMEI36 : '';
  }
  return normalizeQimei36Value(info?.QIMEI36 || info?.qimei);
}

/** 新 Cookie + setQimei 链路只应用于 TAPD 明确要求的 iOS / HarmonyNext。 */
function shouldUseCookieQimei36(): boolean {
  return isIOS() || isHarmonyNext();
}

/**
 * 读取客户端 WebView 注入的 QIMEI36 Cookie。
 *
 * Cookie 必须允许 JavaScript 读取（不能是 HttpOnly），且 domain/path 需覆盖当前 H5。
 * 这里只返回值，不输出完整设备标识到日志。
 */
function getQimei36FromCookie(): string {
  if (typeof document === 'undefined') return '';
  try {
    const prefix = `${QIMEI36_COOKIE_KEY}=`;
    const item = document.cookie
      .split(';')
      .map(part => part.trim())
      .find(part => part.startsWith(prefix));
    if (!item) return '';

    const rawValue = item.slice(prefix.length);
    try {
      return normalizeQimei36Value(decodeURIComponent(rawValue));
    } catch {
      return normalizeQimei36Value(rawValue);
    }
  } catch (err) {
    console.warn(`${LOG_PREFIX} 读取 QIMEI36 Cookie 失败:`, err);
    return '';
  }
}

/**
 * 将真实 QIMEI36 写入 SDK。
 *
 * - 全平台：调用 `setQimei` 写入大同 / Beacon 原生设备字段，并双写兼容公参。
 * - Android：仍原样透传 `getAppInfo().QIMEI36`，不读取 Cookie、不启用小写 `.qimei`。
 */
function injectQimei36(qimei36: string, normalizeValue: boolean): void {
  const resolvedQimei36 = normalizeValue ? normalizeQimei36Value(qimei36) : qimei36;
  if (!resolvedQimei36) return;

  const isSameQimei = qimei36Ready && cachedQimei36 === resolvedQimei36;
  cachedQimei36 = resolvedQimei36;
  if (!reporterInstance || isSameQimei) return;

  let applied = false;
  if (typeof reporterInstance.setQimei === 'function') {
    try {
      reporterInstance.setQimei(resolvedQimei36);
      applied = true;
    } catch (err) {
      console.warn(`${LOG_PREFIX} setQimei 失败:`, err);
    }
  } else {
    console.warn(`${LOG_PREFIX} 当前 UniversalReport SDK 不支持 setQimei，已降级为旧公参`);
  }

  try {
    reporterInstance.setPublicParams({ QIMEI36: resolvedQimei36 });
    applied = true;
  } catch (err) {
    console.warn(`${LOG_PREFIX} 兼容写入 QIMEI36 公参失败:`, err);
  }

  qimei36Ready = applied;
}

/**
 * 获取并注入 QIMEI36。
 *
 * 取值顺序：
 * - iOS / HarmonyNext：WebView Cookie `vdevice_qimei36` → JSAPI 兼容兜底，并调用 `setQimei`。
 * - Android：保持 `getAppInfo().QIMEI36` 来源不变，不读取 Cookie；获取后调用 `setQimei` 并双写兼容公参。
 * - 均未获取到时不伪造 QIMEI36，由 SDK 自身 Web Device ID（A2）兜底。
 *
 * iOS / HarmonyNext 每次 JSAPI 重试前都会重新读取 Cookie，兼容客户端稍晚注入。
 */
function ensureQimei36Injected(): Promise<string> {
  const useCookieQimei36 = shouldUseCookieQimei36();
  if (useCookieQimei36) {
    const cookieQimei36 = getQimei36FromCookie();
    if (cookieQimei36) {
      injectQimei36(cookieQimei36, true);
      return Promise.resolve(cookieQimei36);
    }
  }
  if (qimei36Ready) return Promise.resolve(cachedQimei36);
  if (!isQQNews()) return Promise.resolve('');
  if (qimei36Injecting) return qimei36Injecting;

  qimei36Injecting = (async () => {
    for (const delay of QIMEI36_RETRY_DELAYS) {
      if (delay > 0) await sleep(delay);

      if (useCookieQimei36) {
        const latestCookieQimei36 = getQimei36FromCookie();
        if (latestCookieQimei36) {
          injectQimei36(latestCookieQimei36, true);
          return latestCookieQimei36;
        }
      }

      try {
        const appInfo = await getAppInfo();
        const qimei36 = getQimei36FromAppInfo(appInfo, useCookieQimei36);
        if (qimei36) {
          injectQimei36(qimei36, useCookieQimei36);
          return qimei36;
        }
      } catch (e) {
        console.warn(`${LOG_PREFIX} 端内获取 QIMEI36 失败，稍后重试:`, e);
      }
    }

    console.warn(`${LOG_PREFIX} 多次尝试后仍未获取到 QIMEI36，将使用 SDK 自身设备标识`);
    return '';
  })().finally(() => {
    qimei36Injecting = null;
  });

  return qimei36Injecting;
}

/**
 * 从 URL 中获取指定参数值。
 *
 * @deprecated 改用 `common-params.getUrlParam` / `getWebScenes` / `getActivityId`。
 *   保留导出兼容旧引用（一些项目可能 import 了它）。
 */
function getUrlParam(name: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  } catch {
    return null;
  }
}
void getUrlParam; // 避免 unused 报错

function getSdkCtor(): (new (opts: Record<string, unknown>) => IUniversalReporter) | null {
  if (typeof window === 'undefined') return null;
  return window.UniversalReport || window.universalReport || null;
}

/**
 * 初始化大同 SDK 单例。
 *
 * **Vue 项目**：必须在 `App.vue` 的 `onMounted` 中调用（不要放在 `main.ts` 顶层），
 * 确保 DOM 已渲染，`dt-params` 中的动态值能够被 Observer 正确读取。
 *
 * **React 项目**：在根组件的 `useEffect(() => { initReport(...) }, [])` 中调用。
 *
 * iOS / HarmonyNext 优先从 WebView Cookie `vdevice_qimei36` 读取并通过 `setQimei` 写入 SDK；
 * Android 保持 `getAppInfo().QIMEI36` 来源不变，并新增 `setQimei` 标准字段写入。
 *
 * **统一 projectId 固化**：调用方在 `publicParams.project_id` 传入的值会被自动固化到
 * `common-params`，与拉端 `tryOpenApp({ srcFrom })` 共享同一个 projectId，保证两端
 * 数据维度对齐。
 *
 * **自动注入公参**（无需调用方手写，传入的 `publicParams` 同名字段会覆盖自动值）：
 * - `web_scenes`：URL `?from=xxx` → 统一 projectId（与拉端 `srcFrom` 共用同一个 URL key）
 * - `project_id`：调用方在 `publicParams.project_id` 传入的统一 projectId
 * - `activity_id`：URL `?activityId=xxx`，没有就不注入
 *
 * ⚠️ **调用方无需 `await`**：`initReport` 内部先同步 `new Ctor()` 注册 MutationObserver，
 * 再后台重试补充端内 QIMEI36。端外场景 `new Ctor()` 同步完成后 Observer 即生效，
 * 首屏已渲染的 `dt-eid` 节点能立刻被捕获上报。
 *
 * @throws 当 `window.UniversalReport` 未就绪时抛出（请检查 index.html 的 SDK script 引入）
 */
export async function initReport(options: ReportInitOptions = {}): Promise<IUniversalReporter> {
  if (typeof window === 'undefined') {
    throw new Error(`${LOG_PREFIX} initReport 只能在浏览器环境调用`);
  }
  if (reporterInstance) {
    void ensureQimei36Injected();
    return reporterInstance;
  }

  if (window.__UNIVERSAL_REPORTER__) {
    reporterInstance = window.__UNIVERSAL_REPORTER__;
    void ensureQimei36Injected();
    return reporterInstance;
  }

  const Ctor = getSdkCtor();
  if (!Ctor) {
    throw new Error(
      `${LOG_PREFIX} window.UniversalReport 未就绪，请确认 index.html 已静态引入 ` +
        'https://staticfile.qq.com/datong/universalReportH5/4.6.2/universal-report.min.js'
    );
  }

  // 固化统一 projectId（与拉端共享）
  const userProjectId = (options.publicParams?.project_id as string | undefined) || '';
  if (userProjectId) initProjectId(userProjectId);

  // 自动注入公参（全部走 common-params，与拉端 startextras 完全一致）
  //   web_scenes：URL ?from=xxx → 统一 projectId
  //   project_id：已固化的统一 projectId
  //   activity_id：URL ?activityId=xxx（没有则不注入）
  const autoPublicParams: Record<string, string> = {};
  const webScenes = getWebScenes();
  if (webScenes) autoPublicParams.web_scenes = webScenes;
  const projectId = getProjectId();
  if (projectId) autoPublicParams.project_id = projectId;
  const activityId = getActivityId();
  if (activityId) autoPublicParams.activity_id = activityId;

  const sdkOpts: Record<string, unknown> = {
    beacon: options.appkey || DEFAULT_APPKEY,
    accountInfo: options.accountInfo,
    publicParams: {
      ...autoPublicParams,
      ...options.publicParams,
    },
    enableBeaconReportRetry: true,
    enableCrawlerFilter: true,
    isDisableObserver: false,
    ...(options.sdkOptions || {}),
  };

  // ✅ 先同步 new Ctor() 注册 MutationObserver，确保首屏 dt-eid 节点立即被捕获
  reporterInstance = new Ctor(sdkOpts);
  window.__UNIVERSAL_REPORTER__ = reporterInstance;

  if (options.pageParams && reporterInstance && typeof reporterInstance.setPageParams === 'function') {
    try {
      reporterInstance.setPageParams(options.pageParams);
    } catch (err) {
      console.warn(`${LOG_PREFIX} initReport 阶段 setPageParams 失败:`, err);
    }
  }

  // ✅ iOS / HarmonyNext：Cookie 优先；Android：JSAPI 来源不变；全平台获取后 setQimei + 兼容公参
  void ensureQimei36Injected();

  return reporterInstance;
}

export function ensureReportQimei36(): Promise<string> {
  return ensureQimei36Injected();
}

/** 获取大同 SDK 原始实例（一般用于扩展场景）。 */
export function getReporter(): IUniversalReporter | null {
  return reporterInstance;
}

/**
 * 上报业务自定义事件。
 *
 * **使用前提**：已调用 `initReport`。
 *
 * **默认应使用声明式上报**（`dt-eid` / `dt-params`）；
 * 仅在以下场景才调用此方法：
 * - 用户明确要求手动上报
 * - 异步操作结果（接口返回后上报成功/失败）
 * - 非 DOM 交互（手势、滚动到底、倒计时结束等）
 *
 * ⚠️ 已挂 `dt-eid` 的元素禁止再调用此方法报同一次点击（会重复上报）。
 */
export function reportEvent(payload: ReportEventPayload): void {
  if (!payload || !payload.eventName) {
    console.warn(`${LOG_PREFIX} reportEvent 缺少 eventName:`, payload);
    return;
  }
  if (!reporterInstance) {
    console.warn(`${LOG_PREFIX} reportEvent 调用前请先 initReport，本次事件被丢弃:`, payload.eventName);
    return;
  }
  try {
    reporterInstance.reportEvent(payload);
  } catch (err) {
    console.warn(`${LOG_PREFIX} reportEvent 调用失败:`, err);
  }
}

/** 更新业务公参（key 不能以 `dt_` 开头）。 */
export function setReportPublicParams(params: PublicParams): void {
  if (!params) return;
  if (!reporterInstance) {
    console.warn(`${LOG_PREFIX} setReportPublicParams 调用前请先 initReport`);
    return;
  }
  try {
    reporterInstance.setPublicParams(params as Record<string, unknown>);
  } catch (err) {
    console.warn(`${LOG_PREFIX} setReportPublicParams 失败:`, err);
  }
}

/** 更新页面参数（SDK 会合并到后续 `dt_imp` / `dt_clck` 等事件）。 */
export function setReportPageParams(params: PageParams): void {
  if (!params) return;
  if (!reporterInstance) {
    console.warn(`${LOG_PREFIX} setReportPageParams 调用前请先 initReport`);
    return;
  }
  try {
    reporterInstance.setPageParams(params);
  } catch (err) {
    console.warn(`${LOG_PREFIX} setReportPageParams 失败:`, err);
  }
}

/** 更新账号信息（建议使用无 `_h5` 后缀字段，与 SDK v4 文档一致）。 */
export function setReportAccountInfo(info: AccountInfo): void {
  if (!info) return;
  if (!reporterInstance) {
    console.warn(`${LOG_PREFIX} setReportAccountInfo 调用前请先 initReport`);
    return;
  }
  try {
    reporterInstance.setAccountInfo(info);
  } catch (err) {
    console.warn(`${LOG_PREFIX} setReportAccountInfo 失败:`, err);
  }
}

/**
 * 用 `_` 拼接多个非空段为 pgid（**不内置任何前缀**）。
 *
 * @example
 *   buildPgid('pg', 'my-project', 'home') // => 'pg_my-project_home'
 */
export function buildPgid(...segments: string[]): string {
  return segments.filter(seg => typeof seg === 'string' && seg.length > 0).join('_');
}

/**
 * 生成平台通用按钮的 `btn_id`（`{projectSnake}_{action}_btn`）。
 *
 * @example buildBtnId('fans-club', 'lottery') // => 'fans_club_lottery_btn'
 */
export function buildBtnId(projectId: string, action: string): string {
  const prefix = projectId.replace(/-/g, '_');
  return `${prefix}_${action}_btn`;
}

/**
 * 大同平台通用元素 eid。
 *
 * 同一页面多个按钮**共用同一个 eid**，用 `dt-params` 中的 `btn_id` 区分。
 *
 * ⚠️ **DOM 层级约束**：带 `dt-eid` 的元素必须是某个 `dt-pgid` 节点的**子元素**，
 * 否则 SDK 无法确定该元素归属哪个页面，曝光（dt_imp）和点击（dt_clck）都不会上报。
 * 如果元素在页面组件外部（如 App.vue 根组件中），需在其祖先节点上加 `dt-pgid`
 * （可配合 `dt-pg-ignore="true"` 避免多报页面曝光）。
 *
 * 端内/端外 eid 切换示例：
 *
 * ```ts
 * import { isQQNews } from '@tencent/qn-utils';
 * const btnEid = isQQNews() ? DT_EID.BTN : DT_EID.PULL_NEWS;
 * ```
 */
export const DT_EID = {
  /** 端内普通按钮点击 */
  BTN: 'em_btn',
  /** 端外点击触发拉 App */
  PULL_NEWS: 'em_pull_news',
} as const;

/**
 * 把对象编码为 `dt-params` / `dt-cmd` 等 DOM 属性可用的 querystring。
 * - 自动过滤 `undefined` / `null`
 * - key 与 value 均做 `encodeURIComponent`
 *
 * @example
 *   encodeDtParams({ active_id: 123, idx: 0 }) // => "active_id=123&idx=0"
 */
export function encodeDtParams(params?: Record<string, unknown> | null): string {
  if (!params) return '';
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}

/**
 * 获取当前环境下按钮应使用的 eid。
 * - 端内（腾讯新闻 App）→ `em_btn`
 * - 端外（会触发拉端）→ `em_pull_news`
 *
 * 与 `tryOpenApp`（app.ts）联动：端外点击先执行拉端逻辑，同时此 eid 自动上报拉端行为。
 */
export function getBtnEid(): string {
  return isQQNews() ? DT_EID.BTN : DT_EID.PULL_NEWS;
}
