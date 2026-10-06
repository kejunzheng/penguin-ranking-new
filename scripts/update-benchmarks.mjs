import {readFile,writeFile} from 'node:fs/promises';

const repository='https://raw.githubusercontent.com/kejunzheng/penguin-model-capability-ranking/main/data';
const headers={'user-agent':'PenguinIndex/1.0 (+https://yonge6.github.io/penguin-index/)'};
const aaRecord=(rank,score,source,config)=>({date:'2026-10-05',runDate:'2026-10-05',rank,score,source,config});
const verifiedRecent={
 generated_at:'2026-10-05T00:00:00Z',
 models:[
  {
   id:'ling-3-1-flash',name:'Ling 3.1 Flash',organization:'InclusionAI',country:'China',openWeights:true,releaseDate:'2026-10-01',
   records:{aa_intelligence_index:[aaRecord(5,41,'https://artificialanalysis.ai/models/ling-3-1-flash','标准/未注明')]},
  },
  {
   id:'gemini-4-argon-high',name:'Gemini 4 Argon High',organization:'Google DeepMind',country:'United States of America',openWeights:false,releaseDate:'2026-09-30',
   records:{aa_intelligence_index:[aaRecord(8,53,'https://artificialanalysis.ai/models/gemini-4-argon','High')]},
  },
  {
   id:'gpt-6-1-sol-high',name:'GPT-6.1 Sol High',organization:'OpenAI',country:'United States of America',openWeights:false,releaseDate:'2026-09-29',
   records:{aa_intelligence_index:[{date:'2026-09-29',runDate:'2026-09-29',rank:17,score:50,source:'https://artificialanalysis.ai/models/gpt-6-1-sol-high',config:'High'}]},
  },
  {
   id:'claude-sonnet-5-5-max',name:'Claude Sonnet 5.5 Max',organization:'Anthropic',country:'United States of America',openWeights:false,releaseDate:'2026-09-28',
   records:{aa_intelligence_index:[aaRecord(2,56,'https://artificialanalysis.ai/models/claude-sonnet-5-5','Max')]},
  },
  {
   id:'claude-opus-5-5-max',name:'Claude Opus 5.5 Max',organization:'Anthropic',country:'United States of America',openWeights:false,releaseDate:'2026-09-22',
   records:{aa_intelligence_index:[aaRecord(1,58,'https://artificialanalysis.ai/models/claude-opus-5-5','Max')]},
  },
  {
   id:'grok-4-7-xhigh',name:'Grok 4.7 xHigh',organization:'xAI',country:'United States of America',openWeights:false,releaseDate:'2026-09-21',
   records:{aa_intelligence_index:[aaRecord(29,46,'https://artificialanalysis.ai/models/grok-4-7','xHigh')]},
  },
  {
   id:'mimo-v2-6-pro',name:'MiMo-V2.6-Pro',organization:'Xiaomi',country:'China',openWeights:true,releaseDate:'2026-09-21',
   records:{aa_intelligence_index:[aaRecord(1,46,'https://artificialanalysis.ai/models/mimo-v2-6-pro','标准/未注明')]},
  },
  {
   id:'deepseek-v4-1-flash-max',name:'DeepSeek V4.1 Flash Max',organization:'DeepSeek',country:'China',openWeights:true,releaseDate:'2026-09-10',
   records:{aa_intelligence_index:[aaRecord(8,39,'https://artificialanalysis.ai/models/deepseek-v4-1-flash','Max')]},
  },
  {
   id:'muse-spark-1-3-max',name:'Muse Spark 1.3 Max',organization:'Meta',country:'United States of America',openWeights:false,releaseDate:'2026-09-02',
   records:{aa_intelligence_index:[aaRecord(23,48,'https://artificialanalysis.ai/models/muse-spark-1-3','Max')]},
  },
 ],
};

async function read(name){
 const response=await fetch(`${repository}/${name}`,{headers});
 if(!response.ok)throw new Error(`${response.status} ${name}`);
 return response.json();
}

const [benchmarkPayload,skus,evaluationRecords,snapshots]=await Promise.all([
 read('benchmarks.json'),
 read('model_skus.json'),
 read('evaluation_records.json'),
 read('leaderboard_snapshots.json'),
]);

