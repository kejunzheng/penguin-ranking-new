import profilesZh from './benchmark-profiles-zh.json';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {CheckIcon,MagnifyingGlassIcon,XIcon} from '@phosphor-icons/react';
import PriceFrontier from './PriceFrontier';
import ModelProfileDialog from './ModelProfileDialog';
import {findMatchingPriceModel,findMatchingUsageModel} from './model-profile';
import ModelCompareBar,{COMPARE_LIMIT} from './ModelCompareBar';
import {benchmarkCutoff,filterBenchmarkModels,resolveBenchmarkModel,toggleBenchmarkSort,compareBenchmarkRanks,bestRankRecord,compareComposite,withCompositeColumn,COMPOSITE_COLUMN_ID} from './benchmark-data';

const groupMeta={
 '综合':{en:'Overall',color:'#e8f1ff'},Coding:{en:'Coding',color:'#e9f7f3'},'知识':{en:'Knowledge',color:'#fff5db'},'推理':{en:'Reasoning',color:'#f1edff'},'视觉理解':{en:'Vision',color:'#e8f6ff'},'Agent能力':{en:'Agent',color:'#ffede8'},'电脑应用':{en:'Computer use',color:'#edf3f5'},'长上下文':{en:'Long context',color:'#f7efe4'}
};
const evidence={
graphwalks:["OpenAI 发布的长上下文推理基准，检验模型能否在大量连接关系中准确追踪节点之间的联系。", "用文字列出有向图的连接关系，让模型找出指定深度能够到达的节点，或直接指向某个节点的上游节点。本页采用 BFS、256K、F1 的固定口径。", "不定期，按官方数据版本及公开评测结果更新。", "公开来源与评测配置", "BFS · 256K · F1；当前采用 Claude Opus 4.8 系统卡表 8.9.A 的 4 项公开成绩，按得分降序生成名次，不代表全行业排名。"],
chartography:["Surge AI 发布的专业图表理解基准，由实际使用图表的专业人士出题，并经多位专家复核，补充常见图表测试对专业场景覆盖不足的问题。", "让模型阅读医疗、金融、工程等领域的专业图表，识别关键细节、读出数据，并结合领域规则进行计算或推理。", "随官方题集版本和评测结果发布更新。", "公开来源与评测配置", "采用 Surge AI 官网 Chartography 主榜成绩，按得分降序生成名次，同分并列；不混用旧版 Pareto 图或有工具版本的成绩。"],
agents_last_exam:["由 UC Berkeley RDI 等团队推动、行业专家参与构建的 Agent 评测，检验 AI 助手能否完成可核验的专业工作。", "给 Agent 明确的任务要求、输入文件和软件环境，让它自主安排步骤、使用工具并完成工作产物，再由程序对照隐藏参考结果评分。本页采用 Overall 主榜的完全成功率。", "题集约半年轮换，成绩随评测提交更新。", "公开来源与评测配置", "采用 Overall 主榜的原始名次与 Pass Rate（完全成功率），保留每个模型＋框架的官网默认最佳推理配置；不混用含部分得分的 Score 或其他任务分组。其他推理强度不沿用最佳配置的名次。"],

 mathvista:["结合图像与文本解答数学问题。", "补充图文数学推理评测。", "结果提交时更新", "MathVista 官方 testmini 榜单", "ALL、方法与结果提交日期"],
 lmarena_text_overall:['真实用户匿名双模型对战，衡量开放对话的总体偏好。','机器分数不能取代用户体验，它提供模型是否好用的人类视角。','高频动态','官方众包盲测','Elo、票数与置信区间'],
 aa_intelligence_index:['独立第三方汇总多项标准化评测的综合指数。','避免单一厂商或题库决定结论，观察能力广度与均衡性。','持续维护','独立第三方评测','指数版本、子项权重与模型模式'],
 livebench_overall:['以持续更新的新题评测多项通用能力。','动态题目机制降低训练污染，验证前沿模型的真实泛化。','版本制','官方题集 release','release 版本、任务集与 metric'],
 swe_bench_verified:['真实 GitHub issue、代码库与测试验证。','工程修复而非玩具题，是代码 Agent 最具现实意义的硬指标。','结果新增时更新','官方任务集与公开结果','agent harness、patch policy 与 run date'],
 deepswe:['原创长周期软件工程任务。','观察代码 Agent 的真实工程能力。','结果新增时更新','Datacurve 官方 v1.1 榜单','pass@1、mini-swe-agent、推理强度与最高分配置'],
 frontiercode:['评估代码修改是否达到维护者合入标准。','结合正确性、测试、风格与修改范围。','结果新增时更新','Cognition 官方 1.1 榜单','Main 子集、new_score、Agent 与最高分配置'],
 code_arena_webdev:['真人盲测网页与前端开发任务的 Elo 排名。','用真实开发者的偏好投票补充代码正确性测试，偏网页与前端，不等同于代码修复评测。','高频动态','LMArena 官方 Code Arena（WebDev）总榜','Elo、票数与置信区间'],
 mmlu_pro:['跨学科、多选项的专业知识与推理。','在传统 MMLU 趋于饱和后提高难度并保留广覆盖。','结果新增时更新','官方题集与公开结果','CoT、tools、few-shot 与 run date'],
 gpqa_diamond:['研究生级物理、化学、生物专业问答。','补足广泛知识，考察硬科学深度和专业门槛。','结果新增时更新','官方题集与公开结果','Diamond 子集、closed-book 与 tools'],
 simpleqa_verified:['短答案事实准确性与幻觉控制。','直接检验说得像真的但事实错误这一常见风险。','低频汇总','验证结果聚合','版本、核验规则与具体指标'],
 humanitys_last_exam:['覆盖多领域的专家级高难问题。','前沿模型仍能拉开差距，是高难综合推理的压力测试。','版本与结果并行','官方题集与公开结果','closed-book、tools、文本或多模态'],
 frontiermath:['专家设计、可精确判分的研究级数学题。','比竞赛数学更难，私有题集降低记忆化刷分。','版本制','Epoch benchmark 与结果提交','版本、题目层级与 private subset'],
 arc_agi_2:['从少量示例归纳新规则的抽象图形任务。','较少依赖知识库存量，直接检验陌生规则下的泛化。','提交结果更新','ARC Prize 官方结果','成本、时间预算与 harness'],
 mmmu_pro:['学术图表、示意图与多学科图文推理。','检验看懂视觉材料后能否继续推理。','结果新增时更新','官方题集与公开结果','图文输入、Python/tools 与 prompt'],
 videommmu:['理解视频中的知识、时间变化和迁移应用。','补足静态图之外的时序视觉理解。','结果新增时更新','官方题集与公开结果','视频采样、字幕/音频与 prompt'],
 terminal_bench_4:['在终端中多步调用工具完成可验证任务。','Agent 的关键是完成任务，而非生成看似合理的计划。','版本制','官方 submission JSON','agent system、trials、timeout 与成本'],
 bfcl_v4:['评估函数/API 选择、参数、多工具协作与拒调。','工具调用是智能体接入真实系统的可靠性门槛。','低频维护','Berkeley 官方 leaderboard','版本、类别、工具定义与匹配指标'],
 gaia:['多步骤推理、检索、文件与工具协作。','观察完整 Agent 系统能否完成开放式任务。','结果新增时更新','官方 public-results 数据集','Agent 系统、工具栈、prompt 与任务等级'],
 osworld:['真实操作系统与桌面软件的 GUI 操作。','衡量模型能否看屏、点击、输入并达成最终状态。','逐条提交更新','官方榜单与提交结果','版本、OS、steps 与成功指标'],
 osworld_2:['跨应用、长周期、动态环境的复杂办公任务。','从会点软件升级为完成完整工作流。','版本制','官方 benchmark 与聚合结果','strict/partial 与 step budget'],
 longbench_v2:['面向真实长文、多文档的深度理解任务。','与合成任务互补，验证复杂文档阅读能力。','结果新增时更新','官方题集与公开结果','版本、上下文长度、CoT 与任务切片'],
 aa_lcr:['独立第三方的长上下文推理评测。','提供学术榜单之外的第三方交叉验证。','持续维护','Artificial Analysis','版本、thinking level 与 no-tools 口径']
};
const englishSummary={
graphwalks:"OpenAI’s long-context graph traversal benchmark. This column uses BFS at 256K context with F1 scoring.",
chartography:"Surge AI’s expert-authored benchmark for understanding professional charts and reasoning from them.",
agents_last_exam:"A Berkeley RDI-led benchmark for completing verifiable professional workflows with computer-use agents.",

 mathvista:'Visual and textual mathematical reasoning on the official testmini leaderboard.',
 code_arena_webdev:'Crowd-voted Elo ranking for web and front-end development tasks on LMArena Code Arena (WebDev).',lmarena_text_overall:'Anonymous head-to-head user preference for open-ended conversation.',aa_intelligence_index:'A third-party composite index across standardized evaluations.',livebench_overall:'Continuously refreshed tasks for general capability.',swe_bench_verified:'Real GitHub issues resolved and verified by repository tests.',deepswe:'An advanced take on code repair: deep fixes for real project-level failures spanning complex architectures and many dependencies.',frontiercode:'Research-grade computer science problems: original, frontier-level coding tasks with few ready-made reference answers.',mmlu_pro:'Professional knowledge and reasoning across academic fields.',gpqa_diamond:'Graduate-level physics, chemistry and biology questions.',simpleqa_verified:'Short-answer factual accuracy and hallucination control.',humanitys_last_exam:'Expert-level questions across many domains.',frontiermath:'Research-level mathematics with exact grading.',arc_agi_2:'Abstract rule induction from a few examples.',mmmu_pro:'Multidisciplinary reasoning over images and diagrams.',videommmu:'Knowledge and temporal reasoning in video.',terminal_bench_4:'Verifiable multi-step work in a terminal.',bfcl_v4:'Function selection, parameters and multi-tool reliability.',gaia:'General agent tasks combining search, files and tools.',osworld:'GUI work in real operating systems and desktop apps.',osworld_2:'Long, cross-app workflows in dynamic environments.',longbench_v2:'Deep understanding of long documents and multi-document inputs.',aa_lcr:'Independent third-party long-context reasoning evaluation.'
};
const benchmarkTags={
[COMPOSITE_COLUMN_ID]:{zh:['综合表现指数','6 领域等权','只用名次'],en:['Composite index','6 domains','Ranks only']},
graphwalks:{"zh": ["长上下文", "图数据推理", "多跳关系"], "en": ["Long context", "Graph reasoning", "Multi-hop"]},
chartography:{"zh": ["多模态理解", "专业图表", "领域推理"], "en": ["Multimodal", "Professional charts", "Domain reasoning"]},
agents_last_exam:{"zh": ["专业工作流", "长程任务", "工具协作"], "en": ["Professional workflows", "Long horizon", "Tool use"]},

 mathvista:{"zh": ["图文数学", "视觉推理", "testmini"], "en": ["Visual math", "Reasoning", "testmini"]},
 lmarena_text_overall:{zh:['对话偏好','人类评测','综合'],en:['Preference','Human eval','Overall']},
 aa_intelligence_index:{zh:['综合能力','第三方评测','能力广度'],en:['Overall','Third-party','Breadth']},
 livebench_overall:{zh:['通用能力','动态题集','抗污染'],en:['General','Fresh tasks','Contamination resistant']},
 swe_bench_verified:{zh:['代码修复','软件工程','Agent'],en:['Code repair','Software engineering','Agent']},
 deepswe:{zh:['软件工程','架构修复','跨仓库Agent'],en:['Software engineering','Architecture repair','Cross-repo agent']},
 frontiercode:{zh:['复杂编程','研究级','原创算法'],en:['Complex coding','Research-level','Original algorithms']},
 code_arena_webdev:{zh:['网页开发','真人盲测','Elo'],en:['Web dev','Human eval','Elo']},
 mmlu_pro:{zh:['专业知识','多学科','推理'],en:['Knowledge','Multidisciplinary','Reasoning']},
 gpqa_diamond:{zh:['科学知识','专家问答','推理'],en:['Science','Expert QA','Reasoning']},
 simpleqa_verified:{zh:['事实准确','幻觉控制','短答案'],en:['Factuality','Hallucination','Short answer']},
 humanitys_last_exam:{zh:['专家推理','多学科','高难度'],en:['Expert reasoning','Multidisciplinary','Frontier']},
 frontiermath:{zh:['高等数学','研究级','精确判分'],en:['Advanced math','Research','Exact grading']},
 arc_agi_2:{zh:['抽象推理','规则归纳','泛化'],en:['Abstraction','Rule induction','Generalization']},
 mmmu_pro:{zh:['多模态','图文推理','专业知识'],en:['Multimodal','Visual reasoning','Knowledge']},
 videommmu:{zh:['视频理解','时序推理','多模态'],en:['Video','Temporal reasoning','Multimodal']},
 terminal_bench_4:{zh:['终端任务','工具使用','Agent'],en:['Terminal','Tool use','Agent']},
 bfcl_v4:{zh:['函数调用','工具选择','Agent'],en:['Function calling','Tool choice','Agent']},
 gaia:{zh:['多步骤任务','检索工具','Agent'],en:['Multi-step','Search & tools','Agent']},
 osworld:{zh:['电脑操作','GUI Agent','任务完成'],en:['Computer use','GUI agent','Task completion']},
 osworld_2:{zh:['跨应用','长周期任务','GUI Agent'],en:['Cross-app','Long horizon','GUI agent']},
 longbench_v2:{zh:['长文理解','多文档','推理'],en:['Long documents','Multi-document','Reasoning']},
 aa_lcr:{zh:['长上下文','第三方评测','推理'],en:['Long context','Third-party','Reasoning']}
};

