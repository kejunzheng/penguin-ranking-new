// 全球价格榜：第一方官网标准文本 Token 报价，与国内榜共享已核验的厂商官网数据。
import path from 'node:path';
import { dataDir, getText, readJson, reportFreshness, stateFile, writeJsonIfChanged } from './lib/net.mjs';
import { GLOBAL_PRICE_SOURCES } from './lib/global-price-sources.mjs';
const target = path.join(dataDir,'global-prices.json'), previous = readJson(target,{models:[]});
const china = readJson(path.join(dataDir,'models.json'))?.prices;
const rate = china?.usd_to_cny || previous.usd_to_cny;
if (!(rate > 0)) throw new Error('缺少美元兑人民币汇率');
const checkedAt = new Date().toISOString(), date = checkedAt.slice(0,10);
if(previous.source!=='official' && previous.models.length)writeJsonIfChanged(stateFile('global-channel-archive.json'),previous);
const archive = readJson(stateFile('global-channel-archive.json'),{models:[]});
const old = new Map(previous.models.filter(m=>m.source==='official').map(m=>[m.slug,m]));
const sources=[], models=[];
const history = (model,input,output,currency,observationDate=date) => [...(old.get(model)?.billing_currency===currency ? old.get(model)?.history || [] : []).filter(r=>r[0]!==observationDate),[observationDate,input,output]].slice(-90);
// 网络独立，批量抓取；厂商之间互不影响。
const results = await Promise.allSettled(GLOBAL_PRICE_SOURCES.map(async source=>{
  const text = await getText(source.fetchUrl||source.url,{timeout:30000,retries:2,headers:{'accept-language':'en-US,en;q=0.9'}});
  const rows = source.parse(text,new Date(checkedAt));
  if(!rows.length)throw new Error('未解析到可验证的第一方文本 Token 单价');
  const prior = previous.models.filter(m=>m.source==='official' && m.provider===source.provider);
  if(prior.length>4 && rows.length<prior.length*.5)throw new Error(`官网结构变化：模型数由 ${prior.length} 降至 ${rows.length}，保留上次核验价格`);
  return rows;
}));
for(let index=0;index<GLOBAL_PRICE_SOURCES.length;index++){
  const source=GLOBAL_PRICE_SOURCES[index], result=results[index];
  if(result.status==='rejected'){
    const retained=previous.models.filter(m=>m.source==='official'&&m.provider===source.provider);
    models.push(...retained.map(m=>({...m,price_check_status:'failed',status_note:'抓取失败，保留上次官网价格'})));
    const last=previous.official_sources?.find(s=>s.provider===source.provider);
    sources.push({provider:source.provider,name:source.name,url:source.url,status:'failed',checked_at:last?.checked_at||null,attempted_at:checkedAt,models:retained.length,note:result.reason.message});
    continue;
  }
  for(const row of result.value){
    const model=source.provider+'/'+row.id;
    models.push({slug:model,name:row.name||row.id,provider:source.provider,provider_name:source.name,category:'general',context_length:row.context??null,is_open_source:null,supports_tools:null,supports_vision:null,release_date:null,status:'active',has_price_tiers:Boolean(row.tiered),price_tier_label:row.tier||'Standard',price_note:row.note||null,latest:{date,input_usd:row.input,output_usd:row.output,input_cny:row.input*rate,output_cny:row.output*rate},history:history(model,row.input,row.output,'USD'),history_currency:'USD',billing_currency:'USD',price_scope:'global',price_check_status:'verified',source:'official',source_url:source.url,price_source_url:source.url,official_checked_at:checkedAt});
  }
  sources.push({provider:source.provider,name:source.name,url:source.url,status:'verified',checked_at:checkedAt,models:result.value.length});
}
for(const source of china?.official_sources||[]){
  const current=china.models.filter(m=>m.provider===source.provider && m.status==='active' && m.price_source_url);
  const fresh=source.status==='verified' && source.checked_at?.slice(0,10)===date;
  const retained=source.status==='verified'?current:previous.models.filter(m=>m.source==='official'&&m.provider===source.provider);
  for(const row of retained){
    if(row.price_scope==='global'){models.push({...row,price_check_status:'failed'});continue;}
    const input=row.latest.input_cny,output=row.latest.output_cny;
    if(!Number.isFinite(input)||!Number.isFinite(output))continue;
    const model=source.provider+'/'+row.slug;
    models.push({...row,slug:model,latest:{...row.latest,input_usd:input/rate,output_usd:output/rate},history:history(model,input,output,'CNY',row.latest.date),history_currency:'CNY',billing_currency:'CNY',price_scope:'global',price_check_status:fresh?'verified':'cached',price_note:'中国区域官方人民币价格；USD 为参考汇率换算。',source:'official',source_url:source.url,official_checked_at:source.checked_at});
  }
  sources.push({provider:source.provider,name:current[0]?.provider_name||source.provider,url:source.url,status:fresh?'verified':'cached',checked_at:source.checked_at,models:retained.length,note:fresh?null:'国内官网数据未在今天核验，保留原核验日期'});
}
if(models.length<50 || !sources.some(s=>s.provider==='openai'&&s.status==='verified') && !previous.models.some(m=>m.source==='official'&&m.provider==='openai'))throw new Error('全球官网价格覆盖不足，保留旧文件');
const aliases={'moonshotai':'moonshot','z-ai':'zhipu','tencent':'hunyuan','bytedance-seed':'doubao','stepfun':'step'};
const covered=new Set(sources.filter(s=>s.status==='verified').map(s=>s.provider));
const providerCounts=new Map();for(const row of archive.models)providerCounts.set(row.provider,(providerCounts.get(row.provider)||0)+1);
const notes={mistralai:'官方定价文档在当前抓取链路连接失败，未用渠道报价替代。',amazon:'官网价格依赖区域与动态计价接口，当前未取得可验证的 Amazon Nova 标准 Token 报价。',rekaai:'官方文档要求通过 Models API 获取价格，接口返回 401，需要 API key。',morph:'定价页返回 429；公开文档目前取得的是按事件收费，无法当作文本 Token 报价。',relace:'官方 Models 价格接口需要账户访问，尚未取得可验证的公开报价。',inception:'官网报价卡片链接至 OpenRouter，未核验到第一方 API 对应的独立定价。'};
const missing=[...providerCounts].filter(([p])=>!covered.has(aliases[p]||p)).map(([provider,count])=>({provider,previous_channel_models:count,note:notes[provider]||sources.find(s=>s.provider===provider)?.note||'尚未取得并适配可验证的厂商第一方文本 Token 报价，未收录。'}));
// 币种换算使用同一参考汇率，保留失败厂商的原币种价格和原观测日期。
for(const m of models){if(m.billing_currency==='USD'){m.latest.input_cny=m.latest.input_usd*rate;m.latest.output_cny=m.latest.output_usd*rate;}else{m.latest.input_usd=m.latest.input_cny/rate;m.latest.output_usd=m.latest.output_cny/rate;}}
const output={source:'official',updated_at:checkedAt,official_checked_at:checkedAt,official_check_status:sources.every(s=>s.status==='verified')?'verified':'partial',source_urls:sources.map(s=>s.url),official_sources:sources,coverage:{included_providers:new Set(models.map(m=>m.provider)).size,models:models.length,missing_providers:missing},usd_to_cny:rate,exchange_rate_updated_at:china.exchange_rate_updated_at,exchange_rate_note:'保留厂商原计价币种；另一币种按参考汇率换算，官网地区、档位及额外费用见模型来源。',models};
writeJsonIfChanged(target,output);
console.log(`GLOBAL_PRICES_UPDATED official_providers=${output.coverage.included_providers} models=${models.length} verified=${sources.filter(s=>s.status==='verified').length}/${sources.length} date=${date}`);
reportFreshness(sources.map(s=>({dataset:'全球模型价格 · '+s.name,file:'data/global-prices.json',source:s.url,mode:s.status==='verified'?'live':s.status==='failed'?'failed':'frozen',latest:s.checked_at,models:s.models,note:s.note||null})));
