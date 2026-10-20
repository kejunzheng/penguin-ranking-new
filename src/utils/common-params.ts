/**
 * 拉端 + 大同上报共用的项目标识 / 来源 / 活动 ID 取值工具。
 *
 * ⚠️ 核心约束：**同一个项目内 `project_id` 必须全局唯一**。无法预判用户先调用拉端还是
 * 先调用大同上报，因此 `project_id` 在首次出现时（任意一种入口）即被固化，后续任何
 * 调用都共用这个值，避免拉端 `startextras.project_id` 与大同 `publicParams.project_id`
 * 不一致导致数据无法对齐。
 *
 * 固化入口（先到先得）：
 *   1) 业务方显式调 `initProjectId('xxx_k7x2')`
 *   2) `initReport({ publicParams: { project_id: 'xxx_k7x2' } })` 自动触发
 *   3) `tryOpenApp({ srcFrom: 'xxx_k7x2' })` 自动触发（兼容旧用法 / 仅用拉端场景）
 *
 * 后续修改会被忽略并 warn，确保数据维度不被污染。
 *
 * 字段语义：
 *   - project_id：项目唯一标识（统一 projectId，业务词 + `_` + 4 位短哈希）
 *   - web_scenes：业务来源场景，URL `?from=xxx` → projectId
 *   - activity_id：活动 ID，URL `?activityId=xxx`（没有就不上报）
 */

let PROJECT_ID = '';

/**
 * 从当前 URL 安全读取指定 query 参数；非浏览器环境 / 异常时返回空串。
 */
export function getUrlParam(name: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return new URLSearchParams(window.location.search || '').get(name) || '';
  } catch {
    return '';
  }
}

/**
 * 固化统一 projectId。**整个生命周期内只生效一次**，后续重复调用：
 * - 值相同 → 静默 no-op
 * - 值不同 → 忽略并 console.warn，确保 project_id 全局唯一
 */
export function initProjectId(projectId: string): void {
  if (!projectId || typeof projectId !== 'string') return;
  if (PROJECT_ID) {
    if (PROJECT_ID !== projectId) {
      console.warn(
        `[qqnews-utils] projectId 已被固化为 "${PROJECT_ID}"，本次传入 "${projectId}" 被忽略。`
          + ` 同一个项目内拉端 srcFrom 和大同 publicParams.project_id 必须使用同一个值。`,
      );
    }
    return;
  }
  PROJECT_ID = projectId;
}

/**
 * 读取已固化的统一 projectId（未初始化时返回空串并 warn）。
 *
 * 业务方一般不需要直接调用，由 `tryOpenApp` / `initReport` 内部使用。
 */
export function getProjectId(): string {
  if (!PROJECT_ID) {
    console.warn(
      '[qqnews-utils] projectId 未初始化。请先调用 initProjectId("<projectId>")，'
        + '或在 initReport({ publicParams: { project_id } }) / tryOpenApp({ srcFrom }) 中传入。',
    );
  }
  return PROJECT_ID;
}

/**
 * 取业务场景标识 `web_scenes`：
 *   URL `?from=xxx` → 统一 projectId → 空串
 */
export function getWebScenes(): string {
  const urlFrom = getUrlParam('from');
  if (urlFrom) return urlFrom;
  // 注意：这里不走 getProjectId() 是为了避免重复 warn；未固化时返回空串即可
  return PROJECT_ID;
}

/**
 * 取活动 ID：URL `?activityId=xxx`，没有则返回空串。
 */
export function getActivityId(): string {
  return getUrlParam('activityId');
}

/**
 * 仅用于测试 / 特殊场景；正常业务不要调用。
 * @internal
 */
export function __resetProjectIdForTest(): void {
  PROJECT_ID = '';
}