Object.entries(profilesZh).forEach(([id,profile])=>{
 evidence[id]=[profile.intro,profile.method,profile.cadence,...evidence[id].slice(3)];
 benchmarkTags[id].zh=profile.tags;
});

const formatDate=(value,lang)=>value?new Intl.DateTimeFormat(lang==='zh'?'zh-CN':'en-US',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'UTC'}).format(new Date(value+'T00:00:00Z')):'—';
const shiftLabel=(preset,lang)=>({zh:{latest:'最新',week:'7 天前',month:'30 天前',quarter:'3 个月前'},en:{latest:'Latest',week:'7 days ago',month:'30 days ago',quarter:'3 months ago'}}[lang][preset]);

function benchmarkConfigurations(model,benchmarkId,cutoff,start=null){
 const records=(model.records[benchmarkId]||[]).filter(record=>record.date&&record.date<=cutoff&&(!start||record.date>=start)&&Number.isFinite(record.rank));
 const latestByConfig=new Map();
 for(const record of records){
  const key=(record.config||'标准/未注明').trim().toLowerCase();
  latestByConfig.set(key,[latestByConfig.get(key)||'',record.date].sort().at(-1));
 }
 const distinct=new Map();
 for(const record of records){
  const config=(record.config||'标准/未注明').trim().toLowerCase();
  if(record.date!==latestByConfig.get(config))continue;
  const key=JSON.stringify([config,record.rank,record.source||'',record.date]);
  distinct.set(key,record);
 }
 return [...distinct.values()].sort((a,b)=>a.rank-b.rank||String(a.config).localeCompare(String(b.config)));
}

