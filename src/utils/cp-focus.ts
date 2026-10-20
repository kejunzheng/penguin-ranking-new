/**
 * CP 关注按钮能力补全
 *
 * 端外（微信 / QQ / 浏览器）：渲染未关注态 + 点击拉起腾讯新闻 App。
 * 端内（腾讯新闻 App）：基于 jsapi 走「未登录 → 登录 → 拉关注状态 → 关注」全链路。
 * 已关注态为终态：点击不响应任何事件（**本工具不提供取关能力**）。
 *
 * 详细文档：`references/cp-focus.md`
 */
import { isFocus, multiFollow, isLogin } from '@tencent/qqnews-jsapi';
import { isQQNews, isIOS } from '@tencent/qn-utils';
import { commonLogin, getLoginStatus } from './login';
import { tryOpenApp } from './app';

// ============ jsapi bridge ready 等待 ============

/**
 * 等待腾讯新闻客户端 JSBridge 就绪
 *
 * 现象（必读）：
 * - 腾讯新闻客户端的 JSBridge 通道（iOS WKWebView messageHandler / Android WebView 注入）
 *   并不是同步 ready：`qqnews-jsapi` 把 npm 接口挂上去时，底层 native bridge 仍在异步注入。
 * - 从信息流冷启动开页时尤其明显——脚本立刻调 `isFocus` 多半 reject 或永不 resolve，
 *   导致初始化拉「真实关注状态」失败、按钮停在「未关注」。
 * - 拉端进 App 因为 scheme 解析 + 跳转耗时，bridge 一般已就绪，所以那条路径看起来是好的。
 *
 * 实现：用一次轻量 `isLogin` jsapi 探测 + 退避重试，最多等 timeoutMs。
 *   - 探测能 resolve / reject 都视为 ready（jsapi 通道已通）
 *   - 探测 throw（同步报错）/ 永不 settle 时退避 80ms 重试，超时即放行
 *
 * 端外直接 resolve（不阻塞业务）。
 */
export const waitJsapiReady = (timeoutMs = 1500): Promise<void> => {
  return new Promise((resolve) => {
    if (!isQQNews()) { resolve(); return; }
    const start = Date.now();
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };

    const retryOrFinish = () => {
      if (Date.now() - start >= timeoutMs) { finish(); return; }
      setTimeout(tick, 80);
    };

    const tick = () => {
      if (done) return;
      let probe: Promise<unknown> | null = null;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        probe = isLogin() as any;
      } catch (e) {
        // 同步抛错（jsapi 还未挂载）→ 退避重试
        retryOrFinish();
        return;
      }
      if (!probe || typeof probe.then !== 'function') {
        retryOrFinish();
        return;
      }

      let settled = false;
      const timer = setTimeout(() => {
        if (settled || done) return;
        retryOrFinish();
      }, 80);

      probe.then(
        () => {
          settled = true;
          clearTimeout(timer);
          finish();
        },
        () => {
          settled = true;
          clearTimeout(timer);
          retryOrFinish();
        },
      );
    };
    tick();
  });
};

// ============ jsapi 封装 ============

/** 端内：查询单个 CP 是否已关注；端外或异常时返回 false */
export const isCpFollowed = async (suid: string): Promise<boolean> => {
  if (!isQQNews() || !suid) return false;
  try {
    const res = (await isFocus({ focusIds: JSON.stringify([suid]) })) as Record<string, unknown>;
    if (String(res?.errCode) !== '0') return false;
    const status = String(res?.[suid]);
    return status === '1' || status === 'true';
  } catch (e) {
    console.warn('[cp-focus] isCpFollowed error', e);
    return false;
  }
};

/**
 * 端内：关注单个 CP
 *
 * iOS 必须 fire-and-forget：
 * - iOS jsapi.multiFollow **不会 resolve、也不会 reject、不回包**；
 *   `await` / `.then` 都会永久 hang 住，外层按钮文案永远切不到「已关注」。
 * - 因此 iOS 分支必须立即 `return true`，把 jsapi 调用扔进事件循环不去等它。
 *
 * 其他平台：正常 await，读取 `result.data.suc_list` 判定。
 */
export const followCp = async (suid: string): Promise<boolean> => {
  if (!isQQNews() || !suid) return false;
  if (isIOS()) {
    try {
      // 故意不 await：iOS jsapi 不回包，await 会卡死整个 followCp Promise
      void multiFollow({ subItems: JSON.stringify([{ suid }]) });
    } catch (e) {
      console.warn('[cp-focus] followCp(iOS) fire error', e);
    }
    return true;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await multiFollow({ subItems: JSON.stringify([{ suid }]) });
    if (String(res?.errCode) !== '0') return false;
    const sucList: string[] = res?.result?.data?.suc_list || [];
    return sucList.includes(suid);
  } catch (e) {
    console.warn('[cp-focus] followCp error', e);
    return false;
  }
};

/**
 * 端外：拉起腾讯新闻 App 并打开当前 H5。
 * 统一走 `app.ts` 的 `tryOpenApp`，srcFrom 与项目大同 `project_id` 共用同一个统一 projectId。
 */
export const launchAppForFocus = (opts: { srcFrom: string }): void => {
  // hrefUrl 不传 → 默认打开当前页（要求当前页域名在客户端 webview 白名单）
  tryOpenApp({ srcFrom: opts.srcFrom });
};

// ============ 按钮绑定 ============

