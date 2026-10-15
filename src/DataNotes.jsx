const urls={projects:'https://kejunzheng.github.io/penguin-ranking-preview/',usage:'https://openrouter.ai/rankings',china:'https://h5.news.qq.com/qqfile/openrouterllm/model-trends.html'};
export function dataDate(value,lang){return value?new Intl.DateTimeFormat(lang==='zh'?'zh-CN':'en-US',{year:'numeric',month:'short',day:'numeric',timeZone:'Asia/Shanghai'}).format(new Date(value)):'—'}
function SourceLink({href,children}){return <a href={href} target="_blank" rel="noreferrer">{children}</a>}
const commonGrowth='日／周／月榜分别以 24／168／720 小时前记录的 Star 数为基线，计算指定周期内的 Star 净增长。仅展示净增长为正的项目；基线数据不足时显示“积累中”。';
const commonRank='排名按 Star 净增长从高到低排列；若净增长相同，依次比较当前 Star 总数和 GitHub 仓库编号。排名不接受付费加权或人工调位。';
const notes={
 usage:{
  source:['数据来源为 OpenRouter 公开 rankings 页面，统计各模型经 OpenRouter 平台路由的 Token 总量，包含输入与输出 Token。'],
  method:['仅反映 OpenRouter 平台内的调用数据，不包含模型厂商直连 API、企业私有部署、本地部署及其他第三方平台的调用情况。','本页按数据文件提供的自然周展示：“1 周”视图展示上一个完整自然周；较长周期可能包含尚未结束的当周。首页汇总最近四个完整自然周。数据更新日期为当前数据文件的更新时间，不代表实时数据。'],
  disclaimer:['图表仅供内容创作和行业观察参考，不代表全球大模型市场的全部使用份额、收入份额或权威排名。']
 },
 prices:{
  source:['OpenRouter 价格每日读取 OpenRouter 模型接口全量目录，收录所有有价格的文本模型（不含 ~latest 别名、:free 免费版与 :batch 批量版），价格为 OpenRouter 平台的标准按量价。其中中国厂商的模型同时附上中国官网人民币价：来自下方中国官网价格数据，小米 MiMo、美团 LongCat 为人工核对官网价；官网没有对应价格时注明原因。','中国大模型价格数据每日从各厂商官方定价页抓取（DeepSeek、智谱、阿里云百炼、Kimi、MiniMax、百度千帆、腾讯混元／TokenHub、火山方舟、百川、阶跃星辰），展示厂商公开的人民币 Token 价格；官网不再列出的模型自动隐藏并保留历史价格。两类数据来源及更新时间分别展示。'],
  method:['所有输入价、输出价统一按每百万 Token 展示，并保留原计价币种、不做汇率换算：OpenRouter 价格为美元（OpenRouter 按美元计费），中国官网价为人民币。','点击表头的输入、输出价格可在升序与降序之间切换；没有价格的模型始终排在最后。实际收费以对应平台或厂商的最新说明为准。','表内仅比较输入与输出 Token 单价，不计入缓存、Batch、Fast／Priority、区域、图片、音频、搜索、工具调用等附加费用；如来源单列特定计费模式，将在模型名称中标注。星号表示存在阶梯价格，展示标准价或最低档价格；短横线表示厂商未公布或该计费项不适用。'],
  disclaimer:['OpenRouter 渠道价格、模型厂商直连价格及云平台托管价格可能不同；不同地区、套餐、并发等级、促销活动和企业协议也可能影响实际费用。本榜单不构成采购、投资或使用建议。']
 },
 product:{
  source:['数据来自 GitHub REST API。榜单从公开 GitHub 仓库中筛选可独立使用的 AI 应用、AI Agent 与 AI 开发产品，并定时记录项目 Star 总数。'],
  method:['收录项目需具备用途明确、可实际使用、持续维护等特征，并通过内容安全检查；不收录 Agent Skills、模型权重、训练与推理框架、SDK、教程、资源目录、Fork 或归档项目。',commonGrowth,commonRank],
  disclaimer:['GitHub 仅提供仓库当前 Star 总数，周期净增长由本站不同时点的公开数据快照计算得出。Star 增长反映 GitHub 社区关注度，不代表产品能力、质量、安全性、商业化表现或用户规模；本榜单不构成投资、采购或使用建议。']
 },
 skill:{
  source:['数据来自 GitHub REST API。榜单从公开 GitHub 仓库中筛选可供 AI Agent 安装、调用或复用的 Skills、能力包与工作流，并定时记录项目 Star 总数。'],
  method:['收录项目需具备明确的 Agent 使用方式或兼容说明，并提供可复用的任务指令、脚本、模板或知识资料；不收录完整 AI 产品、普通工具库、模型权重、单纯提示词合集、资源目录、教程、Fork 或归档项目。',commonGrowth,'排名按仓库的 Star 净增长从高到低排列；若净增长相同，依次比较当前 Star 总数和 GitHub 仓库编号。一个仓库可包含多个 Skill，榜单 Star 仅归属仓库，不代表仓库内单个 Skill 的独立热度。排名不接受付费加权或人工调位。'],
  disclaimer:['GitHub 仅提供仓库当前 Star 总数，周期净增长由本站不同时点的公开数据快照计算得出。Star 增长反映 GitHub 社区关注度，不代表 Skill 的兼容性、安全性、实际效果或适用于所有 Agent 平台。安装含脚本、联网、密钥或本地文件权限要求的 Skill 前，请自行审阅仓库内容与权限说明；本榜单不构成安装或使用建议。']
 }
};
const growthEn='Daily, weekly and monthly rankings measure net Star growth against totals recorded 24, 168 and 720 hours earlier. Only positive growth is shown; insufficient baselines remain pending.';
const rankEn='Rankings sort by net Star growth, then current total stars and GitHub repository ID. No paid weighting or manual placement is accepted.';
const english={
 usage:{source:['Data comes from OpenRouter’s public rankings and includes input and output tokens routed through its platform.'],method:['Coverage is limited to OpenRouter. Direct provider APIs, private enterprise deployments, local deployments and other third-party platforms are excluded.','Calendar weeks follow the dataset. “1 week” shows the previous complete calendar week; longer periods may include the unfinished current week. Home summarizes the latest four complete calendar weeks. The update date describes the current data file, not real-time data.'],disclaimer:['Charts are for content creation and industry observation only. They do not represent the global model market’s full usage share, revenue share or an authoritative ranking.']},
 prices:{source:['OpenRouter prices are read daily from the full OpenRouter models API catalog: every priced text model except ~latest aliases, :free and :batch variants, at OpenRouter standard pay-as-you-go rates. Models from Chinese providers also show the China official CNY price from the dataset below (Xiaomi MiMo and Meituan LongCat are checked manually); when no official price exists, the reason is shown.','Chinese-model prices are fetched daily from official provider pricing pages and retain published CNY token rates; models no longer listed are hidden with their price history kept. Each source has its own update date.'],method:['Input and output prices are shown per million tokens in their original billing currency without conversion: OpenRouter prices in USD, China official prices in CNY.','Click an input or output price header to toggle ascending / descending order; models without a price always sort last. Actual charges follow the latest platform or provider terms.','Only input and output token unit prices are compared. Cache, Batch, Fast/Priority, regional, image, audio, search and tool-call charges are excluded. Separately listed billing modes are labeled in model names. An asterisk indicates tiered pricing at the standard or lowest tier; a dash means unpublished or not applicable.'],disclaimer:['OpenRouter, direct-provider and hosted-cloud prices may differ. Region, plan, concurrency tier, promotions and enterprise agreements may affect actual charges. These rankings are not purchasing, investment or usage advice.']},
 product:{source:['Data comes from the GitHub REST API. Rankings select independently usable AI applications, agents and developer products from public repositories and record Star totals periodically.'],method:['Projects must have a clear purpose, practical utility, ongoing maintenance and pass content-safety checks. Agent Skills, model weights, training and inference frameworks, SDKs, tutorials, resource directories, forks and archived repositories are excluded.',growthEn,rankEn],disclaimer:['GitHub provides current Star totals; period growth is calculated from public snapshots recorded at different times. Star growth measures community attention, not product capability, quality, safety, commercial performance or user scale. These rankings are not investment, purchasing or usage advice.']},
 skill:{source:['Data comes from the GitHub REST API. Rankings select reusable Skills, capability packages and workflows that AI agents can install or invoke, and record repository Star totals periodically.'],method:['Repositories must document agent usage or compatibility and provide reusable instructions, scripts, templates or knowledge. Complete AI products, general libraries, model weights, prompt-only collections, resource directories, tutorials, forks and archived repositories are excluded.',growthEn,rankEn,'One repository may contain multiple Skills. Stars belong to the repository and do not establish the independent popularity of an individual Skill.'],disclaimer:['GitHub provides current Star totals; period growth is calculated from public snapshots recorded at different times. Star growth reflects community attention, not compatibility, safety, effectiveness or suitability for every agent platform. Review repository contents and permissions before installing Skills that require scripts, networking, keys or local-file access. These rankings are not installation or usage advice.']}
};
export function getDataNotes(kind,channel='product',lang='zh'){
 const key=kind==='projects'?channel:kind;
 return (lang==='zh'?notes:english)[key];
}
export default function DataNotes({kind,channel='product',lang,updated,globalUpdated,chinaUpdated,globalSources=[],globalCoverage,rate,compact=false}){
 const zh=lang==='zh',content=getDataNotes(kind,channel,lang);
 return <details className={'data-notes'+(compact?' compact':'')}>
  <summary>{zh?'数据来源与统计口径':'Sources & methodology'}</summary>
  <div className="data-notes-body">
   {['source','method','disclaimer'].map(section=><section className="data-note-section" key={section}><h3>{(zh?{source:'数据来源',method:'统计口径',disclaimer:'免责声明'}:{source:'Data sources',method:'Methodology',disclaimer:'Disclaimer'})[section]}</h3>{content[section].map(text=><p key={text}>{text}</p>)}</section>)}
   {kind==='prices'?<div className="data-notes-sources">
    {rate&&<p>{zh?'参考汇率：':'Reference exchange rate: '}1 USD = ¥{rate}</p>}
    <p>{zh?'数据来自':'Source: '}<SourceLink href="https://openrouter.ai/models">OpenRouter Models API</SourceLink> · {zh?'每日抓取全量目录':'full catalog fetched daily'} · {zh?'数据更新：':'Data updated: '}{dataDate(globalUpdated,lang)}</p>
    {globalCoverage&&<p>{zh?`共 ${globalCoverage.models} 个模型，其中中国厂商 ${globalCoverage.china_models} 个，已附中国官网价 ${globalCoverage.china_matched} 个。`:`${globalCoverage.models} models; ${globalCoverage.china_models} from Chinese providers, ${globalCoverage.china_matched} with China official prices.`}</p>}
    <p>{zh?'人工核对官网价：':'Manually checked official prices: '}<SourceLink href="https://mimo.mi.com/docs/price/pay-as-you-go">{zh?'小米 MiMo':'Xiaomi MiMo'}</SourceLink> · <SourceLink href="https://longcat.chat/platform/docs/zh/pricing/longcat-2.0">{zh?'美团 LongCat':'Meituan LongCat'}</SourceLink></p>
    <p>{zh?'数据来自':'Source: '}<SourceLink href={urls.china}>{zh?'厂商官方定价页（每日抓取）':'Official provider pricing pages (fetched daily)'}</SourceLink> · {zh?'数据更新：':'Data updated: '}{dataDate(chinaUpdated,lang)}</p>
   </div>:<p className="data-notes-sources">{zh?'数据来自':'Source: '}<SourceLink href={kind==='usage'?urls.usage:urls.projects}>{kind==='usage'?'OpenRouter rankings':channel==='skill'?(zh?'原站榜单数据':'Source ranking dataset'):'GitHub REST API'}</SourceLink> · {zh?'包含':'Includes: '}{kind==='usage'?(zh?'平台路由的模型 Token 用量':'model tokens routed through OpenRouter'):channel==='skill'?(zh?'AI 技能与 Agent 工具':'AI skills and agent tools'):(zh?'开源产品':'open-source products')} · {zh?'数据更新：':'Data updated: '}{dataDate(updated,lang)}</p>}
  </div>
 </details>;
}
