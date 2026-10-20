/**
 * 登录功能
 * 支持腾讯新闻App登录、微信授权登录
 */
import axios from 'axios';
import { isQQNews, delCookie } from '@tencent/qn-utils';
import { isWeixin } from './env';
import { isLogin, login, logout, getUserInfo } from '@tencent/qqnews-jsapi';
import { tryOpenApp } from './app';

// ============ 类型定义 ============

interface LoginParams {
  pageUrl: string;
  title?: string;
  loginSuccessOpenUrl?: string;
  loginSuccess?: () => void;
}

enum SignInType {
  qq = '11',
  wx = '1',
}

const NewsCookie: Record<SignInType, { token: string; appId: string; openId: string }> = {
  [SignInType.qq]: {
    token: 'open_access_token',
    appId: 'open_appid',
    openId: 'open_openid',
  },
  [SignInType.wx]: {
    token: 'wap_wx_access_token',
    appId: 'wap_wx_appid',
    openId: 'wap_wx_openid',
  },
};

const NEWS_TOKEN = 'news_token';
const LOGIN_TYPE = 'logintype';
const LOGIN_TYPE_BACKUP = 'backup_logintype';
const REFRESH_TOKEN = 'wap_refresh_token';
const NEWS_TOKEN_BACKUP = 'backup_news_token';

const cookieDomain = window.location.hostname;
const cookieDomain1 = 'view.inews.qq.com';
const qqDomain = 'qq.com';

// ============ Cookie 操作 ============

const getCookie = (name: string): string => {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : '';
};

const clearCookie = (name: string) => {
  delCookie(name, cookieDomain, '/');
  delCookie(name, qqDomain, '/');
  delCookie(name, cookieDomain1, '/');
};

// ============ 获取登录状态 ============

export const getLoginStatus = async (): Promise<boolean> => {
  if (isQQNews()) {
    const { hasLogin = false } = await isLogin();
    return hasLogin;
  }

  const loginType = getCookie(LOGIN_TYPE) as SignInType;
  const newsToken = getCookie(NEWS_TOKEN);

  if (loginType !== SignInType.qq && loginType !== SignInType.wx) {
    return Boolean(newsToken);
  }

  const accessToken = getCookie(NewsCookie[loginType].token);
  const appId = getCookie(NewsCookie[loginType].appId);
  const openId = getCookie(NewsCookie[loginType].openId);
  return Boolean(accessToken && appId && openId);
};

// ============ 通用登录 ============

export const commonLogin = async (params: LoginParams = { pageUrl: '' }) => {
  const { title = '', pageUrl = '', loginSuccessOpenUrl = '', loginSuccess } = params;

  // 非微信/App环境，复用完整拉端链路
  if (!isQQNews() && !isWeixin()) {
    tryOpenApp({ hrefUrl: pageUrl || window.location.href });
    return;
  }

  // 腾讯新闻App内登录
  if (isQQNews()) {
    // 先检查是否已登录
    const { hasLogin = false } = await isLogin();
    if (hasLogin) {
      loginSuccess?.();
      return { login: true, agent: 'app' };
    }
    // 未登录则调起登录
    const loginRes = await login({
      type: 'all',
      headerInfo: {
        title,
        iconUrl: '',
        desc: '',
        headerBg: '',
      },
      guideWord: title,
    });
    if (!loginRes.isLogin) {
      return { login: false, agent: 'app' };
    }
    loginSuccess?.();
    return { login: true, agent: 'app' };
  }

  // 微信内登录
  const currentUrl = encodeURIComponent(loginSuccessOpenUrl || window.location.href);
  const result = await axios.get(
    `https://view.inews.qq.com/api/v1/get_oauth_login_url?scene=3&sourceUrl=${currentUrl}`,
    { withCredentials: true }
  );
  window.location.replace(result?.data?.data?.wx_login_url);
};

// ============ 退出登录 ============

export const clearAllCookies = async () => {
  if (isQQNews()) {
    await logout();
  } else {
    // QQ退出登录
    clearCookie(NewsCookie[SignInType.qq].token);
    clearCookie(NewsCookie[SignInType.qq].appId);
    clearCookie(NewsCookie[SignInType.qq].openId);

    // 微信退出登录
    clearCookie(NewsCookie[SignInType.wx].token);
    clearCookie(NewsCookie[SignInType.wx].appId);
    clearCookie(NewsCookie[SignInType.wx].openId);

    // 新闻登录态
    clearCookie(REFRESH_TOKEN);
    clearCookie(NEWS_TOKEN);
    clearCookie(LOGIN_TYPE);
    clearCookie(NEWS_TOKEN_BACKUP);
    clearCookie(LOGIN_TYPE_BACKUP);
  }
  window.location.reload();
};

// ============ 获取登录用户信息 ============

export interface UserProfile {
  /** 用户头像 URL */
  avatar: string;
  /** 用户昵称 */
  nickname: string;
  /** 登录账号类型：'qq' | 'weixin' | 'phone' | 'huawei' | ''（未登录） */
  accountType: string;
}

/**
 * 获取当前登录用户的昵称和头像
 * 仅在腾讯新闻 App 内有效，端外返回空值
 *
 * @returns UserProfile { avatar, nickname, accountType }
 *
 * 判断逻辑：
 * - 通过 getUserInfo jsapi 获取 account 字段判断登录类型
 * - 根据 account 取 info[account].icon 和 info[account].name
 * - 未登录时 account 为空，返回空字符串
 */
export const getUserNickAndAvatar = async (): Promise<UserProfile> => {
  if (!isQQNews()) {
    return { avatar: '', nickname: '', accountType: '' };
  }

  const info: any = await getUserInfo();
  const { account = '' } = info;

  if (!account) {
    return { avatar: '', nickname: '', accountType: '' };
  }

  return {
    avatar: info[account]?.icon || '',
    nickname: info[account]?.name || '',
    accountType: account,
  };
};
