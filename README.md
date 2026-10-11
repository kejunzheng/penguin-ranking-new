# AI 趋势榜（Penguin Index）

AI 趋势榜是一个中英双语的 AI 数据榜单网站，统一展示模型评测、模型调用量、模型价格、开源产品、Agent Skills 与 SkillHub 热门技能。项目使用 React 19 + Vite 6 构建，可部署到 GitHub Pages，也保留了静态站点托管所需的构建产物适配。

线上地址：<https://yonge6.github.io/penguin-index/>

## 功能范围

- 模型评测榜：21 项公开 Benchmark、模型对比、筛选、排序及评测档案。
- 模型调用榜：OpenRouter 公开快照、周期切换、模型对比、CSV 与图片导出、模型调用档案。
- 模型价格榜：全球与中国模型价格、筛选、排序、币种切换、CSV 导出、模型价格档案。
- 开源产品榜与 Agent Skills 榜：基于公开 GitHub 快照的日榜、周榜和月榜。
- SkillHub 榜：近期飙升 100 项与下载量 Top 1000，支持搜索、分类和分页。
- 中英文切换、桌面端与移动端响应式布局、移动端横向表格浏览。

## 技术栈

- Node.js 22
- React 19
- Vite 6
- ECharts 6
- Phosphor Icons
- 自托管 Inter 与 IBM Plex Mono 字体

## 本地运行

```sh
npm ci --no-audit --no-fund
npm run dev -- --port 4173
```

生产构建：

```sh
npm run build
```

GitHub Pages 使用 `dist/client`。查询参数路由可在仓库子目录下直接访问和刷新。

## 验收

```sh
npm run build
node --test tests/*.test.mjs
```

通过标准：全部测试通过，且构建生成以下文件：

- `dist/client/index.html`
- `dist/server/index.js`
- `dist/.openai/hosting.json`

## 数据更新

仓库提交的是可复现的数据快照，并非实时采集服务。各页面会显示自身数据文件的更新时间。

```sh
npm run update:benchmarks
npm run update:skillhub
```

每日自动更新（定时任务入口，北京时间 09:00 / 00:00）：

```sh
npm run update:daily -- --out ../penguin-index-cdn
```

依次执行：本地依赖检查 → 全部抓取 → 数据测试（失败回滚）→ 生产构建 → 把 `dist/client` 原子发布到 `<out>/site`，并写入 `<out>/manifest.json` 与数据新鲜度报告 `<out>/freshness.md`。单个数据源失败时保留旧数据；构建失败时不替换已发布版本。

抓取分四组并行：调用量 → 国内价格 → 全球价格（组内有依赖，顺序执行）、评测、SkillHub、GitHub。评测榜的 16 个数据源同样并发抓取，GAIA 直接读取官方数据集的 parquet 文件，不再逐页翻取。整次运行约 30～40 秒，控制在定时任务平台的 60 秒超时以内。

| 脚本 | 数据 | 来源 |
|---|---|---|
| `update-models.mjs` | 模型调用榜（及原站国内价格兜底） | 原站 CDN `frontend-data.json`（多节点取最新） |
| `update-china-prices.mjs` | 国内模型价格 | 10 家厂商官方定价页（`scripts/lib/china-price-sources.mjs`）：DeepSeek、智谱、阿里云百炼、Kimi、MiniMax、百度千帆、腾讯混元 / TokenHub、火山方舟、百川、阶跃星辰；价格历史保存在 `.data-state/china-prices.json`，官网不再列出的模型自动标记 legacy，新模型自动收录。零一万物已不再收录 |
| `update-global-prices.mjs` | 全球价格 | 厂商第一方官方定价页与公开价格接口；国内复用当日官网核验数据 |
| `update-benchmarks.mjs` | 模型评测榜 | 全部 21 项实时抓取：Artificial Analysis、Epoch AI、ARC Prize、LMArena、OSWorld 2.0，以及 `scripts/lib/benchmark-sources.mjs` 中的 11 个官方源（SWE-bench、LiveBench、DeepSWE、FrontierCode、MMLU-Pro、VideoMMMU、Terminal-Bench、BFCL、GAIA、OSWorld、LongBench v2）。MathVista、AndroidWorld、RULER 已于 2026-10-11 下线：上游榜单只有旧模型或 Agent 产品，站内模型池没有任何成绩 |
| `update-skillhub.mjs` | SkillHub 榜 | SkillHub 公开 API |
| `update-github.mjs` | 开源产品榜、Agent Skills 榜 | Star 自采集，按 24h / 7d / 30d 基线计算净增长。配置 GitHub token 时用 GraphQL API 一次读取全部仓库，未配置或失败时读取 github.com 仓库页面 |

