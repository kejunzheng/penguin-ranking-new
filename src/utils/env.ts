/**
 * UA / 环境判断，与 qqnews-open-app-standalone.html 内联实现一致。
 */

export function ua(lower?: "l"): string {
  const s =
    (typeof window !== "undefined" && window.navigator?.userAgent) || "";
  return lower === "l" ? s.toLowerCase() : s;
}

export function isWorkWeixin(): boolean {
  return /wxwork/gi.test(ua());
}

/** 个人微信（排除企业微信 wxwork） */
export function isWeixin(): boolean {
  return /MicroMessenger/i.test(ua("l")) && !isWorkWeixin();
}

/** 微信类宿主：个人微信 + 企业微信。两者都可能注入 WeixinJSBridge，但 UA 判定不同。 */
export function isWeixinLike(): boolean {
  return isWeixin() || isWorkWeixin();
}
