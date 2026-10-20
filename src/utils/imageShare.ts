/**
 * 图片分享功能（端内）
 * 唤起大图分享菜单，支持保存图片和分享到社交平台
 */

export interface ImageShareParams {
  /** 图片链接（与 base64Image 二选一） */
  url?: string;
  /** base64图片内容（与 url 二选一） */
  base64Image?: string;
  /** 是否显示保存图片选项，1 为显示，默认 1 */
  showSavePic?: number;
  /** 分享菜单成功调起后的回调 */
  onCallback?: () => void;
}

/**
 * 唤起大图分享菜单
 * @param params 分享参数，url 和 base64Image 二选一
 */
export const showImageShareMenu = (params: ImageShareParams) => {
  const { url, base64Image, showSavePic = 1, onCallback } = params;

  window?.TencentNews?.invoke('showBigImageShareMenu', {
    url,
    base64Image,
    showSavePic,
    onCallback,
  });
};
