/**
 * App 相关功能：拉端、关闭页面、保存图片等。
 *
 * 【拉端并在端内打开目标 H5 — 强制约定】
 * 1. 必须依赖 `@tencent/gh-qqnews-downapp`：个人微信/手 Q 已安装客户端时走
 *    `checkAppIsInstalled` → `app.run(qqnews scheme)`；企业微信无法可靠检测安装态，直接 `app.run`。
 * 2. 禁止作为唯一实现：仅用应用宝 `window.open(...launchScheme=...)` 而无 AppDownload（常见结果：只唤起 App，WebView 不打开目标页）。
 * 3. 活动参数 `_addLink` / `startextras` 等须直接拼在 scheme URL 后面（与 `realurl` 平级），避免 double encode。
 * 4. 纯 HTML 须双 CDN：downapp IIFE + qqnews-jsapi.min.js，并生成独立 `qqnews-utils.js`；
 *    该文件内的拉端实现须与本文件等价，禁止将工具函数内联进 HTML。
 *
 * 文档：references/app.md「严格拉端」
 */
import {
  closeWebview,
  saveImageToLocal,
  setActionBtnStyle,
  setGestureQuit as nativeSetGestureQuit,
  openUrl,
} from "@tencent/qqnews-jsapi";
import { isQQNews, isQQ, isQQbrowser, isIOS } from "@tencent/qn-utils";
import AppDownload from "@tencent/gh-qqnews-downapp";
import { isWeixin, isWeixinLike, isWorkWeixin } from "./env";
import {
  initProjectId,
  getProjectId,
  getWebScenes,
  getActivityId,
} from "./common-params";

declare global {
  interface Window {
    TencentNews: any;
    /** CDN 引入 gh-qqnews-downapp IIFE 时可能挂到全局 */
    AppDownload?: unknown;
  }
}

export interface DownAppParams {
  openUrl?: string;
  packageName?: string;
  downloadUrl?: string;
  wxAppId?: string;
  appleStoreId?: string;
  appName?: string;
  downLogo?: string;
  developer?: string;
  appVersion?: string;
  privacyUrl?: string;
  permissionUrl?: string;
}

// ============ 拉端功能 ============

const DOWNLOAD_URL_VIEW = "https://view.inews.qq.com/mobile?downapp=auto";
const LAUNCH_URL = "https://launch.inews.qq.com/applinks/channel/news_news/news_news_top";
/**
 * 降级链路 URL 上 `srcFrom` 的最底层防御性兜底。
 *
 * 正常接入下永远走不到这里——`tryOpenApp` 会把 `getWebScenes() || getProjectId()` 传给降级链路。
 * 仅当：调用方未传 srcFrom + 未调 initProjectId + URL 没带 ?from= 时才会走到本兜底。
 */
const SRC_FROM = "activities";

type AppDownloadInstance = {
  run: (url?: string) => void;
  checkAppIsInstalled: () => Promise<boolean>;
  openApp?: () => void;
  showAppInfo?: (params?: unknown) => void;
  download?: () => void;
};

type AppDownloadConstructor = new (param: DownAppParams) => AppDownloadInstance;

/**
 * gh-qqnews-downapp：部分 WebView 里 window.AppDownload 为 { __esModule, default: ƒ }，须取 .default；
 * npm 默认导出也可能是 default 包装。构造函数需 new 后才有 run / checkAppIsInstalled。
 */
export const getGhAppDownloadConstructor = (): AppDownloadConstructor => {
  if (typeof window !== "undefined") {
    const ad = window.AppDownload;
    if (typeof ad === "function") return ad as AppDownloadConstructor;
    if (ad && typeof (ad as { default?: unknown }).default === "function") {
      return (ad as { default: AppDownloadConstructor }).default;
    }
  }
  const Imp = AppDownload as unknown;
  if (typeof Imp === "function") return Imp as AppDownloadConstructor;
  if (Imp && typeof (Imp as { default?: unknown }).default === "function") {
    return (Imp as { default: AppDownloadConstructor }).default;
  }
  return AppDownload as AppDownloadConstructor;
};

/** 活动 H5 包进 openurl（与 basic-utils scheme.getOpenAppUrl / launch-test 一致；不对 URL 自动追加 query） */
export const getOpenAppUrl = (url: string): string => {
  const finalUrl = url;
  const base = encodeURIComponent(finalUrl);
  return isIOS()
    ? `qqnews://article_9528?act=openurl&realurl=${base}`
    : `qqnews://article_9555?url=${base}`;
};

