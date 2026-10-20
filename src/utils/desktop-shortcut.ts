import {
  addShortCut,
  createLauncherShortcut,
  supportLauncherShortcut,
} from "@tencent/qqnews-jsapi";
import { isIOS, isQQNews } from "@tencent/qn-utils";
import { getCurrentShareInfo } from "./share";

export type DesktopShortcutPlatform = "ios" | "android-like";

export interface DesktopShortcutConfig {
  /** 快捷方式稳定 ID，由业务提供。 */
  id: string;
  /** 桌面显示名称；不传时优先读取当前页面 title。 */
  name?: string;
  /** 快捷方式图标 URL。 */
  iconUrl?: string;
  /** iOS 旧接口使用的 Safari 中转页；不传时自动使用通用中转页并拼接业务传入的最终目标页、分享图标和页面标题。 */
  iosUrl?: string;
  /** Android / Harmony 等非 iOS 平台最终打开的 H5 地址。 */
  androidTargetUrl: string;
  /** 快捷方式描述，缺省时使用 name。 */
  description?: string;
  /** 是否以全屏方式打开，由业务显式决定。 */
  isFullScreen?: boolean;
  /** 旧接口的图标 ID，缺省时复用 id。 */
  iconId?: string;
  /** 追加到非 iOS Scheme 外层的参数，如 { from: 'desktop' }。 */
  schemeParams?: Record<string, string>;
}

export interface DesktopShortcutJsApi {
  supportLauncherShortcut?: () => unknown;
  createLauncherShortcut?: (params: Record<string, unknown>) => unknown;
  addShortCut?: (params: Record<string, unknown>) => unknown;
}

export type DesktopShortcutMethod = "launcher" | "legacy" | "none";
export type DesktopShortcutStatus = "attempted" | "unsupported" | "failed";

export interface DesktopShortcutResult {
  status: DesktopShortcutStatus;
  platform: DesktopShortcutPlatform | "unknown";
  method: DesktopShortcutMethod;
  fallbackUsed: boolean;
  reason?: string;
}

export interface AddDesktopShortcutOptions {
  config: DesktopShortcutConfig;
  /** 仅供测试覆盖平台；生产环境自动判断。 */
  platform?: DesktopShortcutPlatform;
  /** 仅供测试或纯 HTML bridge 适配；默认使用 qqnews-jsapi 导出。 */
  api?: DesktopShortcutJsApi;
  /** 非 iOS 平台调用创建接口后触发；不代表系统已成功创建。 */
  onAndroidAttempt?: () => void;
  /** 兼容链回退时触发，供业务侧记录日志或埋点。 */
  onFallback?: (reason: string) => void;
}

const DEFAULT_IOS_TRANS_PAGE_URL = "https://h5.news.qq.com/sv1/desktop-shortcut/index.html";

const toPromise = <T>(value: T | Promise<T>): Promise<T> => Promise.resolve(value);

const getPlatform = (): DesktopShortcutPlatform =>
  typeof window !== "undefined" && isIOS() ? "ios" : "android-like";

const getCurrentPageUrl = (): string => {
  if (typeof window === "undefined") return "";
  return window.location?.href || "";
};

const getMetaContent = (selectors: string[]): string => {
  if (typeof document === "undefined") return "";
  for (const selector of selectors) {
    const meta = document.querySelector<HTMLMetaElement>(selector);
    const content = meta?.content?.trim();
    if (content) return content;
  }
  return "";
};

const getCurrentPageTitle = (): string => {
  if (typeof document === "undefined") return "";
  return (
    getMetaContent([
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
      'meta[name="title"]',
    ]) || document.title || ""
  ).trim();
};

const getCurrentPageShareIcon = (): string => {
  const shareIcon = getCurrentShareInfo().imgUrl?.trim();
  if (shareIcon) return shareIcon;
  return "";
};

/** 构造 iOS 添加桌面快捷方式通用中转页 URL。 */
export const buildIosDesktopShortcutUrl = (config: DesktopShortcutConfig): string => {
  const transPageUrl = config.iosUrl || DEFAULT_IOS_TRANS_PAGE_URL;
  const target = config.androidTargetUrl || getCurrentPageUrl();
  const icon = getCurrentPageShareIcon() || config.iconUrl;
  const name = getCurrentPageTitle() || config.name;

  try {
    const url = new URL(transPageUrl, typeof window === "undefined" ? undefined : window.location.href);
    if (target) url.searchParams.set("target", target);
    if (icon) url.searchParams.set("icon", icon);
    if (name) url.searchParams.set("name", name);
    return url.toString();
  } catch {
    const params = new URLSearchParams();
    if (target) params.set("target", target);
    if (icon) params.set("icon", icon);
    if (name) params.set("name", name);
    const query = params.toString();
    return query ? `${transPageUrl}${transPageUrl.includes("?") ? "&" : "?"}${query}` : transPageUrl;
  }
};

const isSuccess = (result: unknown): boolean => {
  const data = result as { errCode?: unknown; success?: unknown } | undefined;
  const errCode = data?.errCode;
  const errCodeSucceeded = errCode === undefined || errCode === 0 || errCode === "0";
  return errCodeSucceeded && data?.success !== false;
};

const supportsLauncher = (result: unknown): boolean => {
  const data = result as { support?: unknown; value?: unknown } | undefined;
  return (
    result === true ||
    data?.support === true ||
    data?.value === true ||
    data?.value === "1"
  );
};

/**
 * 创建腾讯新闻桌面快捷方式使用的 scheme。
 * iOS 使用 openurl；非 iOS 使用 article_9555。目标 URL 仅编码一次。
 */
