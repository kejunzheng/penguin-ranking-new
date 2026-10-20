import {createModelPoster,siteUrl} from './share-poster';
import {usageProfile} from './usage-profile';
import {modelPrices} from './price-details';
import {modelBrand} from './model-brand';
import {assetUrl} from './asset-url';
import {domainLabel} from './domains';
import {brandLine,dataDay} from './poster-date';

// 模型档案分享图：能力 / 调用 / 价格三块各取关键指标；没进某个榜就写明“暂未进入”。
const short=n=>n==null?'—':new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(n);
const pct=n=>n==null?null:`${n>0?'+':''}${(n*100).toFixed(1)}%`;

// 二维码深链：?page=home&model=<c|u|p>:<id>&tab=<capability|usage|price>，App 加载后自动打开该模型档案
export function profileLink({capabilityModel,usageModel,priceModel,tab,lang}){
 // OpenRouter 价格只在价格榜页加载，这类模型的链接落到价格榜（全球）页
 const pick={capability:capabilityModel&&['c',capabilityModel.id],usage:usageModel&&['u',usageModel.id],price:priceModel&&[priceModel.price_scope==='openrouter'?'o':'p',priceModel.slug]};
 const [kind,id]=pick[tab]||pick.usage||pick.price||pick.capability;
 return siteUrl(kind==='o'?{page:'pricing',scope:'global',lang,model:`${kind}:${id}`,tab}:{page:'home',lang,model:`${kind}:${id}`,tab});
}