// 每格默认只显示按推理档位选出的那条成绩（与综合分取数一致），其余配置折叠
function BenchmarkResult({model,benchmark,result,zh,cutoff,start,highlight}){
 if(!result)return <span className="benchmark-na">—</span>;
 const others=benchmarkConfigurations(model,benchmark.id,cutoff,start).filter(record=>record!==result&&!(record.rank===result.rank&&record.config===result.config));
 return <span className="benchmark-result">
  <ResultLine benchmark={benchmark} result={result} zh={zh} highlight={highlight}/>
  {others.length>0&&<details className="benchmark-more-configs"><summary><span className="more-closed">{zh?`另有 ${others.length} 个配置`:`${others.length} more config${others.length>1?'s':''}`}</span><span className="more-open">{zh?'收起':'Collapse'}</span></summary><span className="benchmark-configurations">{others.map(record=><span className="benchmark-result" key={JSON.stringify([record.config,record.rank,record.source,record.date])}><ResultLine benchmark={benchmark} result={record} zh={zh} highlight={false} muted/></span>)}</span></details>}
 </span>;
}
function ResultLine({benchmark,result,zh,highlight,muted}){
 const config=!result.config||result.config==='标准/未注明'?(zh?'标准／未注明':'Standard / unspecified'):result.config;
 return <><span className={'benchmark-rank'+(muted?' muted':'')+(highlight?' rank-'+Math.min(result.rank,4):'')}>#{result.rank}</span>{Number.isFinite(result.score)&&<small className="benchmark-result-config">{benchmark.score_label||'Score'}: {result.score}%</small>}<small className="benchmark-result-config">{zh?'配置：':'Config: '}{config}</small></>;
}

const COMPOSITE=COMPOSITE_COLUMN_ID;
// 综合分单元格只放大号指数和「#名次」，其余信息（名次范围、评测项数、领域、缺测、逐项核对）点击后在详情里看；未进入排名显示「—」
function CompositeResult({row,zh,highlight,onOpen}){
 if(!row||!row.rank)return <span className="benchmark-na" title={zh?'评测不足或未达排名门槛，不显示综合分':'Not enough benchmarks to be ranked'}>—</span>;
 return <span className="benchmark-result composite-result">
  <button type="button" className="composite-score" aria-haspopup="dialog" aria-label={zh?`查看综合分详情，指数 ${row.score.toFixed(1)}`:`View composite details, index ${row.score.toFixed(1)}`} onClick={onOpen}>{row.score.toFixed(1)}</button>
  <span className={'benchmark-rank'+(highlight?' rank-'+Math.min(row.rank,4):'')}>#{row.rank}</span>
 </span>;
}

