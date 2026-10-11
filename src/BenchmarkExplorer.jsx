import profilesZh from './benchmark-profiles-zh.json';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {CheckIcon,MagnifyingGlassIcon,XIcon} from '@phosphor-icons/react';
import {benchmarkCutoff,filterBenchmarkModels,resolveBenchmarkModel} from './benchmark-data';

const groupMeta={
 '综合':{en:'Overall',color:'#e8f1ff'},Coding:{en:'Coding',color:'#e9f7f3'},'知识':{en:'Knowledge',color:'#fff5db'},'推理':{en:'Reasoning',color:'#f1edff'},'视觉理解':{en:'Vision',color:'#e8f6ff'},'Agent能力':{en:'Agent',color:'#ffede8'},'电脑应用':{en:'Computer use',color:'#edf3f5'},'长上下文':{en:'Long context',color:'#f7efe4'}
};
const evidence={
 lmarena_text_overall:['真实用户匿名双模型对战，衡量开放对话的总体偏好。','机器分数不能取代用户体验，它提供模型是否好用的人类视角。','高频动态','官方众包盲测','Elo、票数与置信区间'],
 aa_intelligence_index:['独立第三方汇总多项标准化评测的综合指数。','避免单一厂商或题库决定结论，观察能力广度与均衡性。','持续维护','独立第三方评测','指数版本、子项权重与模型模式'],
 livebench_overall:['以持续更新的新题评测多项通用能力。','动态题目机制降低训练污染，验证前沿模型的真实泛化。','版本制','官方题集 release','release 版本、任务集与 metric'],
 swe_bench_verified:['真实 GitHub issue、代码库与测试验证。','工程修复而非玩具题，是代码 Agent 最具现实意义的硬指标。','结果新增时更新','官方任务集与公开结果','agent harness、patch policy 与 run date'],
 deepswe:['原创长周期软件工程任务。','观察代码 Agent 的真实工程能力。','结果新增时更新','Datacurve 官方 v1.1 榜单','pass@1、mini-swe-agent、推理强度与最高分配置'],
 frontiercode:['评估代码修改是否达到维护者合入标准。','结合正确性、测试、风格与修改范围。','结果新增时更新','Cognition 官方 1.1 榜单','Main 子集、new_score、Agent 与最高分配置'],
 mmlu_pro:['跨学科、多选项的专业知识与推理。','在传统 MMLU 趋于饱和后提高难度并保留广覆盖。','结果新增时更新','官方题集与公开结果','CoT、tools、few-shot 与 run date'],
 gpqa_diamond:['研究生级物理、化学、生物专业问答。','补足广泛知识，考察硬科学深度和专业门槛。','结果新增时更新','官方题集与公开结果','Diamond 子集、closed-book 与 tools'],
 simpleqa_verified:['短答案事实准确性与幻觉控制。','直接检验说得像真的但事实错误这一常见风险。','低频汇总','验证结果聚合','版本、核验规则与具体指标'],
 humanitys_last_exam:['覆盖多领域的专家级高难问题。','前沿模型仍能拉开差距，是高难综合推理的压力测试。','版本与结果并行','官方题集与公开结果','closed-book、tools、文本或多模态'],
 frontiermath:['专家设计、可精确判分的研究级数学题。','比竞赛数学更难，私有题集降低记忆化刷分。','版本制','Epoch benchmark 与结果提交','版本、题目层级与 private subset'],
 arc_agi_2:['从少量示例归纳新规则的抽象图形任务。','较少依赖知识库存量，直接检验陌生规则下的泛化。','提交结果更新','ARC Prize 官方结果','成本、时间预算与 harness'],
 mmmu_pro:['学术图表、示意图与多学科图文推理。','检验看懂视觉材料后能否继续推理。','结果新增时更新','官方题集与公开结果','图文输入、Python/tools 与 prompt'],
 mathvista:['几何、图表、科学图像中的数学推理。','区分视觉识别与对结构、数量和逻辑的理解。','低频汇总','官方题集与公开结果','testmini/test、CoT 与 OCR/tool'],
 videommmu:['理解视频中的知识、时间变化和迁移应用。','补足静态图之外的时序视觉理解。','结果新增时更新','官方题集与公开结果','视频采样、字幕/音频与 prompt'],
 terminal_bench_4:['在终端中多步调用工具完成可验证任务。','Agent 的关键是完成任务，而非生成看似合理的计划。','版本制','官方 submission JSON','agent system、trials、timeout 与成本'],
 bfcl_v4:['评估函数/API 选择、参数、多工具协作与拒调。','工具调用是智能体接入真实系统的可靠性门槛。','低频维护','Berkeley 官方 leaderboard','版本、类别、工具定义与匹配指标'],
 gaia:['多步骤推理、检索、文件与工具协作。','观察完整 Agent 系统能否完成开放式任务。','结果新增时更新','官方 public-results 数据集','Agent 系统、工具栈、prompt 与任务等级'],
 osworld:['真实操作系统与桌面软件的 GUI 操作。','衡量模型能否看屏、点击、输入并达成最终状态。','逐条提交更新','官方榜单与提交结果','版本、OS、steps 与成功指标'],
 osworld_2:['跨应用、长周期、动态环境的复杂办公任务。','从会点软件升级为完成完整工作流。','版本制','官方 benchmark 与聚合结果','strict/partial 与 step budget'],
 androidworld:['在安卓模拟器和移动应用中完成真实任务。','补足桌面之外的移动端 GUI 操作能力。','社区提交更新','官方公开结果','屏幕表示、trials 与轨迹链接'],
 ruler:['长文本中的检索、聚合、多跳追踪与上下文衰减。','标称 context window 不等于真实可用长度。','结果新增时更新','NVIDIA 题集与论文结果','context length、tasks 与 precision'],
 longbench_v2:['面向真实长文、多文档的深度理解任务。','与合成任务互补，验证复杂文档阅读能力。','结果新增时更新','官方题集与公开结果','版本、上下文长度、CoT 与任务切片'],
 aa_lcr:['独立第三方的长上下文推理评测。','提供学术榜单之外的第三方交叉验证。','持续维护','Artificial Analysis','版本、thinking level 与 no-tools 口径']
};
const englishSummary={
 lmarena_text_overall:'Anonymous head-to-head user preference for open-ended conversation.',aa_intelligence_index:'A third-party composite index across standardized evaluations.',livebench_overall:'Continuously refreshed tasks for general capability.',swe_bench_verified:'Real GitHub issues resolved and verified by repository tests.',deepswe:'An advanced take on code repair: deep fixes for real project-level failures spanning complex architectures and many dependencies.',frontiercode:'Research-grade computer science problems: original, frontier-level coding tasks with few ready-made reference answers.',mmlu_pro:'Professional knowledge and reasoning across academic fields.',gpqa_diamond:'Graduate-level physics, chemistry and biology questions.',simpleqa_verified:'Short-answer factual accuracy and hallucination control.',humanitys_last_exam:'Expert-level questions across many domains.',frontiermath:'Research-level mathematics with exact grading.',arc_agi_2:'Abstract rule induction from a few examples.',mmmu_pro:'Multidisciplinary reasoning over images and diagrams.',mathvista:'Mathematical reasoning over charts and scientific images.',videommmu:'Knowledge and temporal reasoning in video.',terminal_bench_4:'Verifiable multi-step work in a terminal.',bfcl_v4:'Function selection, parameters and multi-tool reliability.',gaia:'General agent tasks combining search, files and tools.',osworld:'GUI work in real operating systems and desktop apps.',osworld_2:'Long, cross-app workflows in dynamic environments.',androidworld:'Real tasks in Android apps and emulators.',ruler:'Retrieval and multi-hop tracking over long contexts.',longbench_v2:'Deep understanding of long documents and multi-document inputs.',aa_lcr:'Independent third-party long-context reasoning evaluation.'
};
const benchmarkTags={
 lmarena_text_overall:{zh:['对话偏好','人类评测','综合'],en:['Preference','Human eval','Overall']},
 aa_intelligence_index:{zh:['综合能力','第三方评测','能力广度'],en:['Overall','Third-party','Breadth']},
 livebench_overall:{zh:['通用能力','动态题集','抗污染'],en:['General','Fresh tasks','Contamination resistant']},
 swe_bench_verified:{zh:['代码修复','软件工程','Agent'],en:['Code repair','Software engineering','Agent']},
 deepswe:{zh:['软件工程','架构修复','跨仓库Agent'],en:['Software engineering','Architecture repair','Cross-repo agent']},
 frontiercode:{zh:['复杂编程','研究级','原创算法'],en:['Complex coding','Research-level','Original algorithms']},
 mmlu_pro:{zh:['专业知识','多学科','推理'],en:['Knowledge','Multidisciplinary','Reasoning']},
 gpqa_diamond:{zh:['科学知识','专家问答','推理'],en:['Science','Expert QA','Reasoning']},
 simpleqa_verified:{zh:['事实准确','幻觉控制','短答案'],en:['Factuality','Hallucination','Short answer']},
 humanitys_last_exam:{zh:['专家推理','多学科','高难度'],en:['Expert reasoning','Multidisciplinary','Frontier']},
 frontiermath:{zh:['高等数学','研究级','精确判分'],en:['Advanced math','Research','Exact grading']},
 arc_agi_2:{zh:['抽象推理','规则归纳','泛化'],en:['Abstraction','Rule induction','Generalization']},
 mmmu_pro:{zh:['多模态','图文推理','专业知识'],en:['Multimodal','Visual reasoning','Knowledge']},
 mathvista:{zh:['视觉数学','图表理解','推理'],en:['Visual math','Charts','Reasoning']},
 videommmu:{zh:['视频理解','时序推理','多模态'],en:['Video','Temporal reasoning','Multimodal']},
 terminal_bench_4:{zh:['终端任务','工具使用','Agent'],en:['Terminal','Tool use','Agent']},
 bfcl_v4:{zh:['函数调用','工具选择','Agent'],en:['Function calling','Tool choice','Agent']},
 gaia:{zh:['多步骤任务','检索工具','Agent'],en:['Multi-step','Search & tools','Agent']},
 osworld:{zh:['电脑操作','GUI Agent','任务完成'],en:['Computer use','GUI agent','Task completion']},
 osworld_2:{zh:['跨应用','长周期任务','GUI Agent'],en:['Cross-app','Long horizon','GUI agent']},
 androidworld:{zh:['移动操作','Android','GUI Agent'],en:['Mobile','Android','GUI agent']},
 ruler:{zh:['长上下文','检索','多跳追踪'],en:['Long context','Retrieval','Multi-hop']},
 longbench_v2:{zh:['长文理解','多文档','推理'],en:['Long documents','Multi-document','Reasoning']},
 aa_lcr:{zh:['长上下文','第三方评测','推理'],en:['Long context','Third-party','Reasoning']}
};