const recordsById=new Map(evaluationRecords.map(record=>[record.record_id,record]));
const snapshotsById=new Map(snapshots.map(snapshot=>[snapshot.snapshot_id,snapshot]));
const eligibleSkus=skus.filter(sku=>sku.homepage_eligible);

const snapshotDate=record=>snapshotsById.get(record.snapshot_id)?.snapshot_at?.slice(0,10)||record.run_date||null;
const benchmarks=benchmarkPayload.benchmarks.map(benchmark=>{
 const dates=evaluationRecords.filter(record=>record.benchmark_id===benchmark.id).map(snapshotDate).filter(Boolean);
 const recentDates=verifiedRecent.models.flatMap(model=>(model.records[benchmark.id]||[]).map(record=>record.date));
 const modelIds=new Set(eligibleSkus.filter(sku=>sku.benchmark_ids.includes(benchmark.id)).map(sku=>sku.sku_id));
 verifiedRecent.models.filter(model=>model.records[benchmark.id]?.length).forEach(model=>modelIds.add(model.id));
 return {...benchmark,latest_date:[...dates,...recentDates].filter(Boolean).sort().at(-1)||benchmarkPayload.generated_at.slice(0,10),model_count:modelIds.size};
});

const models=eligibleSkus.map(sku=>{
 const records={};
 for(const recordId of sku.record_ids){
  const record=recordsById.get(recordId);
  if(!record)continue;
  (records[record.benchmark_id]??=[]).push({
   date:snapshotDate(record),
   rank:record.rank,
   source:record.source_url,
   config:sku.record_configurations[recordId]||'标准/未注明',
  });
 }
 for(const entries of Object.values(records))entries.sort((a,b)=>(a.rank??Number.MAX_SAFE_INTEGER)-(b.rank??Number.MAX_SAFE_INTEGER));
 return {id:sku.sku_id,name:sku.display_name,organization:sku.organization,country:sku.organization_country,openWeights:sku.open_weights,releaseDate:sku.model_release_date,records};
});

const recentById=new Map(verifiedRecent.models.map(model=>[model.id,model]));
const mergedModels=models.map(model=>{
 const recent=recentById.get(model.id);
 if(!recent)return model;
 recentById.delete(model.id);
 return {...model,...recent,records:{...model.records,...recent.records}};
});
// 精简输出：前台只读取 date / rank / config / source。
// - 删除 runDate、score（前台未使用；原始分数仍可在上游仓库查询）；
// - source 与该 benchmark 的 official_url 相同时省略，前台本就以 official_url 兜底（result.source||benchmark.official_url）。
const officialUrlById=new Map(benchmarks.map(benchmark=>[benchmark.id,benchmark.official_url]));
const compactRecords=model=>({...model,records:Object.fromEntries(Object.entries(model.records).map(([benchmarkId,entries])=>[benchmarkId,entries.map(({runDate,score,...entry})=>entry.source&&entry.source===officialUrlById.get(benchmarkId)?(({source,...rest})=>rest)(entry):entry)]))});
const generatedAt=[benchmarkPayload.generated_at,verifiedRecent.generated_at].sort().at(-1);
const output={schema_version:'1.0',generated_at:generatedAt,source_repository:'https://github.com/kejunzheng/penguin-model-capability-ranking',source_page:'https://kejunzheng.github.io/penguin-model-capability-ranking/',benchmarks,models:[...mergedModels,...recentById.values()].map(compactRecords)};
// 定时任务保护：上游异常时直接失败，保留旧快照。
if(benchmarks.length<10||output.models.length<100)throw new Error(`Benchmark 数据过少：benchmarks=${benchmarks.length} models=${output.models.length}`);
const target=new URL('../public/data/benchmarks.json',import.meta.url);
let unchanged=false;
try {
  const current=JSON.parse(await readFile(target,'utf8'));
  unchanged=JSON.stringify(current)===JSON.stringify(output);
} catch {}
if(!unchanged) await writeFile(target,JSON.stringify(output));
console.log(`BENCHMARKS_${unchanged?'UNCHANGED':'UPDATED'} generated_at=${output.generated_at} benchmarks=${benchmarks.length} models=${output.models.length} records=${evaluationRecords.length}`);