export async function createProfilePoster({capabilityModel,benchmarks,usageModel,priceModel,trends,priceMeta,currency,lang,tab}){
 const zh=lang==='zh';
 const name=capabilityModel?.name||usageModel?.name||priceModel?.name||'';
 const logoSource=usageModel||priceModel||(capabilityModel&&{name:capabilityModel.name,author:String(capabilityModel.organization||'').toLowerCase(),provider_name:capabilityModel.organization});
 const brand=logoSource&&modelBrand(logoSource);
 const org=capabilityModel?.organization||priceModel?.provider_name||usageModel?.provider;
 const open=capabilityModel?capabilityModel.openWeights:priceModel?.is_open_source;
 const meta=[org,open==null?null:open?(zh?'开放权重':'Open weights'):(zh?'闭源':'Closed')].filter(Boolean).join(' · ');
 const blocks=[];

 // 能力
 const c=capabilityModel?.composite;
 if(c&&benchmarks){
  const [low,high]=c.score_range||[];
  blocks.push({title:zh?'能力档案':'Capability',metrics:[
   [zh?'综合分':'Composite score',c.score.toFixed(1),low!=null?(zh?`区间 ${low.toFixed(1)}–${high.toFixed(1)}`:`Range ${low.toFixed(1)}–${high.toFixed(1)}`):null],
   [zh?'综合名次':'Composite rank',`#${c.rank}`,c.date||null],
   [zh?'计入综合分的评测':'Benchmarks in composite',String(c.benchmarks),null],
   [zh?'覆盖领域':'Domains',`${c.domains}/${Object.keys(c.domain_scores||{}).length||6}`,null],
  ],bars:Object.entries(c.domain_scores||{}).map(([d,score])=>[domainLabel(d,zh),score])});
 }else{
  const count=capabilityModel?Object.values(capabilityModel.records||{}).filter(list=>list?.length).length:0;
  blocks.push({title:zh?'能力档案':'Capability',empty:count?(zh?`暂未进入综合榜，已有 ${count} 项单项评测成绩`:`Not in the composite yet; ${count} individual benchmark results`):(zh?'暂未进入能力榜':'Not in the capability ranking yet')});
 }

 // 调用
 if(usageModel&&trends){
  const p=usageProfile(trends,usageModel.id);
  if(p.latest?.value!=null)blocks.push({title:zh?'调用档案':'Usage',metrics:[
   [zh?'上周调用量':'Last complete week',short(p.latest.value)+' Tokens',p.latest.date],
   [zh?'上周排名':'Last week rank',p.latest.rank?`#${p.latest.rank}`:'—',p.rankChange?(zh?`较前周 ${p.rankChange>0?'↑':'↓'}${Math.abs(p.rankChange)}`:`Vs previous ${p.rankChange>0?'↑':'↓'}${Math.abs(p.rankChange)}`):null],
   [zh?'环比':'Week over week',pct(p.growth)||'—',null],
   [zh?'份额':'Share',p.latest.share!=null?p.latest.share.toFixed(1)+'%':'—',null],
  ]});
  else if(p.lastDay)blocks.push({title:zh?'调用档案':'Usage',metrics:[
   [zh?'最近一日调用量':'Latest daily usage',short(p.lastDay.value)+' Tokens',p.lastDay.date],
   [zh?'本周至今':'This week so far',p.ongoing?short(p.ongoing.value)+' Tokens':'—',zh?'新上榜 · 完整周结束后更新排名':'New entry · rank after a full week'],
  ]});
  else blocks.push({title:zh?'调用档案':'Usage',empty:zh?'暂无完整周观测':'No complete-week observations'});
 }else blocks.push({title:zh?'调用档案':'Usage',empty:zh?'暂未进入调用榜':'Not in the usage ranking yet'});

 // 价格
 if(priceModel&&priceMeta){
  let cur=currency,prices=modelPrices(priceModel,cur);
  if(prices.input==null&&prices.output==null){cur=cur==='USD'?'CNY':'USD';prices=modelPrices(priceModel,cur);}
  const money=n=>n==null?'—':n===0?(zh?'免费':'Free'):new Intl.NumberFormat(zh?'zh-CN':'en-US',{style:'currency',currency:cur,minimumFractionDigits:2,maximumFractionDigits:4}).format(n);
  const unit=zh?'每百万 Token':'Per million tokens';
  blocks.push({title:zh?'价格档案':'Pricing',metrics:[[zh?'输入价格':'Input',money(prices.input),unit],[zh?'输出价格':'Output',money(prices.output),unit],[zh?'综合价格':'Blended',money(prices.blended),zh?'输入 : 输出 = 3 : 1':'Input : output = 3 : 1']]});
 }else blocks.push({title:zh?'价格档案':'Pricing',empty:zh?'暂未收录价格':'Pricing not listed yet'});

 // 当前查看的档案排在最前
 const order={capability:0,usage:1,price:2},first=order[tab]??1;
 const sorted=[blocks[first],...blocks.filter((_,i)=>i!==first)];
 // 底部来源按实际出现的数据块写，价格来源取决于该模型的价格数据集
 const has=title=>sorted.some(b=>b.title===title&&!b.empty);
 const scope=priceModel?.price_scope;
 const priceSource=scope==='openrouter'?(zh?'价格：OpenRouter 平台标价（美元）':'Pricing: OpenRouter platform list prices (USD)'):scope==='global'?(zh?'价格：厂商官网 API 定价':'Pricing: official provider API pricing pages'):(zh?'价格：中国厂商官网 API 定价（人民币）':'Pricing: China providers’ official API pricing (CNY)');
 const sources=[
  [has(zh?'能力档案':'Capability')&&(zh?'能力：各项公开评测榜单（官方及第三方）名次汇总':'Capability: official & third-party leaderboard ranks'),has(zh?'调用档案':'Usage')&&(zh?'调用：OpenRouter 公开榜单':'Usage: OpenRouter rankings')].filter(Boolean).join(' · '),
  has(zh?'价格档案':'Pricing')&&priceSource,
 ].filter(Boolean);
 // 数据日期：各块日期相同就写一个，不同就分开写
 const dates=[has(zh?'能力档案':'Capability')&&[zh?'能力':'capability',dataDay(c?.date)],has(zh?'调用档案':'Usage')&&[zh?'调用':'usage',dataDay(trends?.updated_at)],has(zh?'价格档案':'Pricing')&&[zh?'价格':'pricing',dataDay(priceMeta?.updated_at)]].filter(d=>d&&d[1]);
 const asOf=new Set(dates.map(d=>d[1])).size<=1?dates[0]?.[1]:dates.map(([k,d])=>`${k} ${d}`).join(zh?'，':', ');
 return createModelPoster({lang,name,meta,logo:brand?assetUrl('assets/models/'+brand.file):null,fallback:name,blocks:sorted,
  qrUrl:profileLink({capabilityModel,usageModel,priceModel,tab,lang}),
  notes:[...sources,brandLine(lang,asOf)]});
}
