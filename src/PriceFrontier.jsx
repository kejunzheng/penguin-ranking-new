import React,{useMemo,useState} from 'react';
import ModelLogo from './ModelLogo';
import {MIN_SCORE,TICKS,blendedPrice,frontierOf} from './price-frontier-math';

// 价格斩杀线：AA 智能指数（纵轴）× 一般用量折算价格（横轴，对数刻度）。
// 斩杀线 = 按价格从低到高，分数创新高的模型（同等或更低价格下没有更高分的模型）。
// 只画评测榜收录、且 AA 实测分数不低于 MIN_SCORE 的模型；价格为 0 的无法放在对数轴上，不画。
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
  return frontier.points.map(point=>({...point,model:byId.get(point.id),price:blendedPrice(point,frontier.blend,frontier.usd_to_cny)}))
   .filter(point=>point.model&&point.score>=MIN_SCORE&&point.price>0);
 },[frontier,models]);
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

 return <section className="price-frontier" aria-label={zh?'价格斩杀线':'Price frontier'}>
  <div className="price-frontier-head">
   <div><h3>{zh?'价格斩杀线':'Price frontier'}<small>{zh?`${points.length} 个模型`:`${points.length} models`}</small></h3>
    <p>{zh?<>斩杀线上是各价位 AA 智能指数最高的模型。价格按一般用量折算：缓存命中 : 输入 : 输出 = <b>7 : 2 : 1</b>。</>:<>Models on the line have the highest AA Intelligence Index at their price. Blended price: cache hit : input : output = <b>7 : 2 : 1</b>.</>}</p></div>
   <div className="price-frontier-filters">
    <label className="price-frontier-toggle"><input type="checkbox" checked={china} onChange={e=>setChina(e.target.checked)}/>{zh?'国产模型':'China models'}</label>
    <label className="price-frontier-toggle"><input type="checkbox" checked={open} onChange={e=>setOpen(e.target.checked)}/>{zh?'开源模型':'Open weights'}</label>
   </div>
  </div>
  <p className="price-frontier-axis-y">{zh?'AA 智能指数 ↑':'AA Intelligence Index ↑'}</p>
  <div className="price-frontier-plot">
   <div className="price-frontier-canvas">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
     {yTicks.map(tick=><line key={'y'+tick} className="grid" x1="0" x2="100" y1={y(tick)} y2={y(tick)}/>)}
     {xTicks.map(tick=><line key={'x'+tick} className="grid" y1="0" y2="100" x1={x(tick)} x2={x(tick)}/>)}
     {area&&<path className="area" d={area}/>}
     {path&&<path className="step" d={path}/>}
     {last&&<line className="tail" x1={x(last.price)} x2="100" y1={y(last.score)} y2={y(last.score)}/>}
    </svg>
    {yTicks.map(tick=><span key={'yl'+tick} className="price-frontier-tick y" style={{top:`${y(tick)}%`}}>{tick}</span>)}
    {xTicks.map(tick=><span key={'xl'+tick} className="price-frontier-tick x" style={{left:`${x(tick)}%`}}>{money(tick,cny).replace(/\.00$|\.0$/,'')}</span>)}
    {points.filter(point=>!onLine.has(point.id)).map(point=><button type="button" key={point.id} className="price-frontier-dot" style={{left:`${x(point.price)}%`,top:`${y(point.score)}%`}} aria-label={`${point.model.name} ${point.score} · ${money(point.price,cny)}`} onMouseEnter={()=>setHover(point.id)} onMouseLeave={()=>setHover(null)} onFocus={()=>setHover(point.id)} onBlur={()=>setHover(null)}><ModelLogo item={logoItem(point.model)} lang={lang}/></button>)}
    {line.map((point,index)=><div key={point.id} className={'price-frontier-leader'+(x(point.price)<22?' label-right':'')} style={{left:`${x(point.price)}%`,top:`${y(point.score)}%`}} onMouseEnter={()=>setHover(point.id)} onMouseLeave={()=>setHover(null)}>
     <span className="chip"><ModelLogo item={logoItem(point.model)} lang={lang}/></span>
     <span className="label"><strong>{point.model.name}</strong><em><b>{point.score.toFixed(1)}</b> · {money(point.price,cny)}</em></span>
    </div>)}
    {hovered&&<div className={'price-frontier-tooltip'+(x(hovered.price)>65?' left':'')} style={{left:`${x(hovered.price)}%`,top:`${y(hovered.score)}%`}} role="status"><strong>{hovered.model.name}</strong><span>{zh?'AA 智能指数':'AA Index'} <b>{hovered.score.toFixed(1)}</b></span><span>{zh?'折算价格':'Blended'} <b>{money(hovered.price,cny)}</b>{zh?' / 百万 Token':' / 1M tokens'}</span><span>{zh?'配置：':'Config: '}{hovered.config}</span></div>}
   </div>
   <p className="price-frontier-axis-x">{zh?`价格（${cny?'¥':'$'} / 百万 Token）→`:`Price (${cny?'¥':'$'} / 1M tokens) →`}</p>
  </div>
  <ol className="price-frontier-list" aria-label={zh?'斩杀线模型':'Models on the frontier'}>{line.map(point=><li key={point.id}><span>{point.model.name}</span><b>{point.score.toFixed(1)}</b><em>{money(point.price,cny)}</em></li>)}</ol>
  <p className="price-frontier-note">{zh?`数据来源：Artificial Analysis（${frontier.date}），分数与标价均取自 AA；只含本评测榜收录、AA 实测分数 ≥ ${MIN_SCORE} 的模型，同一模型取分数最高的推理配置。美元价按 1 USD = ${frontier.usd_to_cny?.toFixed(2)} CNY 折算。`:`Source: Artificial Analysis (${frontier.date}); scores and list prices both from AA. Only tracked models with a measured AA score ≥ ${MIN_SCORE}; each model uses its highest-scoring configuration.`}</p>
 </section>;
}
