// Ranks and growth use recorded model observations; missing observations stay null.
export function usageProfile(trends,id){
 const mi=trends.models.findIndex(m=>m.id===id);
 const byWeek=trends.weeks.map(()=>new Map());
 for(const [wi,index,value] of trends.points)if(byWeek[wi]&&Number.isFinite(value)&&value>=0)byWeek[wi].set(index,value);
 const history=trends.weeks.map(([date,status,total],wi)=>{
  const value=byWeek[wi].get(mi)??null;
  const rank=value==null?null:1+[...byWeek[wi].values()].filter(v=>v>value).length;
  return {date,full:status==='f',value,rank,share:value!=null&&total>0?value/total*100:null};
 });
 const complete=history.filter(w=>w.full),latest=complete.at(-1)??null,previous=complete.at(-2)??null;
 const observed=complete.filter(w=>w.value!=null),first=observed[0]??null;
 let streak=0;for(let i=complete.length-1;i>=0&&complete[i].value!=null;i--)streak++;
 const growth=latest?.value!=null&&previous?.value>0?(latest.value-previous.value)/previous.value:null;
 const rankChange=latest?.rank!=null&&previous?.rank!=null?previous.rank-latest.rank:null;
 const peak=observed.reduce((best,w)=>!best||w.value>best.value?w:best,null);
 // 新模型可能还没有完整周：用日快照兜底（排名只在当日已记录模型中计算）。
 const daily=trends.daily,dayMaps=(daily?.dates||[]).map(()=>new Map());
 for(const [di,index,value] of daily?.points||[])if(dayMaps[di]&&Number.isFinite(value)&&value>=0)dayMaps[di].set(index,value);
 const days=(daily?.dates||[]).map((date,di)=>{const value=dayMaps[di].get(mi)??null;return {date,value,rank:value==null?null:1+[...dayMaps[di].values()].filter(v=>v>value).length}});
 const firstDay=days.findIndex(d=>d.value!=null),lastIndex=days.findLastIndex(d=>d.value!=null),dailyHistory=firstDay<0?[]:days.slice(firstDay,lastIndex+1),lastDay=[...dailyHistory].reverse().find(d=>d.value!=null)??null;
 const ongoing=history.at(-1)&&!history.at(-1).full&&history.at(-1).value!=null?history.at(-1):null;
 const firstAny=history.find(w=>w.value!=null)??null;
 return {daily:dailyHistory,lastDay,dailyObserved:dailyHistory.filter(d=>d.value!=null).length,ongoing,firstAny,history,latest,previous,observed,first,streak,growth,rankChange,peak,total:observed.reduce((s,w)=>s+w.value,0),firstTop3:observed.find(w=>w.rank<=3)??null};
}
