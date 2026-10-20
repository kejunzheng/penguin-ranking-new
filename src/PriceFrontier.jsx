import React,{useMemo,useState} from 'react';
import ModelLogo from './ModelLogo';
import {configLabel} from './domains';
import {MIN_SCORE,TICKS,blendedPrice,frontierOf} from './price-frontier-math';

// 价格斩杀线：本站综合分（纵轴）× 一般用量折算价格（横轴，对数刻度）。
// 斩杀线 = 按价格从低到高，分数创新高的模型（同等或更低价格下没有更高分的模型）。
// 只画有综合分名次、且综合分不低于 MIN_SCORE 的模型；价格（Artificial Analysis 标价）为 0 的无法放在对数轴上，不画。
// 评测榜的厂商名 → model-brand 的品牌键（找不到时 ModelLogo 显示通用图标）
const ORG_BRANDS=[[/anthropic/,'anthropic'],[/google/,'google'],[/openai/,'openai'],[/x\.?ai|spacex/,'x-ai'],[/xiaomi/,'xiaomi'],[/deepseek/,'deepseek'],[/meta/,'meta'],[/alibaba|qwen/,'qwen'],[/z\.?ai|zhipu/,'z-ai'],[/moonshot|kimi/,'moonshotai'],[/mistral/,'mistralai'],[/minimax/,'minimax'],[/tencent/,'tencent'],[/bytedance/,'bytedance'],[/baidu/,'baidu'],[/nvidia/,'nvidia'],[/stepfun/,'stepfun'],[/upstage/,'upstage']];
const logoItem=model=>{const org=String(model.organization||'').toLowerCase();return{name:model.name,author:ORG_BRANDS.find(([pattern])=>pattern.test(org))?.[1]||org,provider_name:model.organization}};
const money=(value,cny)=>(cny?'¥':'$')+(value>=10?value.toFixed(1):value.toFixed(2));

