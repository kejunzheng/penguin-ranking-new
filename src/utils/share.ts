/**
 * 分享功能
 * 支持微信分享、腾讯新闻App分享、QQ分享
 */
import { isQQNews } from '@tencent/qn-utils';
import { isWeixin } from './env';
import { setShareInfo } from '@tencent/qqnews-jsapi';

declare global {
  interface Window {
    WeixinJSBridge: any;
    setShareInfo?: (params: any) => void;
  }
}

export interface ShareParams {
  title?: string;
  longTitle?: string;
  content?: string;
  url?: string;
  imgUrl?: string;
  callback?: () => void;
}

let currentShareInfo: ShareParams = {};

/** 获取最近一次通过 setShare 设置的分享信息。 */
export const getCurrentShareInfo = (): ShareParams => ({ ...currentShareInfo });

// ============ 微信分享 ============

export const wxShare = (params: ShareParams) => {
  const onBridgeReady = () => {
    // 分享到朋友圈
    window.WeixinJSBridge.on('menu:share:timeline', () => {
      window.WeixinJSBridge.invoke('shareTimeline', {
        img_url: params.imgUrl,
        img_width: '160',
        img_height: '160',
        link: params.url,
        desc: params.content,
        title: params.title,
      });
    });
    // 分享到消息
    window.WeixinJSBridge.on('menu:share:appmessage', () => {
      window.WeixinJSBridge.invoke('sendAppMessage', {
        img_url: params.imgUrl,
        link: params.url,
        desc: params.content,
        title: params.title,
      });
    });
  };

  if (window.WeixinJSBridge) {
    onBridgeReady();
  } else {
    document.addEventListener('WeixinJSBridgeReady', onBridgeReady, false);
  }
};

// ============ 设置 Meta 标签（QQ分享）============

const setMetaAttr = (selector: string, content: string | undefined) => {
  const meta = document.querySelector<HTMLMetaElement>(selector);
  if (meta && content) {
    meta.content = content;
  }
};

export const setMetaContent = (params: ShareParams) => {
  setMetaAttr('meta[property="og:image"]', params.imgUrl);
  setMetaAttr('meta[property="og:title"]', params.title);
  setMetaAttr('meta[property="og:description"]', params.content);
  setMetaAttr('meta[property="og:url"]', params.url);
};

// ============ 加载外部 JS ============

const loadjs = (url: string, callback: () => void) => {
  const script = document.createElement('script');
  script.src = url;
  script.onload = callback;
  document.head.appendChild(script);
};

// ============ 通用设置分享 ============

export const setShare = (defaultShare: ShareParams, params?: ShareParams) => {
  const shareParam = { ...defaultShare, ...params };
  currentShareInfo = { ...shareParam };

  // 腾讯新闻App分享
  if (isQQNews()) {
    setShareInfo({
      title: shareParam.title || '',
      longTitle: shareParam.longTitle,
      content: shareParam.content || '',
      url: shareParam.url || '',
      imgUrl: shareParam.imgUrl,
    });
  }

  // 微信分享
  if (isWeixin()) {
    wxShare(shareParam);
  }

  // QQ分享（通过 meta 标签）
  setMetaContent(shareParam);

  // QQ分享（通过 setShareInfo）
  const doShareInfo = () => {
    window.setShareInfo?.({
      title: shareParam.title,
      summary: shareParam.content,
      pic: shareParam.imgUrl,
      url: shareParam.url,
    });
  };

  if (window.setShareInfo) {
    doShareInfo();
  } else {
    loadjs('https://qzonestyle.gtimg.cn/qzone/qzact/common/share/share.js', doShareInfo);
  }
};

