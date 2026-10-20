/**
 * 热点追踪关注能力
 *
 * 端内（腾讯新闻 App）：基于 JSAPI 批量查询热点追踪订阅状态、订阅热点、取消订阅热点。
 * 端外：JSAPI 不可用，查询返回空结果，订阅 / 取消订阅返回 false。
 *
 * 详细文档：`references/hot-trace.md`
 */
import * as qqnewsJsapi from '@tencent/qqnews-jsapi';
import { isQQNews } from '@tencent/qn-utils';

const nativeHasSubscribedHotTrace = (qqnewsJsapi as unknown as {
  hasSubscribedHotTrace?: (params: { hotTraceIds: string[] }) => Promise<Record<string, unknown>>;
}).hasSubscribedHotTrace;

const nativeSubscribeHotTrace = (qqnewsJsapi as unknown as {
  subscribeHotTrace?: (params: { hotTraceId: string; isSub?: string }) => Promise<{ isSuccess?: number | string }>;
}).subscribeHotTrace;

const nativeIsLogin = (qqnewsJsapi as unknown as {
  isLogin?: () => Promise<unknown>;
}).isLogin;

export type HotTraceSubscribedMap = Record<string, boolean>;

export interface SetHotTraceSubscribedOptions {
  /** 热点追踪 ID */
  hotTraceId: string;
  /** true/省略：订阅；false：取消订阅 */
  isSub?: boolean;
}

/**
 * 等待腾讯新闻客户端 JSBridge 就绪。
 * 端外直接 resolve；端内用 isLogin 做轻量探测，避免冷启动时 JSAPI 尚未注入。
 */
export const waitHotTraceJsapiReady = (timeoutMs = 1500): Promise<void> => {
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
      if (typeof nativeIsLogin !== 'function') { finish(); return; }
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        probe = nativeIsLogin() as Promise<unknown>;
      } catch (e) {
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

const normalizeHotTraceIds = (hotTraceIds: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of hotTraceIds || []) {
    const value = String(id || '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
};

/**
 * 端内：批量查询热点追踪是否已订阅。
 *
 * JSAPI 入参严格使用数组：`{ hotTraceIds: ['id1', 'id2'] }`。
 * 返回值会归一化成 boolean map：`{ id1: true, id2: false }`。
 */
export const hasSubscribedHotTraceBatch = async (
  hotTraceIds: string[],
): Promise<HotTraceSubscribedMap> => {
  if (!isQQNews()) return {};
  if (typeof nativeHasSubscribedHotTrace !== 'function') {
    console.warn('[hot-trace] hasSubscribedHotTrace JSAPI is unavailable');
    return {};
  }
  const ids = normalizeHotTraceIds(hotTraceIds);
  if (!ids.length) {
    console.warn('[hot-trace] hasSubscribedHotTraceBatch: hotTraceIds is empty');
    return {};
  }

  await waitHotTraceJsapiReady();
  try {
    const res = (await nativeHasSubscribedHotTrace({ hotTraceIds: ids })) as Record<string, unknown>;
    const map: HotTraceSubscribedMap = {};
    ids.forEach((id) => {
      const value = res?.[id];
      map[id] = value === 1 || value === '1' || value === true;
    });
    return map;
  } catch (e) {
    console.warn('[hot-trace] hasSubscribedHotTraceBatch error', e);
    return {};
  }
};

/** 端内：查询单个热点追踪是否已订阅；端外或异常返回 false。 */
export const isHotTraceSubscribed = async (hotTraceId: string): Promise<boolean> => {
  const id = String(hotTraceId || '').trim();
  if (!id) return false;
  const map = await hasSubscribedHotTraceBatch([id]);
  return Boolean(map[id]);
};

/**
 * 端内：订阅 / 取消订阅热点追踪。
 *
 * JSAPI 参数语义：`isSub: '0'` 表示取消订阅；其他值或不传表示订阅。
 * 为避免歧义，本封装显式传 `'1'` / `'0'`。
 */
export const setHotTraceSubscribed = async (
  options: SetHotTraceSubscribedOptions,
): Promise<boolean> => {
  if (!isQQNews()) return false;
  if (typeof nativeSubscribeHotTrace !== 'function') {
    console.warn('[hot-trace] subscribeHotTrace JSAPI is unavailable');
    return false;
  }
  const hotTraceId = String(options?.hotTraceId || '').trim();
  if (!hotTraceId) {
    console.warn('[hot-trace] setHotTraceSubscribed: hotTraceId is empty');
    return false;
  }

  await waitHotTraceJsapiReady();
  try {
    const res = (await nativeSubscribeHotTrace({
      hotTraceId,
      isSub: options.isSub === false ? '0' : '1',
    })) as { isSuccess?: number | string };
    return res?.isSuccess === 1 || res?.isSuccess === '1';
  } catch (e) {
    console.warn('[hot-trace] setHotTraceSubscribed error', e);
    return false;
  }
};

/** 端内：订阅热点追踪。 */
export const subscribeHotTrace = (hotTraceId: string): Promise<boolean> => {
  return setHotTraceSubscribed({ hotTraceId, isSub: true });
};

/** 端内：取消订阅热点追踪。 */
export const unsubscribeHotTrace = (hotTraceId: string): Promise<boolean> => {
  return setHotTraceSubscribed({ hotTraceId, isSub: false });
};
