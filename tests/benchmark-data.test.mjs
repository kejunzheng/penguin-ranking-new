import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {benchmarkCutoff,chooseBenchmarkRecord,filterBenchmarkModels,resolveBenchmarkModel} from '../src/benchmark-data.js';

test('benchmark snapshot presets calculate stable UTC cutoffs',()=>{
 assert.equal(benchmarkCutoff('2026-09-21','latest'),'2026-09-21');
 assert.equal(benchmarkCutoff('2026-09-21','week'),'2026-09-14');
 assert.equal(benchmarkCutoff('2026-09-21','month'),'2026-08-22');
 assert.equal(benchmarkCutoff('2026-09-21','quarter'),'2026-06-23');
 assert.equal(benchmarkCutoff('2026-09-21','custom','2026-08-01'),'2026-08-01');
});

test('record selection respects cutoff and prefers standard configuration',()=>{
 const records=[
  {date:'2026-09-21',rank:2,config:'工具增强'},
  {date:'2026-09-21',rank:5,config:'标准/未注明'},
  {date:'2026-07-10',rank:1,config:'标准/未注明'}
 ];
 assert.equal(chooseBenchmarkRecord(records,'2026-09-21').rank,5);
 assert.equal(chooseBenchmarkRecord(records,'2026-08-01').rank,1);
 assert.equal(chooseBenchmarkRecord(records,'2026-09-21','2026-09-15').rank,5);
 assert.equal(chooseBenchmarkRecord(records,'2026-09-20','2026-09-15'),null);
 assert.equal(chooseBenchmarkRecord(records,'2026-01-01'),null);
});

test('bundled benchmark data has 24 benchmarks and current ranked models',()=>{
 const data=JSON.parse(fs.readFileSync('public/data/benchmarks.json','utf8'));
 assert.equal(data.benchmarks.length,24);
 assert.ok(data.generated_at.slice(0,10)>='2026-09-29');
 assert.ok(data.benchmarks.every(item=>/^\d{4}-\d{2}-\d{2}$/.test(item.latest_date)),'every benchmark exposes its source snapshot date');
 assert.ok(data.models.length>=300);
 const ids=data.benchmarks.map(item=>item.id);
 assert.ok(ids.includes('deepswe')&&ids.includes('frontiercode'));
 assert.ok(['graphwalks','chartography','agents_last_exam'].every(id=>ids.includes(id)));
 assert.ok(!ids.includes('livecodebench')&&!ids.includes('aider_polyglot'));
 assert.ok(['mathvista','androidworld','ruler'].every(id=>!ids.includes(id)),'empty benchmarks are retired');
 assert.ok(data.benchmarks.every(item=>item.model_count>0),'every listed benchmark has on-site results');
 assert.ok(data.models.every(model=>!/^Claude [4-9](?:\.\d+)? (?:Haiku|Sonnet|Opus)$/.test(model.name)),'Claude 4+ names use the official family-first form');
 assert.ok(data.models.every(model=>!/^gpt[ -]\d|^GPT \d/i.test(model.name)||/^GPT-\d/.test(model.name)),'GPT names use the official hyphenated form');
 assert.ok(data.models.every(model=>!/^deepseek /.test(model.name)),'DeepSeek names keep official capitalisation');
 const gaiaRanks=data.models.flatMap(model=>(model.records.gaia||[]).map(record=>record.rank)).sort((a,b)=>a-b);
 assert.ok(gaiaRanks.length&&gaiaRanks[0]===1&&gaiaRanks.at(-1)<=gaiaRanks.length,'GAIA ranks are re-ranked among tracked models');
 for(const id of ['deepswe','frontiercode'])assert.ok(data.benchmarks.find(item=>item.id===id).model_count>=5,`${id} has live ranked models`);
 assert.ok(data.models.every(model=>!model.records.livecodebench&&!model.records.aider_polyglot),'retired scores do not contribute to coverage');
 const resolved=data.models.map(model=>resolveBenchmarkModel(model,ids,data.generated_at.slice(0,10)));
 assert.ok(filterBenchmarkModels(resolved,{type:'all',region:'all',coverage:'all'}).length>200);
 assert.ok(resolved.some(model=>model.region==='china'));
 assert.ok(resolved.some(model=>model.type==='open'));
 // 实时抓取后，近 45 天发布的新模型应已带有 AA 智能指数名次（不再依赖手工补录的固定名次）。
 const recentCutoff=new Date(Date.parse(data.generated_at)-45*864e5).toISOString().slice(0,10);
 const recent=resolved.filter(model=>(model.releaseDate||'')>=recentCutoff&&model.results.aa_intelligence_index?.rank);
 assert.ok(recent.length>=3,'recent models carry live AA ranks');
 assert.equal(new Set(data.models.map(model=>model.id)).size,data.models.length,'model ids are unique');
});
