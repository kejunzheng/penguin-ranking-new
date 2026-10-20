// 腾讯新闻 H5 分享配置（由 scripts/build-h5.mjs 复制到发布目录 assets/penguin-share.js）。
// 改写自 @tencent/qn-page-deploy templates/share.ts + share-utils.ts，支持腾讯新闻端内、微信、QQ 分享。
(function () {
  var SHARE = {
    title: '企鹅智库 · AI 趋势榜',
    content: '模型能力榜·模型调用榜·模型价格榜·开源产品榜',
    // 发布工具会把该图片上传到 mat1.gtimg.com 并替换为 CDN 绝对地址
    imgUrl: './assets/penguin-share-icon.png'
  };
  var ua = navigator.userAgent || '';
  var isQQNews = /qqnews/i.test(ua);
  var isWeixin = /MicroMessenger/i.test(ua);

  function absolute(url) {
    try { return new URL(url, location.href).href; } catch (e) { return url; }
  }
  function setMeta(selector, content) {
    var meta = document.querySelector(selector);
    if (meta && content) meta.content = content;
  }
  function loadjs(url, onload) {
    var script = document.createElement('script');
    script.src = url;
    script.onload = onload;
    script.onerror = onload;
    document.head.appendChild(script);
  }
  function wxShare(p) {
    function onBridgeReady() {
      var bridge = window.WeixinJSBridge;
      bridge.on('menu:share:timeline', function () {
        bridge.invoke('shareTimeline', { img_url: p.imgUrl, img_width: '160', img_height: '160', link: p.url, desc: p.content, title: p.title });
      });
      bridge.on('menu:share:appmessage', function () {
        bridge.invoke('sendAppMessage', { img_url: p.imgUrl, link: p.url, desc: p.content, title: p.title });
      });
      bridge.on('menu:share:weibo', function () {
        bridge.invoke('shareWeibo', { desc: p.content, url: p.url });
      });
    }
    if (window.WeixinJSBridge) onBridgeReady();
    else document.addEventListener('WeixinJSBridgeReady', onBridgeReady, false);
  }
  function setShare() {
    // 分享当前页面（含 ?page= 等路由参数），每次调用时读取最新地址
    var p = { title: SHARE.title, content: SHARE.content, imgUrl: absolute(SHARE.imgUrl), url: location.href };
    if (isQQNews && window.QN && window.QN.setShareInfo) {
      window.QN.setShareInfo({ title: p.title, longTitle: p.title, content: p.content, url: p.url, imgUrl: p.imgUrl });
    }
    if (isWeixin) wxShare(p);
    setMeta('meta[property="og:title"]', p.title);
    setMeta('meta[property="og:description"]', p.content);
    setMeta('meta[property="og:image"]', p.imgUrl);
    setMeta('meta[property="og:url"]', p.url);
    var doShareInfo = function () {
      if (window.setShareInfo) window.setShareInfo({ title: p.title, summary: p.content, pic: p.imgUrl, url: p.url });
    };
    if (window.setShareInfo) doShareInfo();
    else loadjs('https://qzonestyle.gtimg.cn/qzone/qzact/common/share/share.js', doShareInfo);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setShare);
  else setShare();
})();