export const buildDesktopShortcutScheme = (
  platform: DesktopShortcutPlatform,
  targetUrl: string,
  schemeParams: Record<string, string> = {},
): string => {
  const base =
    platform === "ios"
      ? `qqnews://article_9528?act=openurl&realurl=${encodeURIComponent(targetUrl)}`
      : `qqnews://article_9555?url=${encodeURIComponent(targetUrl)}`;
  const params = new URLSearchParams(schemeParams);
  const query = params.toString();
  return query ? `${base}&${query}` : base;
};

/** 从实际快捷方式 scheme 中解析目标 H5 地址，仅用于启动识别或测试。 */
export const extractDesktopShortcutTargetUrl = (
  scheme: string,
  platform: DesktopShortcutPlatform,
): string | undefined => {
  try {
    return new URL(scheme).searchParams.get(platform === "ios" ? "realurl" : "url") ?? undefined;
  } catch {
    return undefined;
  }
};

/** 判断 URL 是否带有调用方定义的启动标记。 */
export const hasLaunchMarker = (
  marker: { name: string; value: string },
  url: string = typeof window === "undefined" ? "" : window.location.href,
): boolean => {
  try {
    const baseUrl = typeof window === "undefined" ? "https://localhost" : window.location.href;
    return new URL(url, baseUrl).searchParams.get(marker.name) === marker.value;
  } catch {
    return false;
  }
};

/** 仅判断浏览器独立展示模式，不包含任何业务 URL 参数。 */
export const isStandaloneDisplayMode = (): boolean => {
  if (typeof window === "undefined") return false;
  const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
  return (
    standaloneNavigator.standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches === true
  );
};

/**
 * 在腾讯新闻 App 内请求创建桌面快捷方式。
 * 调用成功只表示已向客户端发起创建请求，Android 权限结果可能无法由 JSAPI 返回。
 */
export const addDesktopShortcut = async (
  options: AddDesktopShortcutOptions,
): Promise<DesktopShortcutResult> => {
  const { config, onAndroidAttempt, onFallback } = options;
  if (typeof window === "undefined" || !isQQNews()) {
    return {
      status: "unsupported",
      platform: "unknown",
      method: "none",
      fallbackUsed: false,
      reason: "not-in-qqnews",
    };
  }

  const platform = options.platform ?? getPlatform();
  const api: DesktopShortcutJsApi = options.api ?? {
    addShortCut,
    createLauncherShortcut,
    supportLauncherShortcut,
  };
  const scheme = buildDesktopShortcutScheme(
    "android-like",
    config.androidTargetUrl,
    config.schemeParams,
  );
  const shortcutName = getCurrentPageTitle() || config.name || "快捷方式";
  const shortcutIconUrl = getCurrentPageShareIcon() || config.iconUrl;
  const description = config.description ?? shortcutName;
  const iosShortcutUrl = buildIosDesktopShortcutUrl(config);
  const iosLegacyParams: Record<string, unknown> = {
    id: config.id,
    iconId: config.iconId ?? config.id,
    iconUrl: shortcutIconUrl,
    name: shortcutName,
    isFullScreen: config.isFullScreen ?? false,
    url: iosShortcutUrl,
  };
  const androidLegacyParams: Record<string, unknown> = {
    ...iosLegacyParams,
    scheme,
  };

  const tryLegacy = async (fallbackUsed: boolean, reason?: string): Promise<DesktopShortcutResult> => {
    if (!api.addShortCut) {
      return {
        status: "unsupported",
        platform,
        method: "none",
        fallbackUsed,
        reason: reason ?? "missing-add-shortcut-api",
      };
    }
    const params = platform === "ios" ? iosLegacyParams : androidLegacyParams;
    try {
      const result = await toPromise(api.addShortCut(params));
      return {
        status: isSuccess(result) ? "attempted" : "failed",
        platform,
        method: "legacy",
        fallbackUsed,
        reason: isSuccess(result) ? reason : "legacy-api-failed",
      };
    } catch {
      return {
        status: "failed",
        platform,
        method: "legacy",
        fallbackUsed,
        reason: "legacy-api-rejected",
      };
    }
  };

  if (platform === "ios") return tryLegacy(false);

  onAndroidAttempt?.();
  const launcherParams: Record<string, unknown> = {
    id: config.id,
    name: shortcutName,
    shortLabel: shortcutName,
    longLabel: shortcutName,
    desc: description,
    description,
    icon: shortcutIconUrl,
    iconUrl: shortcutIconUrl,
    url: iosShortcutUrl,
    safariUrl: iosShortcutUrl,
    scheme,
    intent: scheme,
    isFullScreen: config.isFullScreen ?? false,
  };
  const tryLauncher = async (fallbackReason?: string): Promise<DesktopShortcutResult> => {
    if (!api.createLauncherShortcut) {
      onFallback?.(fallbackReason ?? "missing-launcher-api");
      return tryLegacy(true, fallbackReason ?? "missing-launcher-api");
    }
    try {
      const result = await toPromise(api.createLauncherShortcut(launcherParams));
      if (isSuccess(result)) {
        return {
          status: "attempted",
          platform,
          method: "launcher",
          fallbackUsed: false,
        };
      }
      onFallback?.("launcher-api-failed");
      return tryLegacy(true, "launcher-api-failed");
    } catch {
      onFallback?.("launcher-api-rejected");
      return tryLegacy(true, "launcher-api-rejected");
    }
  };

  if (!api.supportLauncherShortcut) return tryLauncher("missing-support-api");
  try {
    const support = await toPromise(api.supportLauncherShortcut());
    if (supportsLauncher(support)) return tryLauncher();
    onFallback?.("launcher-unsupported");
    return tryLegacy(true, "launcher-unsupported");
  } catch {
    return tryLauncher("support-api-rejected");
  }
};
