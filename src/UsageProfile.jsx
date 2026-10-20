import {useMemo,useState} from 'react';
import ModelLogo from './ModelLogo';
import {usageProfile} from './usage-profile';
const number=n=>n==null?'—':new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(n);
const weekEnd=date=>{const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+6);return d.toISOString().slice(5,10)};
const pct=n=>n==null?'—':n.toFixed(1)+'%';
export default function UsageProfile({model,trends,lang}){
 const zh=lang==='zh',[metric,setMetric]=useState('value');
 const p=useMemo(()=>usageProfile(trends,model.id),[trends,model.id]);
 const last=p.latest,prev=p.previous;
 // 还没有完整周的新模型改看日调用量；周图从首次出现（含进行中周）开始画，避免一年的空柱。
 const fresh=!p.observed.length&&p.daily.length>0,start=p.first||p.firstAny;
 const mode=fresh?'value':metric;
 const points=fresh?p.daily.map(d=>({...d,full:true})):p.history.filter(w=>!start||w.date>=start.date);
 const max=Math.max(1,...points.map(w=>w[mode]??0));
 const format=w=>mode==='value'?number(w.value):mode==='share'?pct(w.share):w.rank==null?'—':'#'+w.rank;
 const events=[[zh?'首次记录上榜':'First recorded appearance',p.first],[zh?'首次记录进入前三':'First recorded top three',p.firstTop3],[zh?'完整周用量峰值':'Peak complete-week usage',p.peak]].filter(([,w])=>w);
 const status=fresh?(zh?'新上榜':'New entry'):p.growth==null?(zh?'观测不足':'Limited observations'):p.growth>0?(zh?'上升中':'Rising'):p.growth<0?(zh?'下降中':'Declining'):(zh?'持平':'Stable');
 return <div className="usage-profile-content">
   <section className="usage-profile-identity model-profile-identity"><div className="model-identity"><ModelLogo item={model} lang={lang} large/><div><p className="model-profile-kicker">{zh?'模型调用档案':'MODEL USAGE PROFILE'}</p><h2 id="model-profile-title">{model.name}</h2><p className="model-profile-meta">{model.provider} · {model.id}</p></div></div><div className="usage-profile-badges"><span>{status}</span><span>{fresh?(zh?`${p.daily[0].date.slice(5)} 起有调用记录`:`Recorded since ${p.daily[0].date.slice(5)}`):(zh?`连续记录 ${p.streak} 个完整周`:`${p.streak} consecutive complete weeks`)}</span><span>{zh?'发布日期未提供':'Release date unavailable'}</span></div></section>
   {fresh?<section><p className="usage-profile-asof">{zh?`暂无完整周数据 · 按日调用量展示，数据截至 ${p.lastDay.date}`:`No complete week yet · daily usage through ${p.lastDay.date}`}</p><div className="usage-profile-metrics">
    <div><span>{zh?'最近一日调用量':'Latest daily usage'}</span><strong>{number(p.lastDay.value)}</strong><small>{p.lastDay.date}</small></div>
    <div><span>{zh?'本周至今':'This week so far'}</span><strong>{number(p.ongoing?.value)}</strong><small>{p.ongoing?(zh?`${p.ongoing.date} 起 · 进行中${p.ongoing.rank?` · 暂列 #${p.ongoing.rank}`:''}`:`From ${p.ongoing.date} · ongoing${p.ongoing.rank?` · provisional #${p.ongoing.rank}`:''}`):(zh?'本周暂无记录':'No record this week')}</small></div>
    <div><span>{zh?'有记录天数':'Days recorded'}</span><strong>{p.dailyObserved}</strong><small>{zh?`首次 ${p.daily[0].date}`:`First ${p.daily[0].date}`}</small></div>
    <div><span>{zh?'完整周统计':'Complete-week stats'}</span><strong>{zh?'待更新':'Pending'}</strong><small>{p.ongoing?(zh?`${weekEnd(p.ongoing.date)} 本周结束后更新`:`After the week ends on ${weekEnd(p.ongoing.date)}`):(zh?'完整周结束后更新':'After a full week completes')}</small></div>
   </div></section>:<section><p className="usage-profile-asof">{zh?'最近完整周':'Latest complete week'} · {last?.date||'—'}</p><div className="usage-profile-metrics">
    <div><span>{zh?'上周调用量':'Last complete week'}</span><strong>{number(last?.value)}</strong><small>{zh?'环比 ':'Week over week '}{p.growth==null?'—':`${p.growth>0?'+':''}${pct(p.growth*100)}`}</small></div>
    <div><span>{zh?'上周排名':'Last week rank'}</span><strong>{last?.rank?'#'+last.rank:'—'}</strong><small>{zh?'较前周 ':'Vs previous week '}{p.rankChange==null?'—':p.rankChange===0?(zh?'持平':'Unchanged'):`${p.rankChange>0?'↑':'↓'} ${Math.abs(p.rankChange)}`}</small></div>
    <div><span>{zh?'份额':'Share'}</span><strong>{pct(last?.share)}</strong><small>{zh?'前周 ':'Previous '}{pct(prev?.share)}</small></div>
    <div><span>{zh?'已记录完整周累计':'Recorded complete-week total'}</span><strong>{p.observed.length?number(p.total):'—'}</strong><small>{p.observed.length} {zh?'个完整周':'complete weeks'}</small></div>
   </div></section>}
   <section><div className="usage-profile-chart-heading"><h3>{fresh?(zh?'日调用量趋势':'Daily usage trend'):(zh?'周调用量趋势':'Weekly usage trend')}</h3>{fresh?null:<div className="segmented">{[['value',zh?'用量':'Usage'],['share',zh?'份额':'Share'],['rank',zh?'排名':'Rank']].map(([key,label])=><button key={key} aria-pressed={mode===key} onClick={()=>setMetric(key)}>{label}</button>)}</div>}</div>
    <div className="usage-profile-chart" tabIndex={0} aria-label={fresh?(zh?'日趋势，可左右滚动':'Daily trend; scroll horizontally'):(zh?'周趋势，可左右滚动':'Weekly trend; scroll horizontally')}><div className="usage-profile-bars" style={{minWidth:Math.max(360,points.length*58)}}>{points.map(w=><div className="usage-profile-bar" key={w.date}><div className="usage-profile-bar-track"><span>{format(w)}</span><i className={!w.full?'incomplete':w.date===last?.date?'latest':''} style={{height:w[mode]==null?0:Math.max(3,mode==='rank'?(max-w.rank+1)/max*115:w[mode]/max*115)}}/></div><small>{w.date.slice(5)}</small>{fresh?null:<small>{!w.full?(zh?'进行中':'Ongoing'):w.rank==null?'—':'#'+w.rank}</small>}</div>)}</div></div>
    <p className="usage-profile-note">{fresh?(zh?'用量为 Token 数（T=万亿，B=十亿）；该模型还没有完整周数据，这里按日展示，日数据只覆盖部分模型，不做日排名；完整周结束后会切换为周趋势和周排名。':'Usage is in tokens (T = trillion, B = billion). No complete week yet, so daily usage is shown; daily data covers only some models, so no daily rank is given. Weekly trends and ranks appear once a full week completes.'):null}{fresh?null:zh?'用量为 Token 数（T=万亿，B=十亿）；排名基于该周已记录模型，数字越小越靠前。虚线表示进行中的周，不计入累计和环比；“—”为缺失观测。':'Usage is in tokens (T = trillion, B = billion). Ranks cover recorded models; lower is better. Dashed bars are incomplete weeks, excluded from totals and growth. Dashes indicate missing observations.'}</p>
   </section>
   <section><h3>{zh?'关键节点':'Milestones'}</h3>{events.length?<ol className="usage-profile-timeline">{events.map(([label,w])=><li key={label}><strong>{w.date} · {label}</strong><p>#{w.rank} · {number(w.value)} · {zh?'份额 ':'Share '}{pct(w.share)}</p></li>)}</ol>:<p className="usage-profile-note">{zh?'暂无完整周观测':'No complete-week observations'}</p>}</section>
   <section><h3>{zh?'一句话看点':'At a glance'}</h3><p className="usage-profile-takeaway">{p.first&&last?.value!=null?(zh?`已记录 ${p.observed.length} 个完整周，最近完整周用量为 ${number(last.value)}，在已记录模型中排名第 ${last.rank}，占平台用量 ${pct(last.share)}。`:`Across ${p.observed.length} recorded complete weeks, the latest usage is ${number(last.value)}, ranking #${last.rank} among recorded models with ${pct(last.share)} of platform usage.`):fresh?(zh?`该模型 ${p.daily[0].date} 起才有调用记录，还没有完整周数据。最近一日（${p.lastDay.date}）调用量 ${number(p.lastDay.value)}，完整周统计会在本周结束后更新。`:`Usage records start on ${p.daily[0].date}, so there is no complete week yet. On ${p.lastDay.date} it used ${number(p.lastDay.value)} tokens; complete-week stats update after the week ends.`):(zh?'当前数据不足以判断完整周趋势。':'Insufficient data to assess a complete-week trend.')}</p><p className="usage-profile-note">{zh?'数据来源：OpenRouter 公开调用量快照。首次记录不等于模型发布；累计仅覆盖已有完整周，非生命周期总量。':'Source: public OpenRouter usage snapshots. First appearance is not release date; totals cover observed complete weeks, not lifetime usage.'}<br/>{zh?'数据更新：':'Updated: '}{trends.updated_at.slice(0,10)}</p></section>
  </div>;
}