Object.entries(profilesZh).forEach(([id,profile])=>{
 evidence[id]=[profile.intro,profile.method,profile.cadence,...evidence[id].slice(3)];
 benchmarkTags[id].zh=profile.tags;
});

const formatDate=(value,lang)=>value?new Intl.DateTimeFormat(lang==='zh'?'zh-CN':'en-US',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'UTC'}).format(new Date(value+'T00:00:00Z')):'—';
const shiftLabel=(preset,lang)=>({zh:{latest:'最新',week:'7 天前',month:'30 天前',quarter:'3 个月前'},en:{latest:'Latest',week:'7 days ago',month:'30 days ago',quarter:'3 months ago'}}[lang][preset]);

export default function BenchmarkExplorer({data,lang}){
 const zh=lang==='zh',latest=data.generated_at.slice(0,10),benchmarkIds=data.benchmarks.map(b=>b.id);
 const defaultCustomStart=benchmarkCutoff(latest,'month');
 const [type,setType]=useState('all'),[region,setRegion]=useState('all'),[coverage,setCoverage]=useState('all'),[preset,setPreset]=useState('latest');
 const [customRange,setCustomRange]=useState({start:defaultCustomStart,end:latest}),[customDraft,setCustomDraft]=useState({start:defaultCustomStart,end:latest}),[customOpen,setCustomOpen]=useState(false);
 const [draftSelected,setDraftSelected]=useState([]),[selected,setSelected]=useState([]),[search,setSearch]=useState(''),[pickerOpen,setPickerOpen]=useState(false),[sortBy,setSortBy]=useState(null),[sortDirection,setSortDirection]=useState('asc'),[tooltip,setTooltip]=useState(null),[mobileProfile,setMobileProfile]=useState(null),[horizontalScroll,setHorizontalScroll]=useState({value:0,max:0});
 const compareSearchRef=useRef(null),tableWrapRef=useRef(null);
 const cutoff=benchmarkCutoff(latest,preset,customRange.end),rangeStart=preset==='custom'?customRange.start:null;
 const resolved=useMemo(()=>data.models.map(model=>resolveBenchmarkModel(model,benchmarkIds,cutoff,rangeStart)),[data.models,cutoff,rangeStart]);
 const modelPool=resolved.filter(model=>model.coverage>0);
 let rows=filterBenchmarkModels(resolved,{type,region,coverage,selected});
 const compareRank=(a,b)=>{const aRank=a.results[sortBy]?.rank,bRank=b.results[sortBy]?.rank;if(aRank==null&&bRank==null)return b.coverage-a.coverage||a.name.localeCompare(b.name);if(aRank==null)return 1;if(bRank==null)return -1;return (sortDirection==='asc'?aRank-bRank:bRank-aRank)||b.coverage-a.coverage||a.name.localeCompare(b.name)};
 if(sortBy)rows=[...rows].sort(compareRank);
 else rows=[...rows].sort((a,b)=>(b.releaseDate||'').localeCompare(a.releaseDate||'')||b.coverage-a.coverage||a.name.localeCompare(b.name));
 const suggestions=modelPool.filter(model=>(model.name+' '+model.organization).toLowerCase().includes(search.toLowerCase())).slice(0,12);
 const shownBenchmarks=data.benchmarks;
 const compareModels=selected.map(id=>resolved.find(model=>model.id===id)).filter(Boolean).sort((a,b)=>sortBy?compareRank(a,b):0);
 const toggleSort=id=>{if(sortBy===id)setSortDirection(direction=>direction==='asc'?'desc':'asc');else{setSortBy(id);setSortDirection('asc')}};
 const benchmarkDate=id=>resolved.map(model=>model.results[id]?.date).filter(Boolean).sort().at(-1)||data.benchmarks.find(b=>b.id===id)?.latest_date;
 useEffect(()=>{
  const tableWrap=tableWrapRef.current;
  if(!tableWrap)return;
  const updateScrollState=()=>setHorizontalScroll({value:tableWrap.scrollLeft,max:Math.max(0,tableWrap.scrollWidth-tableWrap.clientWidth)});
  const observer=new ResizeObserver(updateScrollState);
  const table=tableWrap.querySelector('table');
  observer.observe(tableWrap);if(table)observer.observe(table);
  tableWrap.addEventListener('scroll',updateScrollState,{passive:true});updateScrollState();
  return()=>{observer.disconnect();tableWrap.removeEventListener('scroll',updateScrollState)};
 },[shownBenchmarks.length,selected.length]);
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
 function toggleModel(id){setDraftSelected(current=>current.includes(id)?current.filter(item=>item!==id):current.length<5?[...current,id]:current)}
 function showTooltip(event,benchmark){
  const rect=event.currentTarget.getBoundingClientRect(),width=270,estimatedHeight=330,pad=12;
  const left=Math.min(Math.max(rect.left+rect.width/2-width/2,pad),window.innerWidth-width-pad);
  const top=Math.min(rect.bottom+9,window.innerHeight-estimatedHeight-pad);
  setTooltip({benchmark,left,top:Math.max(pad,top)});
 }
 return <section className="benchmark-explorer">
  <section className="benchmark-compare-studio" aria-label={zh?'模型对比':'Compare models'}>
   <div className="benchmark-compare-studio-head"><h2>{zh?'模型对比':'Compare models'} <span aria-live="polite">{draftSelected.length}/5</span></h2><p className="benchmark-compare-description">{zh?'选择模型，点击「比较」，逐项查看 24 项公开评测表现。':'Choose models, then click Compare to review 24 public benchmarks.'}</p>{selected.length>0&&<button className="benchmark-compare-exit" onClick={()=>{setSelected([]);setDraftSelected([])}}>{zh?'退出对比':'Exit comparison'}</button>}</div>
   <div className="benchmark-compare-controls">
    <div className="benchmark-compare"><div className="benchmark-search" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setPickerOpen(false)}}><MagnifyingGlassIcon size={15}/><input ref={compareSearchRef} value={search} onFocus={()=>setPickerOpen(true)} onChange={e=>{setSearch(e.target.value);setPickerOpen(true)}} placeholder={zh?'搜索模型，最多选择 5 个':'Search, up to 5 models'} aria-label={zh?'搜索并选择最多五个模型进行对比':'Search and select up to five models'}/>{search&&<button aria-label={zh?'清除搜索':'Clear search'} onClick={()=>setSearch('')}><XIcon size={14}/></button>}
     {pickerOpen&&<div className="benchmark-suggestions" onMouseDown={e=>e.preventDefault()}>{suggestions.map(model=><button key={model.id} onClick={()=>toggleModel(model.id)} aria-pressed={draftSelected.includes(model.id)} disabled={!draftSelected.includes(model.id)&&draftSelected.length>=5}><span className="benchmark-check">{draftSelected.includes(model.id)&&<CheckIcon weight="bold"/>}</span><span><strong>{model.name}</strong><small>{model.organization} · {model.coverage}/24</small></span></button>)}{!suggestions.length&&<p>{zh?'未找到匹配模型':'No matching models'}</p>}</div>}</div></div><button className="benchmark-compare-submit" disabled={!draftSelected.length} onClick={()=>{setSelected([...draftSelected]);setPickerOpen(false);setSearch('')}}>{zh?'比较':'Compare'} <span aria-hidden="true">→</span></button>
   </div>
   {draftSelected.length>0&&<div className="benchmark-compare-slots">{draftSelected.map((id,index)=>{const model=data.models.find(item=>item.id===id);return model&&<button className="benchmark-compare-slot draftSelected" key={id} onClick={()=>toggleModel(id)} aria-label={zh?`移除 ${model.name}`:`Remove ${model.name}`}><span className="benchmark-slot-number">{String(index+1).padStart(2,'0')}</span><span><strong>{model.name}</strong><small>{model.organization}</small></span><XIcon size={16}/></button>})}</div>}
  </section>
  <div className="benchmark-toolbar" aria-label={zh?'榜单筛选与时间设置':'Ranking filters and snapshot'}>
   <div className="benchmark-filters">
    <label><span>{zh?'模型类型':'Model type'}</span><select value={type} onChange={e=>setType(e.target.value)}><option value="all">{zh?'全部':'All'}</option><option value="closed">{zh?'闭源':'Closed'}</option><option value="open">{zh?'开放权重':'Open weights'}</option></select></label>
    <label><span>{zh?'地区':'Region'}</span><select value={region} onChange={e=>setRegion(e.target.value)}><option value="all">{zh?'全球':'Global'}</option><option value="china">{zh?'中国模型':'China'}</option><option value="overseas">{zh?'海外模型':'Outside China'}</option></select></label>
    <label><span>{zh?'覆盖度':'Coverage'}</span><select value={coverage} onChange={e=>setCoverage(e.target.value)}><option value="all">{zh?'全部上榜':'All ranked'}</option><option value="high">{zh?'高覆盖（12+）':'High coverage (12+)'}</option><option value="focused">{zh?'单项／专项':'Focused'}</option></select></label>

   </div>
   <div className="benchmark-snapshots" role="group" aria-label={zh?'时间快照':'Time snapshot'}>{['latest','week','month','quarter'].map(item=><button key={item} aria-pressed={preset===item} onClick={()=>{setPreset(item);setCustomOpen(false)}}>{shiftLabel(item,lang)}</button>)}<div className={'benchmark-custom-date '+(preset==='custom'?'active':'')} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setCustomOpen(false)}}><button type="button" aria-haspopup="dialog" aria-expanded={customOpen} aria-pressed={preset==='custom'} onClick={()=>{setCustomDraft(customRange);setCustomOpen(open=>!open)}}>{preset==='custom'?`${formatDate(customRange.start,lang)} — ${formatDate(customRange.end,lang)}`:(zh?'自定义':'Custom')}</button>{customOpen&&<div className="benchmark-custom-panel" role="dialog" aria-label={zh?'自定义日期区间':'Custom date range'}><label><span>{zh?'开始日期':'Start date'}</span><input type="date" min="2025-01-01" max={customDraft.end} value={customDraft.start} onChange={e=>setCustomDraft(range=>({...range,start:e.target.value}))}/></label><span className="benchmark-range-arrow">→</span><label><span>{zh?'结束日期':'End date'}</span><input type="date" min={customDraft.start} max={latest} value={customDraft.end} onChange={e=>setCustomDraft(range=>({...range,end:e.target.value}))}/></label><button type="button" disabled={!customDraft.start||!customDraft.end||customDraft.start>customDraft.end} onClick={()=>{setCustomRange(customDraft);setPreset('custom');setCustomOpen(false)}}>{zh?'应用':'Apply'}</button></div>}</div></div>
  </div>
  <p className="benchmark-status">{zh?'当前查看：':'Viewing: '}<strong>{preset==='latest'?(zh?`最新快照（${formatDate(latest,lang).replaceAll('/','.')}）`:`Latest snapshot (${formatDate(latest,lang)})`):preset==='custom'?`${formatDate(customRange.start,lang)} — ${formatDate(customRange.end,lang)}`:zh?`截至 ${formatDate(cutoff,lang)}`:`Through ${formatDate(cutoff,lang)}`}</strong>{preset==='custom'?(zh?'。每列保留其在该区间内最近一次有效结果。':'. Each column keeps its latest valid result within this range.'):(zh?'。每列保留其在该时点或此前最近一次有效结果。':'. Each column keeps its latest valid result at or before this date.')}{zh?'表格直接展示全部 24 项 benchmark。':' All 24 benchmarks are shown directly.'}</p>
  <div className={'benchmark-table-wrap '+(selected.length?'comparison-mode':'')} ref={tableWrapRef} onScroll={()=>setTooltip(null)}>{selected.length?<table className="benchmark-table benchmark-compare-table"><thead><tr><th className="benchmark-model-col">{zh?'BENCHMARK':'BENCHMARK'}</th>{compareModels.map(model=><th key={model.id} className="benchmark-compare-model"><div className="benchmark-model"><i className={model.region}/><div><strong>{model.name}</strong><small>{model.organization} · {model.openWeights?(zh?'开放权重':'Open weights'):(zh?'闭源':'Closed')}</small></div></div></th>)}</tr></thead><tbody>{shownBenchmarks.map(benchmark=>{const tags=benchmarkTags[benchmark.id]?.[lang]||[zh?benchmark.category:groupMeta[benchmark.category].en];return <tr key={benchmark.id}><th className="benchmark-row-head" style={{'--group-color':groupMeta[benchmark.category].color}} onMouseEnter={event=>showTooltip(event,benchmark)} onMouseLeave={()=>setTooltip(null)} onFocus={event=>showTooltip(event,benchmark)} onBlur={()=>setTooltip(null)}><div className="benchmark-heading-content"><strong>{benchmark.display_name}</strong><span className="benchmark-tags">{tags.map(tag=><i key={tag}>{tag}</i>)}</span><small>{formatDate(benchmarkDate(benchmark.id),lang)}</small><div className="benchmark-heading-actions"><button type="button" className="benchmark-sort-action" aria-haspopup="dialog" aria-label={(zh?'查看详情：':'View details: ')+benchmark.display_name} onClick={()=>{setTooltip(null);setMobileProfile(benchmark)}}>{zh?'详情':'Details'}</button><button type="button" className="benchmark-sort-action" aria-pressed={sortBy===benchmark.id} onClick={()=>toggleSort(benchmark.id)}>{sortBy===benchmark.id?(sortDirection==='asc'?(zh?'正序 ↑':'Ascending ↑'):(zh?'倒序 ↓':'Descending ↓')):(zh?'排序 ↕':'Sort ↕')}</button></div></div></th>{compareModels.map(model=>{const result=model.results[benchmark.id];return <td key={model.id} style={{'--group-color':groupMeta[benchmark.category].color}}>{result?<a className={'benchmark-rank rank-'+Math.min(result.rank,4)} href={result.source||benchmark.official_url} target="_blank" rel="noreferrer" title={`${model.name} · ${benchmark.canonical_name} · ${result.date}`}>#{result.rank}</a>:<span className="benchmark-na">—</span>}</td>})}</tr>})}</tbody></table>:<table className="benchmark-table"><thead><tr><th className="benchmark-model-col">{zh?'模型产品 / SKU':'Model product / SKU'}</th>{shownBenchmarks.map(benchmark=>{const tags=benchmarkTags[benchmark.id]?.[lang]||[zh?benchmark.category:groupMeta[benchmark.category].en];return <th key={benchmark.id} className="benchmark-column" style={{'--group-color':groupMeta[benchmark.category].color}} onMouseEnter={event=>showTooltip(event,benchmark)} onMouseLeave={()=>setTooltip(null)} onFocus={event=>showTooltip(event,benchmark)} onBlur={()=>setTooltip(null)}><div className="benchmark-heading-content"><strong>{benchmark.display_name}</strong><span className="benchmark-tags">{tags.map(tag=><i key={tag}>{tag}</i>)}</span><small>{formatDate(benchmarkDate(benchmark.id),lang)}</small><div className="benchmark-heading-actions"><button type="button" className="benchmark-sort-action" aria-haspopup="dialog" aria-label={(zh?'查看详情：':'View details: ')+benchmark.display_name} onClick={()=>{setTooltip(null);setMobileProfile(benchmark)}}>{zh?'详情':'Details'}</button><button type="button" className="benchmark-sort-action" aria-pressed={sortBy===benchmark.id} onClick={()=>toggleSort(benchmark.id)}>{sortBy===benchmark.id?(sortDirection==='asc'?(zh?'正序 ↑':'Ascending ↑'):(zh?'倒序 ↓':'Descending ↓')):(zh?'排序 ↕':'Sort ↕')}</button></div></div></th>})}</tr></thead><tbody>{rows.map(model=><tr key={model.id}><td><div className="benchmark-model"><i className={model.region}/><div><strong>{model.name}</strong><small>{model.organization} · {model.openWeights?(zh?'开放权重':'Open weights'):(zh?'闭源':'Closed')} · {zh?'入榜':'Coverage'} {model.coverage}/24</small></div></div></td>{shownBenchmarks.map(benchmark=>{const result=model.results[benchmark.id];return <td key={benchmark.id} style={{'--group-color':groupMeta[benchmark.category].color}}>{result?<a className={'benchmark-rank rank-'+Math.min(result.rank,4)} href={result.source||benchmark.official_url} target="_blank" rel="noreferrer" title={`${model.name} · ${benchmark.canonical_name} · ${result.date}`}>#{result.rank}</a>:<span className="benchmark-na">—</span>}</td>})}</tr>)}</tbody></table>}{!rows.length&&<div className="benchmark-empty-state">{zh?'当前筛选条件下暂无模型。':'No models match these filters.'}</div>}</div>
  {tooltip&&(()=>{const benchmark=tooltip.benchmark,detail=evidence[benchmark.id]||[],tags=benchmarkTags[benchmark.id]?.[lang]||[];return <aside className="benchmark-tooltip" style={{left:tooltip.left,top:tooltip.top}} role="tooltip"><p>{zh?'BENCHMARK 档案':'BENCHMARK PROFILE'}</p><h3>{benchmark.canonical_name}</h3><div className="benchmark-tooltip-tags">{tags.map(tag=><span key={tag}>{tag}</span>)}</div><p className="benchmark-tooltip-intro">{zh?detail[0]:englishSummary[benchmark.id]}</p><dl><dt>{zh?'评测方式':'Why selected'}</dt><dd>{zh?detail[1]:'Adds a distinct, publicly verifiable view of model capability.'}</dd><dt>{zh?'更新频次':'Update cadence'}</dt><dd>{zh?detail[2]:benchmark.update_mode.replaceAll('_',' ')}</dd>{!zh&&<><dt>Reading note</dt><dd>Check version, configuration and protocol before comparison.</dd></>}</dl></aside>})()}
  {mobileProfile&&(()=>{const benchmark=mobileProfile,detail=evidence[benchmark.id]||[],tags=benchmarkTags[benchmark.id]?.[lang]||[];return <div className="benchmark-mobile-profile-backdrop" role="presentation" onClick={()=>setMobileProfile(null)}><aside className="benchmark-mobile-profile" role="dialog" aria-modal="true" aria-label={zh?`${benchmark.canonical_name} benchmark 档案`:`${benchmark.canonical_name} benchmark profile`} onClick={event=>event.stopPropagation()}><button type="button" className="benchmark-mobile-profile-close" aria-label={zh?'关闭档案':'Close profile'} onClick={()=>setMobileProfile(null)}><XIcon size={18}/></button><p>{zh?'BENCHMARK 档案':'BENCHMARK PROFILE'}</p><h3>{benchmark.canonical_name}</h3><div className="benchmark-tooltip-tags">{tags.map(tag=><span key={tag}>{tag}</span>)}</div><p className="benchmark-tooltip-intro">{zh?detail[0]:englishSummary[benchmark.id]}</p><dl><dt>{zh?'评测方式':'Why selected'}</dt><dd>{zh?detail[1]:'Adds a distinct, publicly verifiable view of model capability.'}</dd><dt>{zh?'更新频次':'Update cadence'}</dt><dd>{zh?detail[2]:benchmark.update_mode.replaceAll('_',' ')}</dd>{!zh&&<><dt>Reading note</dt><dd>Check version, configuration and protocol before comparison.</dd></>}</dl></aside></div>})()}
  <div className="benchmark-bottom-scroll"><input type="range" min="0" max={Math.max(1,horizontalScroll.max)} value={Math.min(horizontalScroll.value,horizontalScroll.max)} disabled={!horizontalScroll.max} aria-label={zh?'表格横向滚动':'Horizontal table scroll'} onChange={event=>{const value=Number(event.target.value);if(tableWrapRef.current)tableWrapRef.current.scrollLeft=value;setHorizontalScroll(state=>({...state,value}))}}/></div>
  <p className="benchmark-source-line">{zh?'数据来源：':'Source: '}<span>{zh?'各Benchmark官方公开数据集':'Official public datasets of each benchmark'}</span> · {zh?'数据更新：':'Data updated: '}{formatDate(latest,lang)}</p>
  <details className="data-notes benchmark-notes" open><summary>{zh?'数据来源与统计口径':'Sources & methodology'}</summary><div className="data-notes-body">
   <section className="data-note-section"><h3>{zh?'数据来源':'Data sources'}</h3><p>{zh?<>本榜选取24项公开 Benchmark，汇集评测维护方的公开榜单、发布文件，以及Artificial Analysis、Epoch等第三方评测与结果聚合数据，具体出处见成绩链接。遴选兼顾<strong>来源可追溯、任务互补和实际应用价值</strong>，以用户偏好、标准化测试、动态题集及真实任务等不同评价方式，观察模型在编程、知识、推理、多模态理解、工具使用与长上下文等任务中的表现，减少对单一题库或指标的依赖。24项评测并非完整能力清单，也不保证相互独立或同等权威；列入页面不代表当前模型池已有可展示成绩。</>:<>This ranking selects 24 public benchmarks, combining maintainers’ public leaderboards and release files with third-party evaluations and aggregated results from Artificial Analysis, Epoch and others. Specific sources are linked from each result. Selection considers <strong>traceable sources, complementary tasks and practical value</strong>. User preferences, standardized tests, dynamic question sets and real tasks offer different views of coding, knowledge, reasoning, multimodal understanding, tool use and long-context performance, reducing reliance on a single test set or metric. These 24 evaluations are not a complete capability inventory, nor are they necessarily independent or equally authoritative. Listing a benchmark does not mean the current model pool has results to display.</>}</p></section>
   <section className="data-note-section"><h3>{zh?'统计口径':'Methodology'}</h3><p>{zh?'逐项展示24项评测结果，不计算跨榜总分。更新时间以实际发布为准，各来源并非同步更新。模型池收录已取得至少1项可核实公开成绩、发布日期距快照不超过18个月的产品；旗舰、mini／nano等独立产品分别展示，推理强度与工具配置作为评测记录保留。默认先按发布日期由近到远排列，同日再按所选时间下的有效成绩覆盖度排序；“高覆盖”为至少12项，“单项／专项”实际对应1—11项，覆盖度不代表能力高低。点击列头按该项已收录名次排序。多条记录优先取“标准／未注明”配置，再按记录日期由近到远、同日名次由小到大选取，此规则不保证评测条件一致。历史筛选基于当前模型池查询已有记录，自定义区间仅选取区间内记录，并非完整历史榜单。表头日期通常为所选记录的最近日期，无结果时回退至该评测登记日期，不等于实际测试日期。':'Results from all 24 evaluations are shown individually, without a cross-benchmark total. Update dates follow actual publications; sources do not update simultaneously. The model pool includes products with at least one verifiable public result and released within 18 months of the snapshot. Independent flagship, mini and nano products appear separately; reasoning intensity and tool configurations are retained in evaluation records. The default order is newest release first, then valid-result coverage for models released on the same day. High coverage means at least 12 evaluations; Single / specialist actually means 1–11. Coverage does not measure capability. Clicking a column header sorts by its included ranks. When multiple records exist, standard or unspecified configurations take priority, followed by newest record date and then lowest rank on the same date. This does not ensure consistent evaluation conditions. Historical filters query existing records within the current model pool; custom ranges select only records within that interval and are not complete historical leaderboards. Header dates usually show the latest selected record date, falling back to the benchmark’s registered date when no results exist. They are not necessarily actual test dates.'}</p></section>
   <section className="data-note-section"><h3>{zh?'免责声明':'Disclaimer'}</h3><p>{zh?'“—”表示所选条件下暂无已收录的有效成绩，不代表模型能力不足；空列及低覆盖列不能支撑普遍结论。不同来源的证据强度不同，成绩比较须核对评测版本、任务范围、指标及运行配置。Agent与电脑应用成绩反映模型与工具系统的共同表现，还受权限、步数、超时和预算影响。“配置未注明”不等于条件相同，展示名次不代表已完成可比性验证，名次差异也不必然具有统计显著性。本榜仅供行业观察，不构成采购或投资建议；公开结果可能更新、修订或撤回。':'A dash means no included valid result is available under the selected conditions, not that a model lacks capability. Empty or low-coverage columns cannot support general conclusions. Evidence strength varies by source; comparisons require checking evaluation versions, task scope, metrics and runtime configurations. Agent and computer-use results reflect the combined model and tool system, including permissions, step limits, timeouts and budgets. An unspecified configuration does not mean identical conditions. Displayed ranks have not necessarily been validated for comparability, and rank differences are not necessarily statistically significant. This ranking is for industry observation, not procurement or investment advice. Public results may be updated, revised or withdrawn.'}</p></section>
  </div></details>

  <div className="benchmark-prototype-footer"><span>{zh?'企鹅智库｜榜单 · Model Capability Ranking Prototype':'Penguin Intelligence | Rankings · Model Capability Ranking Prototype'}</span><span>{zh?'数据来源：各 benchmark 官方公开 leaderboard / release CSV / 可核验第三方公开快照':'Sources: official benchmark leaderboards / release CSVs / verifiable public third-party snapshots'}</span></div>
 </section>;
}