/** @deprecated 与 getOpenAppUrl 相同，保留兼容旧引用 */
export const getSchemeUrl = getOpenAppUrl;

export class DownloadApp {
  public app: AppDownloadInstance;
  constructor(param: DownAppParams) {
    const Ctor = getGhAppDownloadConstructor();
    this.app = new Ctor(param);
  }
  downloadApp(param: { openUrl?: string }) {
    this.app.run(param.openUrl);
  }
  openApp() {
    this.app.openApp?.();
  }
  download() {
    this.app.download?.();
  }
  async checkAppIsInstalled() {
    return await this.app.checkAppIsInstalled();
  }
  showAppInfo(params?: unknown) {
    this.app.showAppInfo?.(params);
  }
}

const CACHE_KEY = {
  FAKE_DEVICE_ID_KEY: '__BEACON_deviceId',
};

/** 生成一个伪设备 ID（用于未登录时追踪拉端来源） */
const getFakeDeviceId = (): string => localStorage.getItem(CACHE_KEY.FAKE_DEVICE_ID_KEY) || '';

/** 获取浏览器名称 */
const getBrowserName = (): string => {
  if (isWeixinLike()) return 'weixin';
  if (isQQ()) return 'qq';
  if (isQQbrowser()) return 'qqbrowser';
  return 'other';
};

/** 获取启动来源 referrer */
const getStartReferrer = (): string => {
  try {
    return document.referrer || '';
  } catch {
    return '';
  }
};

/** 构造 startExtras 参数 */
const START_EXTRA_VIA = 'activity';

const getStartExtras = (params: {
  extraParams?: Record<string, any>;
}): string => {
  // 全部走 common-params：
  //   project_id：已固化的统一 projectId（与大同上报 publicParams.project_id 共用）
  //   web_scenes：URL ?from=xxx → projectId
  //   activity_id：URL ?activityId=xxx（没有则不上报）
  const projectId = getProjectId();
  const webScenes = getWebScenes();
  const activityId = getActivityId();

  const base: Record<string, unknown> = {
    via: START_EXTRA_VIA,
    web_uid: getFakeDeviceId(),
    web_scenes_plat: getBrowserName(),
    web_start_from: getStartReferrer(),
    web_launched_at: Date.now(),
    web_scenes: webScenes,
    project_id: projectId,
  };
  if (activityId) base.activity_id = activityId;
  return JSON.stringify({
    ...base,
    ...params.extraParams,
  });
};

export interface NativeBarConfig {
  /** 是否启用客户端 NativeBar；false 时写入 `qw_nav_style=0` */
  enabled?: boolean;
  /** 是否展示 Home（趣玩入口）。默认 true */
  showHome?: boolean;
  /** 是否展示 Native 返回按钮。默认 false，由 H5 自绘返回负责页面内部返回 */
  showNativeBack?: boolean;
  /** 是否开启日夜间自动跟随。默认 false，优先使用日间模式；H5 需要随系统日夜间适配时显式设为 true */
  followTheme?: boolean;
  /** 是否开启关闭二次确认弹窗。默认 true */
  closeConfirm?: boolean;
}

export enum NativeBarStyleBit {
  /** 开启 NativeBar */
  NativeBar = 1,
  /** 开启 Home（趣玩入口） */
  Home = 2,
  /** 开启 Native 返回按钮 */
  Back = 4,
  /** 日夜间跟随 */
  FollowTheme = 8,
}

/**
 * NativeBar 顶层默认策略：Home（趣玩入口）+ 更多 + 关闭，不展示 Native 返回按钮。
 * H5 自绘返回时保持默认；只有明确由客户端负责返回时才设置 `showNativeBack: true`。
 */
export const DEFAULT_NATIVE_BAR_CONFIG: Required<NativeBarConfig> = {
  enabled: true,
  showHome: true,
  showNativeBack: false,
  followTheme: false,
  closeConfirm: true,
};

