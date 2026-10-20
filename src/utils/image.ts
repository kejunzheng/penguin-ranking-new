/**
 * 图片相关功能
 * 图片预加载
 */

// ============ 图片预加载 ============

/**
 * 图片预加载
 * @param images 图片地址数组
 * @param onProgress 进度回调，参数为 0~1 的进度值
 */
export const imageLoader = (
  images: string[],
  onProgress?: (progress: number) => void
): Promise<void> => {
  return new Promise((resolve) => {
    if (!images.length) {
      onProgress?.(1);
      resolve();
      return;
    }

    let loaded = 0;
    const total = images.length;

    const checkComplete = () => {
      loaded++;
      onProgress?.(loaded / total);
      if (loaded >= total) {
        resolve();
      }
    };

    images.forEach((src) => {
      const img = new Image();
      img.onload = checkComplete;
      img.onerror = checkComplete;
      img.src = src;
    });
  });
};
