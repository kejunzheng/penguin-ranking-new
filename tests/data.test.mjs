import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {rankProjects,usageRows,priceValue} from '../src/data.js';import {copy} from '../src/copy.js';
test('positive net growth, stars then repository ID break ties',()=>{const rows=[{repositoryId:8,starGrowth:0,stars:9999},{repositoryId:7,starGrowth:12,stars:99},{repositoryId:3,starGrowth:12,stars:99},{repositoryId:2,starGrowth:12,stars:100},{repositoryId:9,starGrowth:-1,stars:1}];assert.deepEqual(rankProjects(rows).map(x=>x.repositoryId),[2,3,7]);assert.equal(rows.length,5)});
test('all nine project snapshots retain valid ranking order and English descriptions',()=>{for(const c of ['product','skill','dsh'])for(const p of ['daily','weekly','monthly']){const rows=JSON.parse(fs.readFileSync(`public/data/${c}/${p}.json`));assert.deepEqual(rankProjects(rows).map(r=>r.repositoryId),rows.map(r=>r.repositoryId));for(const r of rows){assert.ok(r.descriptionEn);assert.doesNotMatch(r.descriptionEn,/[\u4e00-\u9fff]/)}}});
test('usage excludes incomplete week, sums selected observations, preserves missing values',()=>{const d={weeks:[['2026-08-17','f',100],['2026-08-24','f',100],['2026-08-31','i',100]],models:[{id:'a'},{id:'b'}],points:[[0,0,10],[1,0,15],[1,1,40],[2,0,99999]]};const r=usageRows(d,2);assert.equal(r.end,1);assert.equal(r.rows[0].id,'b');assert.equal(r.rows[0].total,40);assert.deepEqual(r.rows[0].values,[null,40]);assert.equal(r.rows[1].total,25)});
test('prices use source currency figures, retain free and missing values',()=>{const r={latest:{input_usd:0,input_cny:0,output_cny:4}};assert.equal(priceValue(r,'USD','input'),0);assert.equal(priceValue(r,'USD','output'),null);assert.equal(priceValue(r,'CNY','output'),4)});
test('English and Chinese dictionaries have matching complete keys',()=>{assert.deepEqual(Object.keys(copy.en).sort(),Object.keys(copy.zh).sort());for(const locale of Object.values(copy))for(const v of Object.values(locale))assert.ok(v.length>0)});
test('model snapshot has real timestamps and complete weeks',()=>{const data=JSON.parse(fs.readFileSync('public/data/models.json'));assert.ok(Date.parse(data.generated_at));for(const count of [4,12,26]){const r=usageRows(data.trends,count);assert.equal(r.weeks.length,count);assert.ok(r.weeks.every(w=>w[1]==='f'))}});
import {usageWindow,stackRows,weekEnd} from '../src/usage-data.js';
import {blendedPrice,priceHistory} from '../src/price-details.js';
test('usage ranges preserve incomplete weeks, align custom weeks, and compare prior complete week',()=>{
 const d={updated_at:'2026-09-08',weeks:[['2026-08-24','f',100],['2026-08-31','f',120],['2026-09-07','i',10]],models:[{id:'a'},{id:'a:free'}],points:[[0,0,40],[1,0,60],[2,1,5]]};
 const w=usageWindow(d,'1w');assert.equal(w.platformTotal,120);assert.equal(w.growth,.2);assert.equal(w.from,'2026-08-31');assert.equal(w.to,'2026-09-06');
 const m=usageWindow(d,'1m');assert.equal(m.platformTotal,230);assert.equal(m.to,'2026-09-08');assert.deepEqual(m.rows[1].values,[null,null,5]);
 const c=usageWindow(d,'custom',{from:'2026-09-02',to:'2026-09-03'});assert.equal(c.from,'2026-08-31');assert.equal(c.weeks.length,1);
 assert.equal(usageWindow(d,'custom',{from:'2026-09-03',to:'2026-09-02'}).invalid,true);assert.equal(weekEnd('2025-12-29'),'2026-01-04');
});
test('every stacked week reconciles with platform total across all presets',()=>{
 const d=JSON.parse(fs.readFileSync('public/data/models.json')).trends;
 for(const preset of ['1w','1m','3m','6m','1y']){const w=usageWindow(d,preset),s=stackRows(w);w.weeks.forEach((week,i)=>assert.equal(s.top.reduce((a,r)=>a+(r.values[i]??0),0)+s.others[i],week[2]));}
});
test('blended price and 30-day history preserve zero and unknown values',()=>{
 assert.equal(blendedPrice(1,5),2);assert.equal(blendedPrice(0,0),0);assert.equal(blendedPrice(null,5),null);
 const m={latest:{date:'2026-01-10'},history:[['2025-12-11',5,5],['2025-12-12',0,null],['2026-01-10',7,14],['2026-01-11',9,9]]};
 assert.deepEqual(priceHistory(m,'USD',7),[{date:'2025-12-12',input:0,output:null},{date:'2026-01-10',input:1,output:2}]);assert.equal(priceHistory(m,'USD',0)[1].input,null);
});
test('project logos cover every bundled ranking and reference existing local assets',()=>{
 const manifest=JSON.parse(fs.readFileSync('public/assets/projects/manifest.json'));
 for(const c of ['product','skill','dsh'])for(const p of ['daily','weekly','monthly'])for(const row of JSON.parse(fs.readFileSync(`public/data/${c}/${p}.json`))){assert.ok(manifest[row.fullName]);assert.ok(fs.existsSync('public/'+manifest[row.fullName].file));}
});
test('global official prices retain native currency, provenance and dated observations',()=>{
 const d=JSON.parse(fs.readFileSync('public/data/global-prices.json'));
 assert.equal(d.source,'official');assert.ok(Date.parse(d.updated_at));assert.ok(d.models.length>100);
 assert.equal(new Set(d.models.map(r=>r.slug)).size,d.models.length);
 for(const r of d.models){assert.equal(r.source,'official');assert.equal(r.price_scope,'global');assert.match(r.price_source_url,/^https:\/\//);assert.ok(!r.price_source_url.includes('openrouter'));assert.ok(['USD','CNY'].includes(r.billing_currency));
  for(const k of ['input','output']){assert.ok(Number.isFinite(r.latest[k+'_usd'])&&r.latest[k+'_usd']>=0);assert.ok(Math.abs(r.latest[k+'_cny']-r.latest[k+'_usd']*d.usd_to_cny)<0.000001)}
  assert.equal(r.history_currency,r.billing_currency);assert.ok(r.history.length);assert.equal(r.history.at(-1)[0],r.latest.date);
 }
});

import {paginatePrices} from '../src/data.js';
test('price pagination covers every result once and clamps shorter or empty result sets',()=>{
 const rows=Array.from({length:426},(_,id)=>({id}));
 const pages=Array.from({length:22},(_,i)=>paginatePrices(rows,i+1));
 assert.deepEqual(pages.flatMap(p=>p.rows),rows);assert.equal(pages[0].rows.length,20);assert.equal(pages.at(-1).rows.length,6);
 assert.equal(paginatePrices(rows.slice(0,3),22).page,1);assert.equal(paginatePrices(rows,-1).page,1);
 const empty=paginatePrices([],22);assert.equal(empty.page,1);assert.equal(empty.end,0);assert.deepEqual(empty.rows,[]);
});

import {modelBrand} from '../src/model-brand.js';
test('mapped model brands reference local assets and Kimi remains visible on light surfaces',()=>{
 const data=JSON.parse(fs.readFileSync('public/data/models.json'));
 const global=JSON.parse(fs.readFileSync('public/data/global-prices.json'));
 for(const model of [...data.trends.models,...data.prices.models,...global.models]){
  const brand=modelBrand(model);if(brand)assert.ok(fs.existsSync(`public/assets/models/${brand.file}`),`${model.name}: ${brand.file}`);
 }
 for(const provider of ['moonshot','moonshotai'])assert.equal(modelBrand({provider}).file,'kimi-color.svg');
 const kimi=fs.readFileSync('public/assets/models/kimi-color.svg','utf8');assert.match(kimi,/fill="#111111"/);assert.match(kimi,/fill="#1783FF"/);
 for(const provider of ['mistralai','cohere','bytedance-seed','baidu','microsoft'])assert.ok(modelBrand({provider}));
 assert.equal(modelBrand({provider:'stealth'}),null);
});