export interface TryOpenAppParams {
  /** 目标页；不传或传空字符串时默认 `window.location.href`（无 `window` 时为 `""`） */
  hrefUrl?: string;
  linkParams?: Record<string, any>;
  extraParams?: Record<string, any>;
  /**
   * 页面在客户端内打开时统一使用 NativeBar：默认追加
   * `qw_nav_style=3`（NativeBar + Home，无 Native 返回，优先日间模式）与 `qw_close_confirm_toast=1`。
   */
  nativeBar?: NativeBarConfig;
  /**
   * 项目唯一标识（统一 projectId，业务词 + `_` + 4 位短哈希，如 `springFestival_k7x2`）。
   *
   * - 必须与大同上报 `initReport({ publicParams: { project_id } })` 使用同一个值
   * - 首次传入会被固化（见 `common-params.initProjectId`），后续任何能力调用都共享
   * - 已固化后再传不同值会被忽略并 warn，避免数据维度被污染
   * - 也可在调用本方法前显式调用 `initProjectId('xxx_k7x2')` 固化
   */
  srcFrom?: string;
}

export const getNativeBarStyle = (config: NativeBarConfig = {}): number => {
  const finalConfig = { ...DEFAULT_NATIVE_BAR_CONFIG, ...config };
  if (!finalConfig.enabled) return 0;

  let style = NativeBarStyleBit.NativeBar;
  if (finalConfig.showHome) style |= NativeBarStyleBit.Home;
  if (finalConfig.showNativeBack) style |= NativeBarStyleBit.Back;
  if (finalConfig.followTheme) style |= NativeBarStyleBit.FollowTheme;
  return style;
};

const setUrlQueryParams = (
  url: string,
  params: Record<string, string>,
): string => {
  if (!url) return url;

  try {
    const base = typeof window !== "undefined" && window.location?.href
      ? window.location.href
      : "https://h5.news.qq.com/";
    const parsed = new URL(url, base);
    Object.entries(params).forEach(([key, value]) => {
      parsed.searchParams.set(key, value);
    });
    return parsed.toString();
  } catch {
    const [mainUrl, hash = ""] = url.split("#", 2);
    const joiner = mainUrl.includes("?") ? "&" : "?";
    const query = Object.entries(params)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join("&");
    return `${mainUrl}${joiner}${query}${hash ? `#${hash}` : ""}`;
  }
};

/**
 * 为客户端内打开 URL 写入 NativeBar 参数。
 * 默认输出 `qw_nav_style=3&qw_close_confirm_toast=1`：启用 NativeBar、Home、关闭二次确认，不展示 Native 返回按钮，优先日间模式。
 */
export const buildNativeBarUrl = (
  url: string,
  config: NativeBarConfig = {},
): string => {
  const finalConfig = { ...DEFAULT_NATIVE_BAR_CONFIG, ...config };
  return setUrlQueryParams(url, {
    qw_nav_style: String(getNativeBarStyle(finalConfig)),
    qw_close_confirm_toast: finalConfig.closeConfirm ? "1" : "0",
  });
};



export const isQQNewsNativeUrl = (url: string) => url.startsWith("qqnews:");
export const getArticleSchemeById = (id: string) =>
  `qqnews://article_9527?nm=${id}`;
export const getTopicSchemeByTopicId = (topicId: string) =>
  `qqnews://article_9528?act=topic&topic_id=${topicId}`;
export const getTagSchemeByTagId = (tagId: string) => {
  const encodeTagInfo = encodeURIComponent(`{"tag_id": "${tagId}"}`);
  return `qqnews://article_9527?nm=NEWSJUMP_123&jumpinfo=${encodeTagInfo}`;
};

export const QQNEWS_LOGO_NEW =
  "https://mat1.gtimg.com/qqcdn/tupload/1640679662268.png";

export const QQNewsAppDownloadInfo: DownAppParams = {
  packageName: "com.tencent.news",
  downloadUrl: "https://dldir1v6.qq.com/dlomg/inews/TencentNews_14035.apk",
  wxAppId: "wx073f4a4daff0abe8",
  appleStoreId: "399363156",
  appName: "腾讯新闻-打开眼界",
  downLogo: QQNEWS_LOGO_NEW,
};

/**
 * @description 判断是否是热点事件
 * @param url 如 'https://view.inews.qq.com/hotEvent/UTR2022011300551100'
 */
export const isHotEventUrl = (url: string) => /\b\/hotEvent\//.test(url);