// 综合分详情：宽版弹窗。有 model 时先给该模型的明细，再给指数的定义、算法、门槛和局限。
function CompositeDialog({summary,model,names,zh,onClose}){
 const row=model?.composite;
 const domains=Object.keys(summary.params.DOMAIN_WEIGHTS);
 const name=id=>names[id]||id;
 const [low,high]=row?.rank_range||[];
 useEffect(()=>{
  const previousOverflow=document.body.style.overflow,previousFocus=document.activeElement;
  document.body.style.overflow='hidden';
  const closeOnEscape=event=>{if(event.key==='Escape')onClose()};
  window.addEventListener('keydown',closeOnEscape);
  return()=>{document.body.style.overflow=previousOverflow;window.removeEventListener('keydown',closeOnEscape);previousFocus?.focus?.()};
 },[]);
 return <div className="benchmark-mobile-profile-backdrop composite-dialog-backdrop" role="presentation" onClick={onClose}>
  <aside className="composite-dialog" role="dialog" aria-modal="true" aria-label={zh?'综合分详情':'Composite score details'} onClick={event=>event.stopPropagation()}>
   <button type="button" className="benchmark-mobile-profile-close" aria-label={zh?'关闭详情':'Close details'} onClick={onClose}><XIcon size={18}/></button>
   <p className="composite-dialog-eyebrow">{zh?'综合分 · 综合表现指数':'COMPOSITE · PERFORMANCE INDEX'}</p>
   <h3>{model?model.name:(zh?'综合表现指数怎么算':'How the composite index works')}</h3>
   {model&&row&&<section className="composite-dialog-model">
    <div className="composite-dialog-stats">
     <div><small>{zh?'指数':'Index'}</small><strong>{row.score.toFixed(1)}</strong></div>
     <div><small>{zh?'名次':'Rank'}</small><strong>{row.rank?`#${row.rank}`:'—'}</strong></div>
     <div><small>{zh?'名次范围':'Rank range'}</small><strong>{row.rank_range?(low===high?(zh?'名次稳定':'Stable'):`${low}–${high}`):'—'}</strong></div>
     <div><small>{zh?'指数范围':'Index range'}</small><strong>{row.score_range?`${row.score_range[0].toFixed(1)}–${row.score_range[1].toFixed(1)}`:'—'}</strong></div>
     <div><small>{zh?'入选评测':'Benchmarks'}</small><strong>{row.benchmarks}</strong></div>
     <div><small>{zh?'覆盖领域':'Domains'}</small><strong>{row.domains}/{domains.length}</strong></div>
    </div>
    <div className="composite-dialog-grid">
     <div><h4>{zh?'各领域指数':'Index by domain'}</h4><table><tbody>{domains.map(d=>{const missing=row.missing_domains?.includes(d);return <tr key={d}><th>{d}</th><td>{row.domain_scores?.[d]?.toFixed(1)??'—'}</td><td className="quiet">{missing?(zh?'缺测，按整体水平估计':'Not tested; estimated from overall level'):''}</td></tr>})}</tbody></table></div>
     <div><h4>{zh?'逐项核对：实际 vs 期望胜率':'Check: actual vs expected win rate'}</h4><table><thead><tr><th>{zh?'评测':'Benchmark'}</th><th>{zh?'场次':'Games'}</th><th>{zh?'实际':'Actual'}</th><th>{zh?'期望':'Expected'}</th></tr></thead><tbody>{(row.checks||[]).map(c=><tr key={c.id}><th>{name(c.id)}</th><td>{c.games}</td><td>{c.actual.toFixed(1)}%</td><td>{c.expected.toFixed(1)}%</td></tr>)}</tbody></table>
      <p className="quiet">{zh?'实际明显高于期望，说明该模型在这项评测上好于总分所反映的水平；反之则拖了后腿。总分有先验收拢，两者不会完全相等。':'Actual well above expected means the model does better on this benchmark than its total suggests; below means it drags the total. Priors pull totals toward the middle, so the two are never identical.'}</p></div>
    </div>
   </section>}
   <div className="composite-dialog-grid composite-dialog-method">
    <section><h4>{zh?'这是什么':'What it is'}</h4><p>{zh?'把本页收录的公开评测名次汇总起来，回答哪个模型的综合表现更靠前。它不是百分制，不是答题正确率，也不是用户任务成功率，不是精确的能力测量。只用名次：领先 0.1 分和领先 20 分都只算「赢」。':'Summarises the public benchmark ranks on this page to show which model performs better overall. It is not a percentage, accuracy, task success rate or a precise capability measurement. Only ranks are used: a lead of 0.1 and a lead of 20 both count as one win.'}</p></section>
    <section><h4>{zh?'怎么算':'How it is computed'}</h4><ul>
     <li>{zh?'每项评测只取最新一期；同一模型有多条配置时，按推理档位取最高的一条（Max > XHigh > High > Medium > Low > 无推理），不取名次最好的一条。':'Each benchmark uses only its latest edition. When a model has several configurations the highest reasoning tier is used (Max > XHigh > High > Medium > Low > non-reasoning), never the best-ranked one.'}</li>
     <li>{zh?'同一项评测内，把名次拆成两两胜负，用 Bradley–Terry 方法一次性拟合每个模型的整体水平和各领域偏差。':'Within a benchmark, ranks are split into pairwise wins and fitted at once with a Bradley–Terry model for each model’s overall level and domain offsets.'}</li>
     <li>{zh?`${domains.join('、')} ${domains.length} 个领域等权，并让每个领域提供的证据总量相同，评测多的领域不会压过评测少的领域。`:`${domains.length} domains (${domains.join(', ')}) are weighted equally and contribute equal evidence, so domains with many benchmarks do not outweigh those with few.`}</li>
     <li>{zh?'指数 = 50 + 15 × z，z 以参照组的均值和标准差计算。参照组是首次计算时进入排名的模型，刻度固定；指数会随新评测结果更新，但不是「永不变化」。':'Index = 50 + 15 × z, with z based on the mean and standard deviation of a reference group (the models ranked in the first calculation). The scale is fixed, but indices still update with new results.'}</li>
    </ul></section>
    <section><h4>{zh?'出分与排名门槛':'Thresholds'}</h4><ul>
     <li>{zh?'至少 2 项入选评测才出分；至少 5 项且覆盖 3 个领域才进入排名，其余显示「—」。':'A score needs at least 2 included benchmarks; a rank needs at least 5 across 3 domains, otherwise a dash is shown.'}</li>
     <li>{zh?'没测过的领域按整体水平估计，不是实测，会标出「缺测」。':'Untested domains are estimated from overall level and marked as not tested.'}</li>
     <li>{zh?`模型不足 ${summary.params.MIN_MODELS_PER_BENCHMARK} 个的评测不计入；AA Index、LiveBench 等汇总类指数不计入，避免重复计分。`:`Benchmarks with fewer than ${summary.params.MIN_MODELS_PER_BENCHMARK} models and aggregate indices such as AA Index and LiveBench are excluded to avoid double counting.`}</li>
    </ul></section>
    <section><h4>{zh?'名次范围':'Rank range'}</h4><p>{zh?`分别去掉 ${summary.benchmarks.length} 项入选评测中的任意一项后重算（共 ${summary.sensitivity_runs} 次），取最低到最高的名次。它用来看名次对评测选择是否敏感，不是置信区间；范围较宽时，相邻名次的先后不宜过度解读。`:`Recomputed ${summary.sensitivity_runs} times, dropping each of the ${summary.benchmarks.length} included benchmarks in turn; the lowest and highest ranks form the range. It shows how sensitive the rank is to benchmark choice and is not a confidence interval.`}</p></section>
   </div>
   <section className="composite-dialog-benchmarks"><h4>{zh?`本期入选的 ${summary.benchmarks.length} 项评测`:`${summary.benchmarks.length} benchmarks included this edition`}</h4><table><tbody>{domains.map(d=>{const list=summary.benchmarks.filter(b=>b.domain===d);return <tr key={d}><th>{d}</th><td>{list.length?list.map(b=>`${name(b.id)}（${b.models}）`).join('、'):(zh?'本期无入选评测':'None this edition')}</td></tr>})}</tbody></table>
    <p className="quiet">{zh?'括号内为参评模型数。电脑应用类目前没有入选评测，综合分不代表电脑操作能力。':'Numbers in brackets are participating models. No computer-use benchmark is included yet, so the score says nothing about computer operation.'}</p></section>
   <section><h4>{zh?'已知局限':'Known limits'}</h4><ul>
    <li>{zh?'只用名次，丢掉分差。':'Only ranks are used; score gaps are ignored.'}</li>
    <li>{zh?'长上下文领域只有两项评测，却占 1/6 权重。':'Long context has only two benchmarks but one sixth of the weight.'}</li>
    <li>{zh?'FrontierCode 的数据源本身按「每个模型取最高分配置」发布，我们只拿到一条。':'FrontierCode’s source already publishes each model’s best configuration; only one is available.'}</li>
    <li>{zh?'推理档位依赖配置名称识别，命名不规范的记录可能识别不到。':'Reasoning tiers are recognised from configuration names; irregular names may not be recognised.'}</li>
    <li>{zh?'先验强度、权重常数和门槛都是人为设定的参数。综合分只有最新一期，切到更早时间点显示「—」。':'Prior strength, weight constants and thresholds are set by hand. The score exists only for the latest edition; earlier time points show a dash.'}</li>
   </ul></section>
   <p className="quiet composite-dialog-foot">{zh?`口径版本 ${summary.version} · 数据日期 ${summary.date}`:`Method version ${summary.version} · data date ${summary.date}`}</p>
  </aside>
 </div>;
}