抓取历史（评测快照、GitHub Star 观测点）保存在 `.data-state/`，不入库但必须持久保存。

抓取输出只保留前台实际读取的字段：`benchmarks.json` 不输出 `score`、`runDate`，与榜单官方地址相同的 `source` 省略；`skillhub.json` 只保留 `id/name/description/category/downloads/stars/source/icon_url`，简介截断到 200 字符，输出不缩进。

更新脚本依赖相应上游公开数据。更新后必须重新运行完整测试和生产构建，再提交更新后的 `public/data` 文件。

主要数据文件：

- `public/data/benchmarks.json`：模型评测数据，当前生成于 2026-10-05。
- `public/data/models.json`：模型调用与原始价格快照，当前生成于 2026-09-07。
- `public/data/global-prices.json`：厂商官网价格快照（每百万文本 Token），包含原计价币种、计费档位、原币种历史、官网链接及每个厂商的核验状态。抓取失败保留该厂商上次官网价格和核验日期；没有官网报价时不以渠道报价替代。
- `public/data/product/*`、`public/data/skill/*`：GitHub 开源产品和 Agent Skills 快照。
- `public/data/skillhub.json`：SkillHub 榜单，当前生成于 2026-10-05。

数据来源、统计口径和免责声明均在对应榜单底部展示。任何日期应以数据文件和页面实际显示为准。

## 部署

`.github/workflows/pages.yml` 会在 `codex/international-ui` 分支更新后执行：

1. 安装锁定依赖；
2. 运行数据测试；
3. 执行生产构建；
4. 将 `dist/client` 发布到 GitHub Pages。

如迁入甲方 GitHub 组织，需在仓库 Settings → Pages 中启用 GitHub Actions，并确认工作流监听的分支名称与甲方默认分支一致。

### 腾讯新闻 H5

`node scripts/build-h5.mjs` 以 `VITE_H5=1` 构建单脚本版并生成 `../penguin-index-cdn/h5`，再用 `qqnews-page-deploy` 发布：

- `data/*.json` 内联为 `assets/penguin-data.js`（发布工具不上传 JSON），页面经 `src/asset-url.js` 的 `loadJson` 读取；
- 运行时拼接的图标路径经 `assetUrl` 取发布工具替换后的 CDN 绝对地址；
- 分享配置在 `scripts/h5-share.js`，分享图标 `public/assets/penguin-share-icon.png`（200×200）；
- 测试地址：`https://testqqnews.qq.com/qqfile/activity/pages-qwzfth/penguin-trend.html`；大同上报尚未接入，正式发布前需补齐。
- `node scripts/deploy-h5.mjs` 一键重新生成、发布测试环境并回读核验（发布工具与凭据在 `../penguin-index-cdn/.h5-deploy`，不入库）。个人空间的定时任务入口在每日数据更新成功后自动调用它；只发测试环境。
- GitHub Pages 只在 `codex/international-ui` 有推送时部署，且直接使用仓库里提交的 `public/data`，CI 不抓数据。

## 资源与第三方许可

- 模型品牌图标来源与许可：`public/assets/models/SOURCES.md`、`public/assets/models/LICENSE-lobe-icons`。
- 其他图片来源说明：`public/assets/ASSET-SOURCES.md`。
- npm 依赖及版本以 `package-lock.json` 为准。
- 仓库根目录目前未声明统一的开源许可证。项目源代码的著作权、交付范围和后续使用权应以双方合同或交付确认单为准；第三方依赖与素材继续适用各自许可证。

完整交付方式、验收清单和接管步骤见 [DELIVERY.md](./DELIVERY.md)。

评测榜 Coding 两列使用 DeepSWE v1.1（官方 pass@1）和 FrontierCode 1.1（Main 子集 new_score），按每模型最高分配置排名，保留 Agent 和推理强度；取代 LiveCodeBench、Aider Polyglot，旧成绩不参与当前覆盖率与比较。数据直接读取 Datacurve 和 Cognition 官方榜单 JSON。

### GitHub token（可选）

在仓库根目录创建 `.env.github`，写入一行 `GITHUB_TOKEN=<token>`，权限建议设为 600；也可以直接设置环境变量 `GITHUB_TOKEN`。token 只需要公开仓库的只读权限。该文件被 `.gitignore` 的 `.env*` 规则忽略，Vite 构建也不会读取它；打包交接仓库时注意不要把它一起带走。token 失效或额度耗尽时，脚本会自动改用网页抓取。
