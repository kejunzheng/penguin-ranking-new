/**
 * 腾讯新闻 App 内激励广告，基于 fans-club 使用的通用广告流程抽取。
 * 接入前必须由用户提供 adId（客户端 entranceId）和 channel，不沿用福利社配置。
 * 默认回调仅打印日志，不执行奖励发放或业务任务上报。
 */
import { loadRewardedAd, showRewardedAd } from '@tencent/qqnews-jsapi';

export interface RewardedAdOptions {
  /** 广告入口 ID，透传给客户端 entranceId */
  adId: string;
  /** 广告渠道 */
  channel: string;
  onReward?: () => void | Promise<void>;
  onError?: (errMsg: string) => void;
}

interface RewardedAdCallbackResult {
  callback: string;
}

let activeCancel: (() => void) | undefined;

export function useRewardedAd() {
  let cancelCurrent: (() => void) | undefined;

  /** 本次播放及奖励处理结束或取消后完成；组件销毁时调用 cancelRewardedAd。 */
  const playRewardedAd = async (options: RewardedAdOptions): Promise<void> => {
    const {
      adId,
      channel,
      onReward = () => console.log('[rewarded-ad][onReward]'),
      onError = (message: string) => console.log('[rewarded-ad][onError]', message),
    } = options;
    const notifyError = (message: string) => onError(message);

    if (!adId || !channel) {
      notifyError('广告配置异常');
      return;
    }
    if (activeCancel) {
      notifyError('广告处理中，请稍后重试');
      return;
    }

    let finished = false;
    let rewarded = false;
    let stopWaiting: () => void = () => undefined;
    let resolveDone: () => void = () => undefined;
    const done = new Promise<void>(resolve => {
      resolveDone = resolve;
    });
    const clearCallback = () => {
      Object.assign(window, { rewardedAdCallback: () => undefined });
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      stopWaiting();
      if (activeCancel === finish) {
        clearCallback();
        activeCancel = undefined;
      }
      if (cancelCurrent === finish) cancelCurrent = undefined;
      resolveDone();
    };
    const fail = (message: string) => {
      if (finished) return;
      finish();
      notifyError(message);
    };
    activeCancel = finish;
    cancelCurrent = finish;

    const handleReward = async () => {
      if (finished) return;
      stopWaiting();
      try {
        await onReward();
      } catch {
        if (!finished) notifyError('奖励处理失败，请稍后重试');
      } finally {
        finish();
      }
    };
    const waitForVisible = () => {
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') void handleReward();
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      stopWaiting = () => document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (document.visibilityState === 'visible') void handleReward();
    };

    try {
      const loadRes = await loadRewardedAd({
        // @ts-expect-error SDK 声明为 number，客户端协议支持字符串 entranceId
        entranceId: adId,
        channel,
      });
      if (finished) return;
      console.log('[rewarded-ad][loadRewardedAd]', { entranceId: adId, channel, response: loadRes });
      const { errCode, data } = loadRes || {};
      if (String(errCode) !== '0' || !data?.maxUnlockTime) {
        console.error('[rewarded-ad][load-failed]', { errCode, maxUnlockTime: data?.maxUnlockTime });
        fail('广告加载失败，请稍后重试');
        return;
      }

      const handleCallback = (res: RewardedAdCallbackResult) => {
        if (finished) return;
        console.log('[rewarded-ad][rewardedAdCallback]', res);
        clearCallback();
        if (res?.callback === 'onGetReward' && !rewarded) {
          rewarded = true;
          waitForVisible();
        } else if (res?.callback === 'onViewClosed' && !rewarded) {
          finish();
        }
      };
      Object.assign(window, { rewardedAdCallback: handleCallback });
      void showRewardedAd({ maxUnlockTime: data.maxUnlockTime / 1000 })
        .then(res => {
          console.log('[rewarded-ad][showRewardedAd]', res);
          if (res?.errCode !== undefined && String(res.errCode) !== '0' && !rewarded) {
            fail('广告展示失败，请稍后重试');
          }
        })
        .catch(() => {
          if (!rewarded) fail('广告展示失败，请稍后重试');
        });
      await done;
    } catch (error) {
      console.error('[rewarded-ad][load-or-show-error]', error);
      fail('广告加载或展示失败，请稍后重试');
    }
  };

  return {
    playRewardedAd,
    cancelRewardedAd: () => cancelCurrent?.(),
  };
}