export default function BenchmarkExplorer({data:rawData,lang,profileData}){
 const [compositeDialog,setCompositeDialog]=useState(null),[profileModel,setProfileModel]=useState(null);
 // 点模型名：能对上调用量榜或价格表的模型 → 打开「调用档案 / 价格档案」；对不上但有综合分的 → 打开综合分详情；都没有则不可点。
 const modelProfile=model=>{
  const usageModels=profileData?.trends?.models||[],priceModels=[...(profileData?.globalPrices?.models||[]),...(profileData?.chinaPrices?.models||[])];
  const usageModel=findMatchingUsageModel(model,usageModels),priceModel=findMatchingPriceModel(usageModel||model,priceModels);
  return {usageModel,priceModel};
 };
 const openModel=model=>{
  const {usageModel,priceModel}=modelProfile(model);
  if(usageModel||priceModel)setProfileModel({usageModel,priceModel});
  else if(model.composite&&rawData.composite)setCompositeDialog({model});
 };
 const modelClickable=model=>{const {usageModel,priceModel}=modelProfile(model);return Boolean(usageModel||priceModel||(model.composite&&rawData.composite))};
 const modelName=model=>modelClickable(model)?<button type="button" className="benchmark-model-link" onClick={()=>openModel(model)} aria-label={(zh?'查看模型档案：':'View model profile: ')+model.name}>{model.name}</button>:model.name;
 const data=useMemo(()=>withCompositeColumn(rawData),[rawData]),composite=data.compositeColumn;
 const benchmarkCount=data.benchmarks.length;
 const zh=lang==='zh',latest=data.generated_at.slice(0,10),benchmarkIds=data.benchmarks.map(b=>b.id);
 // 最早一条有效记录的日期：历史快照从 2026-10 起才开始积累，早于它的时间点没有数据，对应快捷按钮先停用
 const earliest=useMemo(()=>data.models.flatMap(model=>Object.values(model.records).flat().map(record=>record.date)).filter(Boolean).sort()[0]||latest,[data.models,latest]);
 const presetReady=item=>item==='latest'||benchmarkCutoff(latest,item)>=earliest;
 const historyPending=['week','month','quarter'].some(item=>!presetReady(item));
 const defaultCustomStart=[benchmarkCutoff(latest,'month'),earliest].sort().at(-1);
 const [type,setType]=useState('all'),[region,setRegion]=useState('all'),[coverage,setCoverage]=useState('all'),[preset,setPreset]=useState('latest');
 const [customRange,setCustomRange]=useState({start:defaultCustomStart,end:latest}),[customDraft,setCustomDraft]=useState({start:defaultCustomStart,end:latest}),[customOpen,setCustomOpen]=useState(false);
 const [view,setView]=useState('ranking'),[selected,setSelected]=useState([]),[sortState,setSortCriteria]=useState(null),[mobileProfile,setMobileProfile]=useState(null),[horizontalScroll,setHorizontalScroll]=useState({value:0,max:0});
 const compositeOn=Boolean(composite)&&preset==='latest';
 const defaultSort=compositeOn?[{id:COMPOSITE,direction:'asc'}]:data.benchmarks[0]?[{id:data.benchmarks[0].id,direction:'asc'}]:[];
 const userCriteria=(sortState||[]).filter(item=>item.id!==COMPOSITE||compositeOn),sortCriteria=userCriteria.length?userCriteria:defaultSort;
 const sortBy=sortCriteria[0]?.id||null;
 const sortLabel=id=>{const index=sortCriteria.findIndex(item=>item.id===id);return index<0?(zh?'排序 ↕':'Sort ↕'):`${userCriteria.length>1?(index+1)+' ':''}${sortCriteria[index].direction==='asc'?(zh?'正序 ↑':'Ascending ↑'):(zh?'倒序 ↓':'Descending ↓')}`};
 const tableWrapRef=useRef(null);
 const cutoff=benchmarkCutoff(latest,preset,customRange.end),rangeStart=preset==='custom'?customRange.start:null;
 const snapshotDates=Object.fromEntries(data.benchmarks.map(benchmark=>[benchmark.id,(benchmark.snapshot_dates||[]).filter(date=>date<=cutoff&&(!rangeStart||date>=rangeStart)).sort().at(-1)]));
 const resolved=useMemo(()=>data.models.map(model=>resolveBenchmarkModel(model,benchmarkIds,cutoff,rangeStart,snapshotDates)),[data,cutoff,rangeStart]);
 const modelPool=resolved.filter(model=>model.coverage>0);
 const sortedIds=sortCriteria.map(item=>item.id).filter(id=>id!==COMPOSITE);
 const byOwnRank=model=>sortedIds.length?{...model,results:{...model.results,...Object.fromEntries(sortedIds.map(id=>[id,bestRankRecord(model.records[id],cutoff,rangeStart)]))}}:model;
 let rows=filterBenchmarkModels(resolved,{type,region,coverage,selected}).map(byOwnRank);
 // 每个模型只占一行：各评测默认显示按推理档位选出的那条成绩（与综合分取数一致），其余配置折叠；按某列排序也不再拆行
 const compareRank=(a,b)=>compareBenchmarkRanks(a,b,sortCriteria.map(item=>item.id===COMPOSITE?{...item,id:COMPOSITE_COLUMN_ID}:item));
 if(sortBy)rows=[...rows].sort(compareRank);
 else rows=[...rows].sort((a,b)=>(b.releaseDate||'').localeCompare(a.releaseDate||'')||b.coverage-a.coverage||a.name.localeCompare(b.name));
 // 下拉列出榜单里的全部模型（与表格同序：发布日期由近到远），输入时按名称或厂商筛选
 // 对比候选：当前时间快照下有成绩的全部模型（与表格同序）
 const compareOptions=modelPool.map(model=>({id:model.id,name:model.name,meta:`${model.organization||''} · ${model.coverage}/${benchmarkCount}`}));
 const shownBenchmarks=data.benchmarks;
 const shownModelCount=new Set(rows.map(row=>row.id.split('::')[0])).size;
 const sortedBenchmark=data.benchmarks.find(benchmark=>benchmark.id===sortBy);
 const rankAudit=sortedBenchmark?.rank_audit,excludedTop10=rankAudit&&rankAudit.snapshot_date===snapshotDates[sortBy]?rankAudit.excluded_top10||[]:[];
 const comparing=view==='compare'&&selected.length>0;
 const compareModels=selected.map(id=>resolved.find(model=>model.id===id)).filter(Boolean).map(byOwnRank).sort((a,b)=>sortBy?compareRank(a,b):0);
 const [userSorted,setUserSorted]=useState(false);
 const toggleSort=id=>{setUserSorted(true);setSortCriteria(toggleBenchmarkSort(userCriteria,id));};
 const benchmarkDate=id=>{const benchmark=data.benchmarks.find(b=>b.id===id);return benchmark?.source_snapshot_date===snapshotDates[id]&&benchmark?.source_data_date?benchmark.source_data_date:resolved.map(model=>model.results[id]?.date).filter(Boolean).sort().at(-1)||data.benchmarks.find(b=>b.id===id)?.latest_date;};
 useEffect(()=>{
  const tableWrap=tableWrapRef.current;
  if(!tableWrap)return;
  const updateScrollState=()=>setHorizontalScroll({value:tableWrap.scrollLeft,max:Math.max(0,tableWrap.scrollWidth-tableWrap.clientWidth)});
  const observer=new ResizeObserver(updateScrollState);
  const table=tableWrap.querySelector('table');
  observer.observe(tableWrap);if(table)observer.observe(table);
  tableWrap.addEventListener('scroll',updateScrollState,{passive:true});updateScrollState();
  return()=>{observer.disconnect();tableWrap.removeEventListener('scroll',updateScrollState)};
 },[shownBenchmarks.length,selected.length,view]);
 useEffect(()=>{
  if(!mobileProfile)return;
  const previousFocus=document.activeElement;
  const closeButton=document.querySelector('.benchmark-mobile-profile-close');closeButton?.focus();
  const previousOverflow=document.body.style.overflow;
  const closeOnEscape=event=>{if(event.key==='Escape')setMobileProfile(null);if(event.key==='Tab'){event.preventDefault();closeButton?.focus()}};
  document.body.style.overflow='hidden';
  window.addEventListener('keydown',closeOnEscape);
  return()=>{document.body.style.overflow=previousOverflow;window.removeEventListener('keydown',closeOnEscape);previousFocus?.focus()};
 },[mobileProfile]);
 function openNotes(){const notes=document.querySelector('.benchmark-notes');if(!notes)return;notes.open=true;notes.querySelector('.composite-note')?.scrollIntoView({behavior:'smooth',block:'start'})}
 function toggleModel(id){setSelected(current=>current.includes(id)?current.filter(item=>item!==id):current.length<COMPARE_LIMIT?[...current,id]:current)}
 return <section className="benchmark-explorer">
  <div className="usage-controls benchmark-controls">
   <div className="segmented mode-toggle" aria-label={zh?'展示方式':'Display mode'}>{['ranking','compare','frontier'].map(item=><button key={item} aria-pressed={view===item} onClick={()=>setView(item)}>{item==='ranking'?(zh?'评测总榜':'All benchmarks'):item==='compare'?(zh?'模型对比':'Compare models'):(zh?'斩杀线':'Price frontier')}</button>)}</div>
  </div>
  {view==='frontier'?<PriceFrontier frontier={data.price_frontier} models={resolved} lang={lang}/>:<>
  {view==='compare'?<ModelCompareBar lang={lang} options={compareOptions} selectedIds={selected} onToggle={toggleModel} onClear={()=>setSelected([])} marker={id=>{const column=compareModels.findIndex(model=>model.id===id);return <span className="compare-bar-number">{String(column+1).padStart(2,'0')}</span>}} actions={selected.length>0&&<span className="compare-bar-scope">{zh?`逐项对比 ${benchmarkCount} 项评测`:`${benchmarkCount} benchmarks side by side`}</span>}/>:<div className="benchmark-toolbar benchmark-filter-bar" aria-label={zh?'榜单筛选':'Ranking filters'}>
   <div className="benchmark-filters">
    <label><span>{zh?'模型类型':'Model type'}</span><select value={type} onChange={e=>setType(e.target.value)}><option value="all">{zh?'全部':'All'}</option><option value="closed">{zh?'闭源':'Closed'}</option><option value="open">{zh?'开放权重':'Open weights'}</option></select></label>
    <label><span>{zh?'地区':'Region'}</span><select value={region} onChange={e=>setRegion(e.target.value)}><option value="all">{zh?'全球':'Global'}</option><option value="china">{zh?'中国模型':'China'}</option><option value="overseas">{zh?'海外模型':'Outside China'}</option></select></label>
    <label><span>{zh?'覆盖度':'Coverage'}</span><select value={coverage} onChange={e=>setCoverage(e.target.value)}><option value="all">{zh?'全部上榜':'All ranked'}</option><option value="high">{zh?'高覆盖（12+）':'High coverage (12+)'}</option><option value="focused">{zh?'单项／专项':'Focused'}</option></select></label>

   </div>
  </div>}
  {view==='compare'&&!selected.length?<div className="empty benchmark-compare-empty"><p>{zh?'搜索并添加模型对比':'Search and add models to compare'}</p></div>:<>
  {sortedBenchmark?.rank_note&&<p className="benchmark-rank-note">{sortedBenchmark.display_name}：{zh?sortedBenchmark.rank_note:sortedBenchmark.rank_note_en}</p>}
  {excludedTop10.length>0&&<p className="benchmark-rank-note">{zh?'本模型池未收录的来源前十条目：':'Source top-ten entries outside this model pool: '}{excludedTop10.map(entry=>`#${entry.rank} ${entry.name} (${entry.config||'标准/未注明'})`).join('；')}{zh?'。这些来源名次保留空档，可点击该评测「详情」查看来源范围。':'. These source ranks remain gaps. See the benchmark details for source coverage.'}</p>}
  <div className={'benchmark-scroll-frame'+(horizontalScroll.value>2?' can-left':'')+(horizontalScroll.value<horizontalScroll.max-2?' can-right':'')}>
  <button type="button" className="benchmark-scroll-arrow left" aria-label={zh?'向左查看':'Scroll left'} onClick={()=>tableWrapRef.current?.scrollBy({left:-Math.max(240,tableWrapRef.current.clientWidth*.6),behavior:'smooth'})}>‹</button>
  <button type="button" className="benchmark-scroll-arrow right" aria-label={zh?'向右查看更多评测':'Scroll right for more benchmarks'} onClick={()=>tableWrapRef.current?.scrollBy({left:Math.max(240,tableWrapRef.current.clientWidth*.6),behavior:'smooth'})}>›</button>
  <div className={'benchmark-table-wrap '+(comparing?'comparison-mode':'')} ref={tableWrapRef}>{comparing?<table className="benchmark-table benchmark-compare-table"><thead><tr><th className="benchmark-model-col">{zh?'BENCHMARK':'BENCHMARK'}</th>{compareModels.map((model,column)=><th key={model.id} className="benchmark-compare-model"><div className="benchmark-model"><span className="compare-bar-number">{String(column+1).padStart(2,'0')}</span><i className={model.region}/><div><strong>{model.name}</strong><small>{model.organization} · {model.openWeights?(zh?'开放权重':'Open weights'):(zh?'闭源':'Closed')}</small></div></div></th>)}</tr></thead><tbody>{compositeOn&&<tr className="composite-row"><th className="benchmark-row-head composite-column"><div className="benchmark-heading-content"><strong>{zh?'AI趋势榜·综合分':'AI Trend · Composite'}</strong><span className="benchmark-tags">{(benchmarkTags[COMPOSITE]?.[lang]||[]).map(tag=><i key={tag}>{tag}</i>)}</span><small>{formatDate(composite.date,lang)}</small><div className="benchmark-heading-actions"><button type="button" className="benchmark-sort-action" aria-haspopup="dialog" aria-label={zh?'查看详情：综合分':'View details: composite'} onClick={()=>setCompositeDialog({model:null})}>{zh?'详情':'Details'}</button></div></div></th>{compareModels.map(model=><td key={model.id} className="composite-cell"><CompositeResult row={model.composite} zh={zh} highlight={false} onOpen={()=>setCompositeDialog({model})}/></td>)}</tr>}{shownBenchmarks.map(benchmark=>{const tags=benchmarkTags[benchmark.id]?.[lang]||[zh?benchmark.category:groupMeta[benchmark.category].en];return <tr key={benchmark.id}><th className="benchmark-row-head" style={{'--group-color':groupMeta[benchmark.category].color}}><div className="benchmark-heading-content"><strong>{benchmark.display_name}</strong><span className="benchmark-tags">{tags.map(tag=><i key={tag}>{tag}</i>)}</span><small>{formatDate(benchmarkDate(benchmark.id),lang)}</small><div className="benchmark-heading-actions"><button type="button" className="benchmark-sort-action" aria-haspopup="dialog" aria-label={(zh?'查看详情：':'View details: ')+benchmark.display_name} onClick={()=>{setMobileProfile(benchmark)}}>{zh?'详情':'Details'}</button><button type="button" className="benchmark-sort-action" aria-pressed={userSorted&&sortCriteria.some(item=>item.id===benchmark.id)} onClick={()=>toggleSort(benchmark.id)}>{sortLabel(benchmark.id)}</button></div></div></th>{compareModels.map(model=>{const result=model.results[benchmark.id];return <td key={model.id} style={{'--group-color':groupMeta[benchmark.category].color}}><BenchmarkResult model={model} benchmark={benchmark} result={result} zh={zh} cutoff={cutoff} start={rangeStart} highlight={userSorted}/></td>})}</tr>})}</tbody></table>:<table className="benchmark-table"><thead><tr><th className="benchmark-model-col">{zh?'模型产品 / SKU':'Model product / SKU'}</th>{compositeOn&&<th className="benchmark-column composite-column"><div className="benchmark-heading-content"><strong>{zh?'AI趋势榜·综合分':'AI Trend · Composite'}</strong><span className="benchmark-tags">{(benchmarkTags[COMPOSITE]?.[lang]||[]).map(tag=><i key={tag}>{tag}</i>)}</span><small>{formatDate(composite.date,lang)}</small><div className="benchmark-heading-actions"><button type="button" className="benchmark-sort-action" aria-haspopup="dialog" aria-label={zh?'查看详情：综合分':'View details: composite'} onClick={()=>setCompositeDialog({model:null})}>{zh?'详情':'Details'}</button><button type="button" className="benchmark-sort-action" aria-pressed={userSorted&&sortBy===COMPOSITE} onClick={()=>toggleSort(COMPOSITE)}>{sortLabel(COMPOSITE)}</button></div></div></th>}{shownBenchmarks.map(benchmark=>{const tags=benchmarkTags[benchmark.id]?.[lang]||[zh?benchmark.category:groupMeta[benchmark.category].en];return <th key={benchmark.id} className="benchmark-column" style={{'--group-color':groupMeta[benchmark.category].color}}><div className="benchmark-heading-content"><strong>{benchmark.display_name}</strong><span className="benchmark-tags">{tags.map(tag=><i key={tag}>{tag}</i>)}</span><small>{formatDate(benchmarkDate(benchmark.id),lang)}</small><div className="benchmark-heading-actions"><button type="button" className="benchmark-sort-action" aria-haspopup="dialog" aria-label={(zh?'查看详情：':'View details: ')+benchmark.display_name} onClick={()=>{setMobileProfile(benchmark)}}>{zh?'详情':'Details'}</button><button type="button" className="benchmark-sort-action" aria-pressed={userSorted&&sortCriteria.some(item=>item.id===benchmark.id)} onClick={()=>toggleSort(benchmark.id)}>{sortLabel(benchmark.id)}</button></div></div></th>})}</tr></thead><tbody>{rows.map(model=><tr key={model.id}><td><div className="benchmark-model"><i className={model.region}/><div><strong>{modelName(model)}</strong><small>{model.organization} · {model.openWeights?(zh?'开放权重':'Open weights'):(zh?'闭源':'Closed')} · {zh?'入榜':'Coverage'} {model.coverage}/{benchmarkCount}</small></div></div></td>{compositeOn&&<td className="composite-cell"><CompositeResult row={model.composite} zh={zh} highlight={userSorted&&sortBy===COMPOSITE} onOpen={()=>setCompositeDialog({model})}/></td>}{shownBenchmarks.map(benchmark=>{const result=model.results[benchmark.id];return <td key={benchmark.id} style={{'--group-color':groupMeta[benchmark.category].color}}><BenchmarkResult model={model} benchmark={benchmark} result={result} zh={zh} cutoff={cutoff} start={rangeStart} highlight={userSorted}/></td>})}</tr>)}</tbody></table>}{!rows.length&&<div className="benchmark-empty-state">{zh?'当前筛选条件下暂无模型。':'No models match these filters.'}</div>}</div></div>
  {horizontalScroll.max>0&&horizontalScroll.value<24&&<p className="benchmark-scroll-tip" role="note"><span aria-hidden="true">←</span>{zh?'表格可左右滑动，查看更多评测':'Swipe or use the arrows to see more benchmarks'}<span aria-hidden="true">→</span></p>}
  {mobileProfile&&(()=>{const benchmark=mobileProfile,detail=evidence[benchmark.id]||[],tags=benchmarkTags[benchmark.id]?.[lang]||[];return <div className="benchmark-mobile-profile-backdrop" role="presentation" onClick={()=>setMobileProfile(null)}><aside className="benchmark-mobile-profile" role="dialog" aria-modal="true" aria-label={zh?`${benchmark.canonical_name} benchmark 档案`:`${benchmark.canonical_name} benchmark profile`} onClick={event=>event.stopPropagation()}><button type="button" className="benchmark-mobile-profile-close" aria-label={zh?'关闭档案':'Close profile'} onClick={()=>setMobileProfile(null)}><XIcon size={18}/></button><p>{zh?'BENCHMARK 档案':'BENCHMARK PROFILE'}</p><h3>{benchmark.canonical_name}</h3><div className="benchmark-tooltip-tags">{tags.map(tag=><span key={tag}>{tag}</span>)}</div><p className="benchmark-tooltip-intro">{zh?detail[0]:englishSummary[benchmark.id]}</p><dl><dt>{zh?'覆盖模型':'Models covered'}</dt><dd>{zh?`本页收录 ${benchmark.model_count} 个模型`:`${benchmark.model_count} models on this page`}{benchmark.rank_audit?.source_entry_count>benchmark.model_count?(zh?`（官方榜单共 ${benchmark.rank_audit.source_entry_count} 条结果）`:` (${benchmark.rank_audit.source_entry_count} entries on the official leaderboard)`):''}</dd><dt>{zh?'评测方式':'Why selected'}</dt><dd>{zh?detail[1]:'Adds a distinct, publicly verifiable view of model capability.'}</dd><dt>{zh?'更新频次':'Update cadence'}</dt><dd>{zh?detail[2]:benchmark.update_mode.replaceAll('_',' ')}</dd>{!zh&&<><dt>Reading note</dt><dd>Check version, configuration and protocol before comparison.</dd></>}{benchmark.rank_note&&<><dt>{zh?'本页口径':'Scope of this column'}</dt><dd>{zh?benchmark.rank_note:benchmark.rank_note_en}</dd></>}</dl></aside></div>})()}
  {profileModel&&(()=>{const {usageModel,priceModel}=profileModel,priceMeta=priceModel?.price_scope==='global'?profileData.globalPrices:profileData.chinaPrices;return <ModelProfileDialog usageModel={usageModel} priceModel={priceModel} initialTab={usageModel?'usage':'price'} trends={profileData.trends} lang={lang} currency={profileData.currency} onCurrency={profileData.onCurrency} priceMeta={priceMeta} onClose={()=>setProfileModel(null)}/>})()}
  {compositeDialog&&rawData.composite&&<CompositeDialog summary={rawData.composite} model={compositeDialog.model} names={Object.fromEntries(rawData.benchmarks.map(b=>[b.id,b.display_name]))} zh={zh} onClose={()=>setCompositeDialog(null)}/>}
  <div className="benchmark-bottom-scroll"><input type="range" min="0" max={Math.max(1,horizontalScroll.max)} value={Math.min(horizontalScroll.value,horizontalScroll.max)} disabled={!horizontalScroll.max} aria-label={zh?'表格横向滚动':'Horizontal table scroll'} onChange={event=>{const value=Number(event.target.value);if(tableWrapRef.current)tableWrapRef.current.scrollLeft=value;setHorizontalScroll(state=>({...state,value}))}}/></div>
  <p className="benchmark-source-line">{zh?'数据来源：':'Source: '}<span>{zh?'各Benchmark官方公开数据集':'Official public datasets of each benchmark'}</span> · {zh?'数据更新：':'Data updated: '}{formatDate(latest,lang)} · {zh?`共 ${benchmarkCount} 项 benchmark、${shownModelCount} 个模型，每项取最近一次有效成绩`:`${benchmarkCount} benchmarks, ${shownModelCount} models; latest valid result per benchmark`}</p>
  </>}
  </>}
  <details className="data-notes benchmark-notes"><summary>{zh?'数据来源与统计口径':'Sources & methodology'}</summary><div className="data-notes-body">
   <section className="data-note-section"><h3>{zh?'数据来源':'Data sources'}</h3><p>{zh?<>本榜选取{benchmarkCount}项公开 Benchmark，汇集评测维护方的公开榜单、发布文件，以及Artificial Analysis、Epoch等第三方评测与结果聚合数据，具体出处见成绩链接。遴选兼顾<strong>来源可追溯、任务互补和实际应用价值</strong>，以用户偏好、标准化测试、动态题集及真实任务等不同评价方式，观察模型在编程、知识、推理、多模态理解、工具使用与长上下文等任务中的表现，减少对单一题库或指标的依赖。{benchmarkCount}项评测并非完整能力清单，也不保证相互独立或同等权威；列入页面不代表当前模型池已有可展示成绩。</>:<>This ranking selects {benchmarkCount} public benchmarks, combining maintainers’ public leaderboards and release files with third-party evaluations and aggregated results from Artificial Analysis, Epoch and others. Specific sources are linked from each result. Selection considers <strong>traceable sources, complementary tasks and practical value</strong>. User preferences, standardized tests, dynamic question sets and real tasks offer different views of coding, knowledge, reasoning, multimodal understanding, tool use and long-context performance, reducing reliance on a single test set or metric. These {benchmarkCount} evaluations are not a complete capability inventory, nor are they necessarily independent or equally authoritative. Listing a benchmark does not mean the current model pool has results to display.</>}</p></section>
   <section className="data-note-section"><h3>{zh?'统计口径':'Methodology'}</h3><p>{zh?`逐项展示${benchmarkCount}项评测结果，第一列另给「综合分」（综合表现指数，计算方式见下节）。更新时间以实际发布为准，各来源并非同步更新。模型池收录已取得至少1项可核实公开成绩、发布日期距快照不超过18个月的产品；旗舰、mini／nano等独立产品分别展示，推理强度与工具配置作为评测记录保留。默认按综合分名次排列，未进入排名的模型排在后面；“高覆盖”为至少12项，“单项／专项”实际对应1—11项，覆盖度不代表能力高低。点击列头「排序」按该项已收录名次重新排序，再点同一列切换升序、降序，无成绩始终排在有成绩之后；同一模型在同一项评测中常因推理强度、工具等配置不同而多次上榜，每格默认只显示按推理档位选出的一条（综合分也用这一条），其余配置收在「另有 N 个配置」中，可展开查看；按某一列排序时不再把模型拆成多行，因同一模型的其他配置同样占用名次，表中名次可能出现空档；各列配置可能不同，不代表跨榜测试条件一致。模型池、筛选及来源本身可能造成名次空档，不人为补号；GAIA 为已收录模型内排名，无法对应基础模型的独立 Agent 产品、人类基线和未归一模型不混入模型池。表头日期通常为所选记录的最近日期，无结果时回退至该评测登记日期，不等于实际测试日期。`:`Results from all ${benchmarkCount} evaluations are shown individually; the first column adds a Composite score (a composite performance index, see below). Update dates follow actual publications; sources do not update simultaneously. The model pool includes products with at least one verifiable public result and released within 18 months of the snapshot. Independent flagship, mini and nano products appear separately; reasoning intensity and tool configurations are retained in evaluation records. By default, models are ordered by composite rank; unranked models follow. High coverage means at least 12 evaluations; Single / specialist actually means 1–11. Coverage does not measure capability. Click a column’s Sort button to sort by its included ranks; click again to toggle ascending and descending. Missing results always follow measured results. A model often appears several times in one benchmark with different reasoning or tool configurations; each cell shows by default only the entry picked by reasoning tier (the one the composite uses), with the rest under “N more configs”. Sorting by a column never splits a model into several rows, so ranks may have gaps because the other configurations of a model also occupy ranks. Configurations may differ across columns. Model coverage, filters and source rankings may leave gaps; ranks are not invented. GAIA ranks included models; standalone agents without a matched model, human baselines and unresolved models are not added to the model pool. Header dates usually show the latest selected record date, falling back to the benchmark’s registered date when no results exist. They are not necessarily actual test dates.`}</p></section>
   {compositeOn&&<section className="data-note-section composite-note"><h3>{zh?'综合分（综合表现指数）':'Composite score (performance index)'}</h3><p>{zh?<>综合分只用各评测的名次汇总，不是百分制，也不反映分差；每项评测按推理档位取成绩，6 个领域等权。出分、排名门槛、名次范围、本期入选评测、逐项核对和已知局限见列头或单元格的<button type="button" className="composite-note-link" onClick={()=>setCompositeDialog({model:null})}>详情</button>。</>:<>The composite score summarises benchmark ranks only; it is not a percentage and ignores score gaps. Each benchmark uses the reasoning tier picked by rule, and six domains are weighted equally. Thresholds, rank range, included benchmarks, per-benchmark checks and limits are in the <button type="button" className="composite-note-link" onClick={()=>setCompositeDialog({model:null})}>details</button> of the column header or cell.</>}</p></section>}
   <section className="data-note-section"><h3>{zh?'免责声明':'Disclaimer'}</h3><p>{zh?'“—”表示所选条件下暂无已收录的有效成绩，不代表模型能力不足；空列及低覆盖列不能支撑普遍结论。不同来源的证据强度不同，成绩比较须核对评测版本、任务范围、指标及运行配置。Agent与电脑应用成绩反映模型与工具系统的共同表现，还受权限、步数、超时和预算影响。“配置未注明”不等于条件相同，展示名次不代表已完成可比性验证，名次差异也不必然具有统计显著性。本榜仅供行业观察，不构成采购或投资建议；公开结果可能更新、修订或撤回。':'A dash means no included valid result is available under the selected conditions, not that a model lacks capability. Empty or low-coverage columns cannot support general conclusions. Evidence strength varies by source; comparisons require checking evaluation versions, task scope, metrics and runtime configurations. Agent and computer-use results reflect the combined model and tool system, including permissions, step limits, timeouts and budgets. An unspecified configuration does not mean identical conditions. Displayed ranks have not necessarily been validated for comparability, and rank differences are not necessarily statistically significant. This ranking is for industry observation, not procurement or investment advice. Public results may be updated, revised or withdrawn.'}</p></section>
  </div></details>

  <div className="benchmark-prototype-footer"><span>{zh?'企鹅智库｜榜单 · Model Capability Ranking Prototype':'Penguin Intelligence | Rankings · Model Capability Ranking Prototype'}</span><span>{zh?'数据来源：各 benchmark 官方公开 leaderboard / release CSV / 可核验第三方公开快照':'Sources: official benchmark leaderboards / release CSVs / verifiable public third-party snapshots'}</span></div>
 </section>;
}