export default function PriceFrontier({frontier,models,lang}){
 const zh=lang==='zh',[china,setChina]=useState(false),[open,setOpen]=useState(false),[hover,setHover]=useState(null);
 const cny=Boolean(frontier?.usd_to_cny);
 const all=useMemo(()=>{
  if(!frontier)return[];
  const byId=new Map(models.map(model=>[model.id,model]));
  return frontier.points.map(point=>{const model=byId.get(point.id);return{...point,model,score:model?.composite?.rank?model.composite.score:null,price:blendedPrice(point,frontier.blend,frontier.usd_to_cny)}})
   .filter(point=>point.model&&point.score!=null&&point.score>=MIN_SCORE&&point.price>0);
 },[frontier,models]);
 // 低于分数门槛、未画入图中的收录模型数量，用于标注
 const belowCount=useMemo(()=>{if(!frontier)return 0;const byId=new Map(models.map(model=>[model.id,model]));return frontier.points.filter(point=>{const c=byId.get(point.id)?.composite;return c?.rank&&c.score<MIN_SCORE}).length},[frontier,models]);
 const points=all.filter(point=>(!china||point.model.region==='china')&&(!open||point.model.type==='open'));
 const line=frontierOf(points),onLine=new Set(line.map(point=>point.id));
 if(!frontier||!all.length)return null;

 // 坐标轴范围：按全部候选点固定，切换筛选时坐标不跳动
 const minPrice=Math.min(...all.map(point=>point.price)),maxPrice=Math.max(...all.map(point=>point.price));
 const xMin=Math.log10(minPrice/1.4),xMax=Math.log10(maxPrice*1.4);
 const yMin=Math.floor(MIN_SCORE-1),yMax=Math.ceil(Math.max(...all.map(point=>point.score))+3);
 const x=price=>(Math.log10(price)-xMin)/(xMax-xMin)*100;
 const y=score=>(1-(score-yMin)/(yMax-yMin))*100;
 const xTicks=TICKS.filter(tick=>Math.log10(tick)>=xMin&&Math.log10(tick)<=xMax);
 const yTicks=[];for(let tick=Math.ceil(yMin/5)*5;tick<=yMax;tick+=5)yTicks.push(tick);
 let path='';line.forEach((point,index)=>{path+=index?` H${x(point.price)} V${y(point.score)}`:`M${x(point.price)} ${y(point.score)}`});
 const last=line.at(-1);
 const area=line.length?`${path} H100 V100 H${x(line[0].price)} Z`:'';
 const hovered=hover&&points.find(point=>point.id===hover);
 // 标签避让：与上一个斩杀线节点靠得很近时，标签改放到图标下方 / 上方（交替），避免相互压住
 const labelClass=line.map(()=>'');
 line.forEach((point,index)=>{
  labelClass[index]=x(point.price)<22?' label-right':'';
  const prev=line[index-1];
  if(prev&&x(point.price)-x(prev.price)<16&&Math.abs(y(point.score)-y(prev.score))<14)labelClass[index]=labelClass[index-1].includes('label-above')?' label-below':' label-above';
 });

 return <section className="price-frontier" aria-label={zh?'价格斩杀线':'Price frontier'}>
  <div className="price-frontier-head">
   <div><h3>{zh?'价格斩杀线':'Price frontier'}<small>{zh?`${points.length} 个模型`:`${points.length} models`}</small></h3>
    <p>{zh?<>斩杀线上是各价位综合分最高的模型。价格按一般用量折算：缓存命中 : 输入 : 输出 = <b>7 : 2 : 1</b>。</>:<>Models on the line have the highest composite score at their price. Blended price: cache hit : input : output = <b>7 : 2 : 1</b>.</>}</p>
    <p className="price-frontier-threshold">{zh?<>综合分低于 <b>{MIN_SCORE}</b> 分（参照组均值）的模型不在此图中{belowCount?`（共 ${belowCount} 个）`:''}。</>:<>Models with a composite score below <b>{MIN_SCORE}</b> (the reference-group mean) are not shown{belowCount?` (${belowCount} models)`:''}.</>}</p></div>
   <div className="price-frontier-filters">
    <label className="price-frontier-toggle"><input type="checkbox" checked={china} onChange={e=>setChina(e.target.checked)}/>{zh?'中国模型':'China models'}</label>
    <label className="price-frontier-toggle"><input type="checkbox" checked={open} onChange={e=>setOpen(e.target.checked)}/>{zh?'开源模型':'Open weights'}</label>
   </div>
  </div>
  <p className="price-frontier-axis-y">{zh?'模型能力榜 综合分 ↑':'AI Trend · Composite ↑'}</p>
  <div className="price-frontier-plot">
   <div className="price-frontier-canvas">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
     {yTicks.map(tick=><line key={'y'+tick} className="grid" x1="0" x2="100" y1={y(tick)} y2={y(tick)}/>)}
     {xTicks.map(tick=><line key={'x'+tick} className="grid" y1="0" y2="100" x1={x(tick)} x2={x(tick)}/>)}
     {area&&<path className="area" d={area}/>}
     {path&&<path className="step" d={path}/>}
     <line className="threshold" x1="0" x2="100" y1={y(MIN_SCORE)} y2={y(MIN_SCORE)}/>
     {last&&<line className="tail" x1={x(last.price)} x2="100" y1={y(last.score)} y2={y(last.score)}/>}
    </svg>
    <span className="price-frontier-threshold-label" style={{top:`${y(MIN_SCORE)}%`}}>{zh?`${MIN_SCORE} 分以下未列入`:`Below ${MIN_SCORE} not shown`}</span>
    {yTicks.map(tick=><span key={'yl'+tick} className="price-frontier-tick y" style={{top:`${y(tick)}%`}}>{tick}</span>)}
    {xTicks.map(tick=><span key={'xl'+tick} className="price-frontier-tick x" style={{left:`${x(tick)}%`}}>{money(tick,cny).replace(/\.00$|\.0$/,'')}</span>)}
    {points.filter(point=>!onLine.has(point.id)).map(point=><button type="button" key={point.id} className="price-frontier-dot" style={{left:`${x(point.price)}%`,top:`${y(point.score)}%`}} aria-label={`${point.model.name} ${point.score} · ${money(point.price,cny)}`} onMouseEnter={()=>setHover(point.id)} onMouseLeave={()=>setHover(null)} onFocus={()=>setHover(point.id)} onBlur={()=>setHover(null)}><ModelLogo item={logoItem(point.model)} lang={lang}/></button>)}
    {line.map((point,index)=><div key={point.id} className={'price-frontier-leader'+labelClass[index]} style={{left:`${x(point.price)}%`,top:`${y(point.score)}%`}} onMouseEnter={()=>setHover(point.id)} onMouseLeave={()=>setHover(null)}>
     <span className="chip"><ModelLogo item={logoItem(point.model)} lang={lang}/></span>
     <span className="label"><strong>{point.model.name}</strong><em><b>{point.score.toFixed(1)}</b> · {money(point.price,cny)}</em></span>
    </div>)}
    {hovered&&<div className={'price-frontier-tooltip'+(x(hovered.price)>65?' left':'')} style={{left:`${x(hovered.price)}%`,top:`${y(hovered.score)}%`}} role="status"><strong>{hovered.model.name}</strong><span>{zh?'综合分':'Composite'} <b>{hovered.score.toFixed(1)}</b></span><span>{zh?'折算价格':'Blended'} <b>{money(hovered.price,cny)}</b>{zh?' / 百万 Token':' / 1M tokens'}</span><span>{zh?'计价配置：':'Priced config: '}{configLabel(hovered.config,zh)}</span></div>}
   </div>
   <p className="price-frontier-axis-x">{zh?`价格（${cny?'¥':'$'} / 百万 Token）→`:`Price (${cny?'¥':'$'} / 1M tokens) →`}</p>
  </div>
  <ol className="price-frontier-list" aria-label={zh?'斩杀线模型':'Models on the frontier'}>{line.map(point=><li key={point.id}><span>{point.model.name}</span><b>{point.score.toFixed(1)}</b><em>{money(point.price,cny)}</em></li>)}</ol>
  <p className="price-frontier-note">{zh?`数据来源：分数为本站评测榜的综合分（综合表现指数，只用名次汇总，不是百分制），价格取自 Artificial Analysis 标价（${frontier.date}）；只含有综合分名次、综合分 ≥ ${MIN_SCORE} 且 AA 有标价的模型，价格取该模型 AA 得分最高的推理配置。美元价按 1 USD = ${frontier.usd_to_cny?.toFixed(2)} CNY 折算。`:`Scores are this site’s composite index (rank-based, not a percentage); prices are Artificial Analysis list prices (${frontier.date}). Only ranked models with a composite ≥ ${MIN_SCORE} and an AA price; each model is priced at its highest-scoring AA configuration.`}</p>
 </section>;
}
