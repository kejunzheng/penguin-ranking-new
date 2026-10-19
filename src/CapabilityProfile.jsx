import {useMemo} from 'react';
import ModelLogo from './ModelLogo';

// 能力档案：展示本站评测记录——综合分、六大领域得分、每项评测的最新名次。
// 只用名次，不使用各评测的原始分数；每项评测取最新一期，同期多个配置取名次最好的一个。
const logoItem=model=>({name:model.name,author:String(model.organization||'').toLowerCase(),provider_name:model.organization});
export function capabilityRows(model,benchmarks){
 return benchmarks.map(benchmark=>{
  const entries=model.records?.[benchmark.id]||[];
  if(!entries.length)return null;
  const date=entries.reduce((latest,entry)=>entry.date>latest?entry.date:latest,'');
  const latest=entries.filter(entry=>entry.date===date);
  const best=latest.reduce((a,b)=>b.rank<a.rank?b:a);
  return {benchmark,date,rank:best.rank,config:best.config,others:latest.length-1,total:benchmark.model_count};
 }).filter(Boolean);
}
const scoreTone=score=>score>=80?'high':score>=65?'mid':'low';
export default function CapabilityProfile({model,benchmarks,summary,lang}){
 const zh=lang==='zh',row=model.composite;
 const rows=useMemo(()=>capabilityRows(model,benchmarks),[model,benchmarks]);
 const groups=useMemo(()=>{const map=new Map();rows.forEach(item=>{const key=item.benchmark.category;if(!map.has(key))map.set(key,[]);map.get(key).push(item)});return [...map]},[rows]);
 const domains=row?.domain_scores?Object.entries(row.domain_scores):[];
 const [low,high]=row?.score_range||[];
 return <div className="usage-profile-content capability-profile">
  <section className="usage-profile-identity model-profile-identity"><div className="model-identity"><ModelLogo item={logoItem(model)} lang={lang} large/><div><p className="model-profile-kicker">{zh?'模型能力档案':'MODEL CAPABILITY PROFILE'}</p><h2 id="model-profile-title">{model.name}</h2><p className="model-profile-meta">{model.organization} · {model.openWeights?(zh?'开放权重':'Open weights'):(zh?'闭源':'Closed')}{model.releaseDate?` · ${zh?'发布于 ':'Released '}${model.releaseDate}`:''}</p></div></div></section>
  {row?<section><p className="usage-profile-asof">{zh?'综合表现指数':'Composite index'} · {row.date}</p><div className="usage-profile-metrics">
   <div><span>{zh?'综合分':'Composite score'}</span><strong>{row.score.toFixed(1)}</strong>{low!=null&&<small>{zh?'区间 ':'Range '}{low.toFixed(1)}–{high.toFixed(1)}</small>}</div>
   <div><span>{zh?'综合名次':'Composite rank'}</span><strong>#{row.rank}</strong>{row.rank_range&&row.rank_range[0]!==row.rank_range[1]&&<small>{zh?'名次区间 ':'Rank range '}#{row.rank_range[0]}–#{row.rank_range[1]}</small>}</div>
   <div><span>{zh?'计入综合分的评测':'Benchmarks in composite'}</span><strong>{row.benchmarks}</strong><small>{zh?`另有 ${Math.max(0,rows.length-row.benchmarks)} 项仅作参考`:`${Math.max(0,rows.length-row.benchmarks)} reference only`}</small></div>
   <div><span>{zh?'覆盖领域':'Domains'}</span><strong>{row.domains}/{domains.length||6}</strong>{row.missing_domains?.length>0&&<small>{zh?'缺 ':'Missing '}{row.missing_domains.join('、')}</small>}</div>
  </div></section>:<section><p className="usage-profile-note">{zh?'该模型暂未进入综合榜（需至少 5 项评测、覆盖 3 个领域），下面仅列出已有的单项评测名次。':'This model is not in the composite ranking yet (needs ≥5 benchmarks across ≥3 domains). Only individual benchmark ranks are listed below.'}</p></section>}
  {domains.length>0&&<section><h3>{zh?'六大领域得分':'Domain scores'}</h3><ul className="capability-domains">{domains.map(([name,score])=><li key={name}><span>{name}</span><div className="capability-bar" role="img" aria-label={`${name} ${score}`}><i className={scoreTone(score)} style={{width:Math.max(4,Math.min(100,score))+'%'}}/></div><strong>{score.toFixed(1)}</strong></li>)}</ul><p className="usage-profile-note">{zh?'各领域由该领域内评测的名次折算，6 个领域等权合成综合分；分数越高越好。':'Each domain score is derived from ranks within that domain; the six domains are weighted equally. Higher is better.'}</p></section>}
  <section><h3>{zh?'评测记录':'Benchmark records'}<small className="capability-count">{rows.length} {zh?'项':'items'}</small></h3>
   {groups.length?groups.map(([category,items])=><div className="capability-group" key={category}><h4>{category}</h4><ul>{items.map(item=><li key={item.benchmark.id}>
    <div className="capability-record-name"><strong>{item.benchmark.display_name}</strong><small>{item.config||'—'}{item.others>0?(zh?` · 另有 ${item.others} 个配置`:` · +${item.others} more configs`):''}</small></div>
    <div className="capability-record-rank"><strong>#{item.rank}</strong><small>{item.total?(zh?`共 ${item.total} 个模型`:`of ${item.total}`):''}</small></div>
    <time>{item.date.slice(5)}</time></li>)}</ul></div>):<p className="usage-profile-note">{zh?'暂无评测记录。':'No benchmark records.'}</p>}
   <p className="usage-profile-note">{zh?'名次为各评测榜单上该模型的最新一期排名，数字越小越靠前；同一期有多个配置时取最好的一个。日期为该评测的数据日期。':'Ranks are the latest snapshot on each leaderboard (lower is better); the best configuration is shown when several exist.'}</p></section>
 </div>;
}
