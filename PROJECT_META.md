# AI 趋势榜

- 项目名称：AI 趋势榜
- 源码仓库：https://github.com/kejunzheng/penguin-ranking-new
- 发布页面：penguin-trend
- 页面目录：vibe-workspace/projects/mmzheng/penguin-trend/
- 本次发布分支：starcode/remove-header-share
- 功能代码提交：134be6b
- 基线提交：2f509c1
- 测试目标：https://testqqnews.qq.com/qqfile/activity/pages-qwzfth/penguin-trend.html
- GitHub Pages：https://kejunzheng.github.io/penguin-ranking-new/
- 变更范围：只取消页头分享按钮及引导入口；保留卡片分享图与全局分享配置。
- 覆盖确认：用户于本轮明确回复“覆盖”。
- 发布包：基于当前 gh-pages 静态包，仅删除页头组件渲染；未重新构建。
- 检查：标题、分享配置、大同静态接入、第三方资源、外部字体与内网链接检查通过。
- 状态：2026-10-21 已覆盖腾讯测试页并更新 GitHub Pages（gh-pages 7c9ed49）；已 HTTP 回读两处入口及主脚本确认页头分享入口移除；浏览器交互、真机与真实上报请求未验证。

- 打包备注：腾讯发布工具新版将本地 CSS 链接误判为第三方资源；测试发布包将原 CSS 原样内联，复检全部通过；GitHub Pages 保持原 CSS 文件引用。