/**
 * @description 判断是否是文章底层页
 * @param url https://view.inews.qq.com/a/20220111V03PUC00?#
 */
export const isArticleUrl = (url: string) => /\b\/a\//.test(url);

/**
 * @description 判断是否是话题底层页
 * @param url ‘https://view.inews.qq.com/topic/764502’
 */
export const isTopicUrl = (url: string) => /\/\btopic\/\b/.test(url);

export const isTopicId = (id: string) => /^\d{6}/.test(id) && id.length === 6;

export const isTagId = (id: string) => /^\d{8}/.test(id) && id.length >= 8;

/** 与 basic-utils / launch-test 一致：从 URL 取路径段 id */
export const getUrlMatchId = (url: string): string => {
  const reg = /[a-zA-z]+:\/\/([^\s]*)?(\/)([a-z,A-Z,0-9,=]+)(\?#)?/;
  const m = url.match(reg);
  return m ? m[3] : url;
};

/**
 * 文章 / 热点 / 话题 / tag → qqnews scheme；普通活动 H5 仍为 https（与 launch-test mapHrefToContentScheme 一致）
 */
export const mapHrefToContentScheme = (url: string): string => {
  let scheme = url;
  if (isArticleUrl(url)) {
    const aid = getUrlMatchId(url);
    if (aid !== url) scheme = getArticleSchemeById(aid);
  }
  if (isHotEventUrl(url)) {
    const hid = getUrlMatchId(url);
    if (hid !== url) scheme = getArticleSchemeById(hid);
  }
  if (isTopicUrl(url) || isTopicId(url)) {
    if (isTopicId(url)) scheme = getTopicSchemeByTopicId(url);
    else {
      const tid = getUrlMatchId(url);
      if (tid !== url) scheme = getTopicSchemeByTopicId(tid);
    }
  }
  if (isTagId(url)) scheme = getTagSchemeByTagId(url);
  return scheme;
};

/*
ios微信a链接有白名单会自动拉端，在需要微信内直接消费的需求下，需要替换为k链接
*/
export const replaceIosWxShareUrl = (url: string) => {
  if (!isIOS() || !isWeixin()) {
    return url;
  }
  if (isArticleUrl(url)) {
    return url.replace(/\/a\//, "/k/");
  }
  if (isHotEventUrl(url)) {
    return url.replace(/\/hotEvent\//, "/k/");
  }
  return url;
};

export const openLink = (link: string) => {
  if (isQQNews()) {
    openUrl({ url: link });
  } else {
    if (self === top) {
      window.open(link);
    } else {
      window.open(link, "_top");
    }
  }
};

// ============ 剪贴板工具 ============

/**
 * 复制文本到剪切板
 */
export function copyToClipboard(text: string) {
  if (typeof document?.execCommand !== 'function') {
    return false;
  }
  let clipSuccess = false;
  try {
    const elem = document.createElement('textarea');
    elem.value = text;
    document.body.appendChild(elem);
    elem.select();
    clipSuccess = document.execCommand('copy');
    document.body.removeChild(elem);
  } catch (error) {
    clipSuccess = false;
    console.error(error);
  }
  return clipSuccess;
}

/**
 * 复制带 b 标签腾讯新闻格式的 scheme 地址到剪切板，客户端启动后可通过剪贴板读取 scheme 进行页面跳转
 */
export function copyNewsScheme(schemeUrl: string) {
  const textString = `<b id="${encodeURIComponent(`${schemeUrl}&time=${new Date().getTime()}`)}" style="margin:0px;">&nbsp;</b>`;
  try {
    copyToClipboard(textString);
  } catch (err) {
    console.error(`copyToClipboard ${textString} ${err}`);
  }
}

const openLaunchSchemeFallback = (url: string, srcFrom?: string) => {
  const newSrcFrom = srcFrom || SRC_FROM;
  let downloadUrl = `${DOWNLOAD_URL_VIEW}&`;
  if (isIOS() && !(isWeixinLike() || isQQ() || isQQbrowser())) {
    downloadUrl = `${LAUNCH_URL}?`;
  }

  // 在跳转前将 scheme 写入剪贴板，客户端启动后可通过剪贴板读取 scheme 进行页面跳转
  copyNewsScheme(url);

  return window.open(
    `${downloadUrl}srcFrom=${encodeURIComponent(newSrcFrom)}&downapp=launch&launchScheme=${encodeURIComponent(url)}`,
  );
};

/**
 * 带环境判断的拉端
 * - 端内直接 openUrl
 * - iOS 非微信/QQ/QQ浏览器 使用 Universal Link
 * - 其余降级到应用宝下载页
 */
export const openNativeUrlOrHttpUrl = (url: string, srcFrom?: string) => {
  if (isQQNewsNativeUrl(url)) {
    return openNativeSchemeWithSrc(url, srcFrom);
  }
  const httpUrl = replaceIosWxShareUrl(url);
  openLink(httpUrl);
};

/**
 * 带宿主判断打开腾讯新闻 Scheme：
 * - 企业微信的 WXWorkAppDownloader 无法可靠检测安装态，直接 run，与 little-bbq-house 线上实现一致
 * - 个人微信 / 手 Q 仍先检测安装态，未安装时走 launchScheme 降级
 */
export const openNativeSchemeWithSrc = async (
  url: string,
  srcFrom?: string,
): Promise<void> => {
  if (isQQNews()) {
    openUrl({ url });
    return;
  }
  const Ctor = getGhAppDownloadConstructor();

  if (isWorkWeixin()) {
    try {
      const app = new Ctor(QQNewsAppDownloadInfo);
      app.run(url);
      return;
    } catch (e) {
      console.warn("[qqnews-utils] WXWork AppDownload", e);
      openLaunchSchemeFallback(url, srcFrom);
      return;
    }
  }

  if (isWeixin() || isQQ()) {
    try {
      const app = new Ctor(QQNewsAppDownloadInfo);
      const isInstall = await app.checkAppIsInstalled();
      if (isInstall) {
        app.run(url);
        return;
      }
    } catch (e) {
      console.warn("[qqnews-utils] AppDownload", e);
    }
    openLaunchSchemeFallback(url, srcFrom);
    return;
  }
  openLaunchSchemeFallback(url, srcFrom);
};

/**
 * scheme URL 上 `from` 字段的兜底值（非已识别宿主时使用）。
 *
 * 与主站 `apps/h5` `get-open-url.js` 中 `getFrom` 的取值顺序对齐：
 * - 内置 QQ 环境：`mobileQQPush`
 * - 微信环境：`weixin`
 * - QQ 浏览器：`qb`
 * - ima 环境：`ima`
 * - 其它环境：回退到本常量（保留 h5-activities 原业务语义，不使用主站的 `unknown`）
 */
const SCHEME_FROM_FALLBACK = 'activity';

type MatchInfoType = {
  type: string;
  content: string;
  icon?: string;
  label?: string;
  scheme?: string;
  // 会员专区付费卡片开始播放时间, 单位秒
  startTime?: number;
};

type RelatedInfoType = MatchInfoType & { url?: string };

const enum RelatedEntryType {
  event = 'event', // 事件类
  topic = 'topic', // 专题类
  longVideo = 'long_video', // 长视频
  ip = 'ip', // 出品类
  search = 'search', // 搜索
  welfare = 'welfare', // 公益
  collection = 'collection', // 合集
  question = 'question', // 热问
  paidColumn = 'paid_column', // 付费专栏
  vipZone = 'vip_zone', // 会员专区
  vipCollection = 'vip_collection', // 会员合集
  vipLatestWork = 'vip_latest_work', // 会员最新作品
  relatedVideo = 'related_video', // 相关视频
  askIma = 'ask_ima', // ima 问题
  paidCardVipArea = 'paid_card_vip_area', // 会员专区付费卡片
  paidCardCollection = 'paid_card_collection', // 合集付费卡片
  paidCardColumn = 'paid_card_column', // 付费专栏付费卡片
  paidCardH5 = 'paid_card_h5', // H5付费卡片
}

// 是否是ima挂载条
export const isIma = (currentRelatedInfo?:
  RelatedInfoType | null) => currentRelatedInfo?.type === RelatedEntryType.askIma;

/**
 * 按当前宿主环境解析 scheme URL 上的 `from` 取值。
 * 判定顺序与主站 `apps/h5` `getFrom` 保持一致；非已识别宿主时使用 `SCHEME_FROM_FALLBACK` 兜底。
 */
const resolveSchemeFrom = (): string => {
  if (isQQ()) return 'mobileQQPush';
  if (isWeixinLike()) return 'weixin';
  if (isQQbrowser()) return 'qb';
  if (isIma()) return 'ima';
  return SCHEME_FROM_FALLBACK;
};


const buildLaunchUrl = (hrefUrl: string): string => {
  if (!/^https?:\/\//i.test(hrefUrl)) return hrefUrl;
  try {
    const pageUrl = new URL(hrefUrl);
    pageUrl.searchParams.set('launchFrom', 'external');
    pageUrl.searchParams.set('launchSource', getBrowserName() || 'unknown');
    return pageUrl.toString();
  } catch {
    return hrefUrl;
  }
};

/** 通用拉端（与 launch-test tryOpenApp / basic-utils callApp 一致） */
export const tryOpenApp = (params: TryOpenAppParams = {}): boolean => {
  const {
    hrefUrl: hrefUrlParam,
    linkParams,
    extraParams,
    nativeBar,
  } = params;

  // 入参 srcFrom 语义：项目唯一标识（统一 projectId）
  // 如果传了，自动固化到 common-params（与大同 publicParams.project_id 共享同一个值）
  // 后续场景标识 web_scenes 由 common-params.getWebScenes() 统一计算：URL ?from= → projectId
  if (params.srcFrom) initProjectId(params.srcFrom);

  const rawHrefUrl =
    hrefUrlParam != null && hrefUrlParam !== ""
      ? hrefUrlParam
      : typeof window !== "undefined" && window.location?.href
        ? window.location.href
        : "";
  const hrefUrl = nativeBar ? buildNativeBarUrl(rawHrefUrl, nativeBar) : rawHrefUrl;
  const addParams = linkParams ? JSON.stringify(linkParams) : "";
  const mapped = mapHrefToContentScheme(hrefUrl);
  const ext = getStartExtras({ extraParams });
  const activityQs = `_addLink=1&_addparams=${encodeURIComponent(addParams)}&from=${resolveSchemeFrom()}&startextras=${encodeURIComponent(
    ext,
  )}`;
  let fullScheme: string;
  if (isQQNewsNativeUrl(mapped)) {
    fullScheme = mapped.includes("?")
      ? `${mapped}&${activityQs}`
      : `${mapped}?${activityQs}`;
  } else {
    // 先把纯目标 URL encode 进 scheme，再把活动参数直接拼在 scheme 后面，避免 double encode
    const launchUrl = buildLaunchUrl(mapped);
    const schemeUrl = getOpenAppUrl(launchUrl);
    fullScheme = `${schemeUrl}&${activityQs}`;
  }
  console.log('[tryOpenApp] 拉端地址:', fullScheme);
  // 降级链路（应用宝 / Universal Link）仍需要一个 srcFrom 字符串拼到 URL 上
  // 优先用 web_scenes（URL ?from= → projectId），保持与上报数据语义一致
  void openNativeUrlOrHttpUrl(fullScheme, getWebScenes() || getProjectId());
  return true;
};

// ============ 关闭页面 ============

/** 关闭当前 webview */
export const closeCurrentPage = () => {
  closeWebview();
};

// ============ 保存图片 ============

/** 保存图片到本地相册 */
export const savePhotoWithApp = (imgUrl: string) => {
  saveImageToLocal({ imgUrl });
};

// ============ 页面右上角按钮 ============

/** 右上角按钮类型 */
export enum ActionBtnType {
  /** 不展示 */
  Hide = 0,
  /** 分享按钮 */
  Share = 1,
  /** 刷新按钮 */
  Refresh = 2,
}

/**
 * 设置页面右上角按钮样式
 * 仅支持 articleType=17 类型的 web 详情页
 * @param type 按钮类型：0-不展示 1-分享按钮 2-刷新按钮
 */
export const setRightActionBtn = (type: ActionBtnType = ActionBtnType.Hide) => {
  setActionBtnStyle({ type });
};

// ============ 右滑退出页面手势 ============

/**
 * 开启 / 关闭当前 webview 的右滑退出页面手势。
 * 详见 `references/app.md`。
 * @param params.enabled 历史命名反直觉但必须照用：true-禁止/关闭右滑退出；false-恢复/开启右滑退出。不要按字面含义反转。
 */
export const setGestureQuit = (params: { enabled: boolean }) => {
  nativeSetGestureQuit({ enabled: params.enabled });
};
