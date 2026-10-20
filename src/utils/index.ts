/**
 * 腾讯新闻 JSAPI 能力汇总
 *
 * ⚠️ npm 项目接入前：本 Skill 未包含 @tencent/qqnews-jsapi 的 tarball，
 * 也未记录可验证的 registry。须先由 JSAPI 维护方提供适用制品、版本和安装入口。
 * 已取得制品后，以真实绝对路径安装；未取得时使用纯 HTML/CDN 方案：
 *
 * JSAPI_TARBALL="/absolute/path/to/qqnews-jsapi-1.3.9-beta7.tgz"
 * pnpm add @tencent/qn-utils "$JSAPI_TARBALL" @tencent/gh-qqnews-downapp axios
 */

// 登录
export {
  getLoginStatus,
  commonLogin,
  clearAllCookies,
  getUserNickAndAvatar,
} from './login';
export type { UserProfile } from './login';

// 项目唯一标识 / 来源 / 活动 ID 共享工具（拉端 + 大同上报共用，详见 references/fields.md）
export {
  initProjectId,
  getProjectId,
  getWebScenes,
  getActivityId,
  getUrlParam,
} from './common-params';

// 请求
export { commonRequest } from './request';

// 分享
export { setShare, wxShare, setMetaContent, getCurrentShareInfo } from './share';

// 图片分享（端内）
export { showImageShareMenu } from './imageShare';
export type { ImageShareParams } from './imageShare';

// App功能（拉端见 references/app.md「严格拉端」）
export {
  tryOpenApp,
  getOpenAppUrl,
  getSchemeUrl,
  openNativeSchemeWithSrc,
  closeCurrentPage,
  savePhotoWithApp,
  setRightActionBtn,
  setGestureQuit,
  getNativeBarStyle,
  buildNativeBarUrl,
  DEFAULT_NATIVE_BAR_CONFIG,
  ActionBtnType,
  NativeBarStyleBit,
} from './app';
export type {
  TryOpenAppParams,
  NativeBarConfig,
} from './app';

// 桌面快捷方式（端内，见 references/desktop-shortcut.md）
export {
  addDesktopShortcut,
  buildIosDesktopShortcutUrl,
  buildDesktopShortcutScheme,
  extractDesktopShortcutTargetUrl,
  hasLaunchMarker,
  isStandaloneDisplayMode,
} from './desktop-shortcut';
export type {
  DesktopShortcutPlatform,
  DesktopShortcutConfig,
  DesktopShortcutJsApi,
  DesktopShortcutMethod,
  DesktopShortcutStatus,
  DesktopShortcutResult,
  AddDesktopShortcutOptions,
} from './desktop-shortcut';

// 图片
export { imageLoader } from './image';

// CP 关注按钮（见 references/cp-focus.md）
export {
  waitJsapiReady,
  isCpFollowed,
  followCp,
  launchAppForFocus,
  bindCpFocusButton,
} from './cp-focus';
export type { CpFocusBindOptions } from './cp-focus';

// 热点追踪关注（见 references/hot-trace.md）
export {
  waitHotTraceJsapiReady,
  hasSubscribedHotTraceBatch,
  isHotTraceSubscribed,
  setHotTraceSubscribed,
  subscribeHotTrace,
  unsubscribeHotTrace,
} from './hot-trace';
export type {
  HotTraceSubscribedMap,
  SetHotTraceSubscribedOptions,
} from './hot-trace';

export { useRewardedAd } from './rewarded-ad';
export type { RewardedAdOptions } from './rewarded-ad';

// 大同埋点上报（见 references/report.md）
export {
  initReport,
  ensureReportQimei36,
  reportEvent,
  setReportPublicParams,
  setReportPageParams,
  setReportAccountInfo,
  getReporter,
  buildPgid,
  buildBtnId,
  encodeDtParams,
  getBtnEid,
  DT_EID,
  DEFAULT_APPKEY,
} from './report';
export type {
  AccountInfo as ReportAccountInfo,
  PublicParams as ReportPublicParams,
  PageParams as ReportPageParams,
  ReportInitOptions,
  ReportEventPayload,
} from './report';
