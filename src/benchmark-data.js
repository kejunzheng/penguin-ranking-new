const chinaCountries=new Set(['cn','china','中国','people\'s republic of china']);

export function benchmarkCutoff(latest,preset,custom){
 if(preset==='custom')return custom||latest;
 if(preset==='latest')return latest;
 const days={week:7,month:30,quarter:90}[preset]||0;
 const date=new Date(latest+'T00:00:00Z');
 date.setUTCDate(date.getUTCDate()-days);
 return date.toISOString().slice(0,10);
}

export function chooseBenchmarkRecord(records=[],cutoff,start=null){
 const valid=records.filter(record=>record.date&&record.date<=cutoff&&(!start||record.date>=start)&&record.rank!=null);
 return valid.sort((a,b)=>{
  const standardA=a.config==='标准/未注明'?1:0,standardB=b.config==='标准/未注明'?1:0;
  return standardB-standardA||b.date.localeCompare(a.date)||a.rank-b.rank;
 })[0]||null;
}

export function resolveBenchmarkModel(model,benchmarkIds,cutoff,start=null,snapshotDates=null){
 const records=Object.fromEntries(benchmarkIds.map(id=>[id,(model.records[id]||[]).filter(record=>!snapshotDates?.[id]||record.date===snapshotDates[id])]));
 const results=Object.fromEntries(benchmarkIds.map(id=>[id,chooseBenchmarkRecord(records[id],cutoff,start)]));
 const coverage=Object.values(results).filter(Boolean).length;
 const country=String(model.country||'').toLowerCase();
 return {...model,records,results,coverage,region:chinaCountries.has(country)?'china':'overseas',type:model.openWeights?'open':'closed'};
}

export function filterBenchmarkModels(models,filters){
 const {type='all',region='all',coverage='all',selected=[]}=filters;
 return models.filter(model=>(type==='all'||model.type===type)
  &&(region==='all'||model.region===region)
  &&(coverage==='all'||(coverage==='high'?model.coverage>=12:model.coverage>0&&model.coverage<12))
  &&(!selected.length||selected.includes(model.id))
  &&model.coverage>0);
}

export function toggleBenchmarkSort(criteria, id){
 const existing=criteria.find(item=>item.id===id);
 if(!existing)return [...criteria,{id,direction:'asc'}];
 if(existing.direction==='asc')return criteria.map(item=>item.id===id?{...item,direction:'desc'}:item);
 return criteria.filter(item=>item.id!==id);
}

export function compareBenchmarkRanks(a,b,criteria){
 for(const {id,direction} of criteria){
  const aRank=a.results[id]?.rank,bRank=b.results[id]?.rank;
  const aMissing=!Number.isFinite(aRank),bMissing=!Number.isFinite(bRank);
  if(aMissing&&bMissing)continue;
  if(aMissing)return 1;
  if(bMissing)return -1;
  const difference=direction==='desc'?bRank-aRank:aRank-bRank;
  if(difference)return difference;
 }
 return b.coverage-a.coverage||a.name.localeCompare(b.name)||a.id.localeCompare(b.id);
}
