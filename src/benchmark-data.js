const chinaCountries=new Set(['cn','china','中国','people\'s republic of china']);

export function benchmarkCutoff(latest,preset,custom){
 if(preset==='custom')return custom||latest;
 if(preset==='latest')return latest;
 const days={week:7,month:30,quarter:90}[preset]||0;
 const date=new Date(latest+'T00:00:00Z');
 date.setUTCDate(date.getUTCDate()-days);
 return date.toISOString().slice(0,10);
}

// 推理档位（综合分规则 v4 第 3.2 节）：按表格从上到下第一个匹配为准，大小写不敏感；无法识别返回 null。
export function reasoningTier(config){
 const text=String(config||'').toLowerCase();
 if(/non-reasoning|no thinking|none|minimal|instant/.test(text))return 1;
 if(/max|maximum|adaptive\/max/.test(text))return 6;
 if(/xhigh|x-high|extra high/.test(text))return 5;
 if(/high/.test(text))return 4;
 if(/medium|med/.test(text))return 3;
 if(/low/.test(text))return 2;
 const budget=text.match(/thinking[^0-9]*(\d+(?:\.\d+)?)\s*k/);
 if(budget)return 3+Math.min(2.9,Number(budget[1])/100);
 if(/reasoning|thinking/.test(text))return 4;
 return null;
}

// 同一模型在同一评测的多条记录里取哪一条：先按配置选，不看名次（禁止取名次最好的一条）。
// 综合分计算与表格展示共用这一个函数，保证表格默认显示的就是综合分用的那条。
export function pickConfigRecord(records=[]){
 const valid=records.filter(record=>Number.isFinite(record.rank));
 if(valid.length<2)return valid[0]||null;
 const tiered=valid.map(record=>({record,tier:reasoningTier(record.config)}));
 const known=tiered.filter(item=>item.tier!==null);
 let pool;
 if(known.length){
  const top=Math.max(...known.map(item=>item.tier));
  pool=known.filter(item=>item.tier===top).map(item=>item.record);
 }else{
  const standard=valid.filter(record=>!record.config||record.config==='标准/未注明');
  pool=standard.length?standard:valid;
 }
 pool=[...pool].sort((a,b)=>a.rank-b.rank||String(a.config).localeCompare(String(b.config)));
 return pool[Math.floor((pool.length-1)/2)];
}

export function chooseBenchmarkRecord(records=[],cutoff,start=null){
 const valid=records.filter(record=>record.date&&record.date<=cutoff&&(!start||record.date>=start)&&record.rank!=null);
 if(!valid.length)return null;
 const latest=valid.map(record=>record.date).sort().at(-1);
 return pickConfigRecord(valid.filter(record=>record.date===latest));
}

export function resolveBenchmarkModel(model,benchmarkIds,cutoff,start=null,snapshotDates=null){
 const records=Object.fromEntries(benchmarkIds.map(id=>[id,(model.records[id]||[]).filter(record=>!snapshotDates?.[id]||record.date===snapshotDates[id])]));
 const results=Object.fromEntries(benchmarkIds.map(id=>[id,chooseBenchmarkRecord(records[id],cutoff,start)]));
 const coverage=Object.values(results).filter(Boolean).length;
 const country=String(model.country||'').toLowerCase();
 return {...model,records,results,coverage,region:chinaCountries.has(country)?'china':'overseas',type:model.openWeights?'open':'closed'};
}

// 综合分列（v4 第 12 节）：数据来自 benchmarks.json 的 composite 字段；只给出列头元信息，不计入评测数量和覆盖数。
export const COMPOSITE_COLUMN_ID='__composite';
export function withCompositeColumn(data){
 const summary=data?.composite;
 if(!summary)return {...data,compositeColumn:null};
 return {...data,compositeColumn:{id:COMPOSITE_COLUMN_ID,date:summary.date,version:summary.version,benchmarks:summary.benchmarks.length,scored:summary.scored,ranked:summary.ranked,reference:summary.reference}};
}
// 综合分排序：进入排名的按名次，倒序只翻转它们；未进入排名或无分的始终在最后，再按发布日期、名称稳定排序。
export function compareComposite(a,b,direction='asc'){
 const x=Number.isFinite(a.composite?.rank)?a.composite.rank:null,y=Number.isFinite(b.composite?.rank)?b.composite.rank:null;
 if(x===null&&y===null)return (b.releaseDate||'').localeCompare(a.releaseDate||'')||String(a.name).localeCompare(String(b.name));
 if(x===null)return 1;
 if(y===null)return -1;
 return direction==='desc'?y-x:x-y;
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
 const current=criteria[0];
 return [{id,direction:current?.id===id&&current.direction==='asc'?'desc':'asc'}];
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

export function rankBenchmarkCoverage(data){
 if(!data)return[];
 const cutoff=data.generated_at.slice(0,10),benchmarks=data.benchmarks;
 const snapshots=Object.fromEntries(benchmarks.map(b=>[b.id,(b.snapshot_dates||[]).filter(date=>date<=cutoff).sort().at(-1)||null]));
 const models=data.models.map(model=>{
  const hits=benchmarks.flatMap(benchmark=>{
   const records=(model.records[benchmark.id]||[]).filter(record=>record.date&&record.date<=cutoff&&(!snapshots[benchmark.id]||record.date===snapshots[benchmark.id])&&Number.isFinite(record.rank)&&record.rank>0);
   return records.length?[{benchmark,recordCount:records.length}]:[];
  });
  return {...model,coverage:hits.length,hits};
 }).filter(model=>model.coverage>0).sort((a,b)=>b.coverage-a.coverage||(a.name.toLowerCase()<b.name.toLowerCase()?-1:a.name.toLowerCase()>b.name.toLowerCase()?1:a.id.localeCompare(b.id)));
 let position=0;
 return models.map((model,index)=>{if(!index||model.coverage!==models[index-1].coverage)position=index+1;return {...model,position};});
}

// 暂不在前台展示的评测：收录模型过少（个位数且缺少新模型），无法形成有效排名。数据仍照常抓取，覆盖量上来后可移出此名单。
export const HIDDEN_BENCHMARKS=new Set(['graphwalks','videommmu','osworld_2']);
// 评测列顺序：综合类排最前，其余按本页收录模型数从多到少排列（同类内也按收录数降序）
export function orderBenchmarks(data){
 if(!data?.benchmarks)return data;
 const lead=b=>b.category==='综合'?0:1;
 return {...data,benchmarks:data.benchmarks.filter(b=>!HIDDEN_BENCHMARKS.has(b.id)).sort((a,b)=>lead(a)-lead(b)||(b.model_count||0)-(a.model_count||0))};
}