export interface CpFocusBindOptions {
  /** 关注主体 SUID（**必填**，运行时为空将早失败：打 error 日志 + 不绑事件） */
  suid: string;
  /** 与项目大同上报 `publicParams.project_id` 共用的 srcFrom（统一 projectId）；为空仅影响端外拉端埋点 */
  srcFrom: string;
  /** 渲染回调：把当前态映射到 DOM 文案 / 图片 / class，由调用方负责更新 UI */
  render: (state: 'before' | 'after') => void;
  /** 登录提示文案，默认「登录后即可关注」 */
  loginGuideWord?: string;
}

/**
 * 端内外通用关注按钮绑定。
 *
 * 行为：
 *  - 端外：始终渲染 `before`；点击 → 拉起腾讯新闻 App
 *  - 端内未登录：渲染 `before`；点击 → 调起登录 → 登录后拉真实关注状态并刷新
 *  - 端内已登录 + 未关注：点击 → 关注；成功后切到 `after`
 *  - 端内已登录 + 已关注：终态，**点击直接 return**（不调任何 jsapi）
 *
 * 防御：
 *  - 入参 `el` / `suid` 缺失：早失败，返回 noop unbind
 *  - 异步链路重入：连点仅生效一次，避免重复弹登录 / 重复发 multiFollow
 *  - 卸载守卫：unbind 之后丢弃所有进行中的 setState，避免对已脱挂 DOM 调用 render
 *
 * 返回 unbind 函数，在组件卸载时调用以移除事件监听。
 */
export const bindCpFocusButton = (
  el: HTMLElement,
  options: CpFocusBindOptions,
): (() => void) => {
  // 入参校验：suid 缺失会让 isCpFollowed / followCp 内部静默返回 false —— 按钮能点、能弹登录，
  // 但状态永远停在 before、且无任何日志，是非常难排查的隐蔽 bug。这里早失败：打错误日志 + 返回
  // noop unbind，不绑 click 也不调 render，调用方第一次联调就能在 console 看到问题。
  if (!el) {
    console.error('[cp-focus] bindCpFocusButton: missing el, abort binding');
    return () => {};
  }
  if (!options?.suid) {
    console.error('[cp-focus] bindCpFocusButton: missing suid, abort binding');
    return () => {};
  }
  if (!options.srcFrom) {
    // srcFrom 仅影响端外拉端的统一 projectId 埋点，链路本身仍可走，warn 提醒不阻断
    console.warn('[cp-focus] bindCpFocusButton: missing srcFrom, 端外拉端 projectId 上报会丢失');
  }

  let state: 'before' | 'after' = 'before';
  // 端内异步链路（登录 → 拉关注态 → 关注）较长，连点会重复弹登录 / 重复发 multiFollow，需要重入锁
  let pending = false;
  // 卸载标志：unbind 后丢弃所有进行中的异步回调，避免对已脱挂 DOM 调用 render（setState on unmounted）
  let disposed = false;

  const setState = (next: 'before' | 'after') => {
    if (disposed) return;
    state = next;
    options.render(next);
  };

  // 端内：基于 jsapi 拉一次真实关注态并落到本地 state（init / 登录回调后两处复用）
  const syncFollowedFromServer = async () => {
    const followed = await isCpFollowed(options.suid);
    setState(followed ? 'after' : 'before');
  };

  const init = async () => {
    setState('before');
    if (!isQQNews()) return;
    // 关键：信息流冷启动时 JSBridge 还未注入完成，
    // 直接调 isFocus 大概率 reject / 永不 resolve，导致初始状态错。
    // 先做一次 ready 探测（最多 1.5s），再拉登录态 + 真实关注态。
    await waitJsapiReady();
    try {
      const logged = await getLoginStatus();
      if (!logged) return;
      await syncFollowedFromServer();
    } catch (e) {
      // 不再回写 setState：入口已渲染 before，且若 try 中途已成功切到 after，
      // 后续异常回退到 before 反而会覆盖一个正确状态。
      console.warn('[cp-focus] init error', e);
    }
  };

  const onClick = async (ev: Event) => {
    ev.preventDefault();
    ev.stopPropagation();

    // 端外：拉端（同步触发跳转，不参与重入锁，也无需 disposed 守卫）
    if (!isQQNews()) {
      launchAppForFocus({ srcFrom: options.srcFrom });
      return;
    }

    // 端内已关注：终态，不响应任何事件（不调取关 jsapi）
    if (state === 'after') return;

    // 端内异步链路防重入：未关注态下连点直接丢弃
    if (pending) return;
    pending = true;

    try {
      const logged = await getLoginStatus();
      if (!logged) {
        // 端内未登录：调起登录 → 登录后拉真实关注态（用户可能在其他端已关注）
        try {
          await commonLogin({
            pageUrl: window.location.href,
            title: options.loginGuideWord ?? '登录后即可关注',
          });
        } catch (e) {
          // 用户取消 / 登录面板异常：保持未关注态，不再继续
          console.warn('[cp-focus] commonLogin error', e);
          return;
        }
        if (!(await getLoginStatus())) return;
        await syncFollowedFromServer();
        return;
      }

      // 端内已登录 + 未关注：调用关注 jsapi
      const ok = await followCp(options.suid);
      if (ok) setState('after');
    } catch (e) {
      // 任意外部 jsapi 异常兜底：保持当前 state，避免按钮卡死或抛 unhandledrejection
      console.warn('[cp-focus] onClick error', e);
    } finally {
      pending = false;
    }
  };

  void init();
  el.addEventListener('click', onClick);
  return () => {
    disposed = true;
    el.removeEventListener('click', onClick);
  };
};
