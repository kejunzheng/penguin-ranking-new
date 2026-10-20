import {useEffect,useRef,useState} from 'react';
import {XIcon} from '@phosphor-icons/react';
import PriceDetails from './PriceDetails';
import UsageProfile from './UsageProfile';
import CapabilityProfile from './CapabilityProfile';
import {HIDDEN_BENCHMARKS} from './benchmark-data';
import {domainLabel} from './domains';
import PosterShare from './PosterShare';

export default function ModelProfileDialog({capabilityModel,benchmarks,composite,usageModel,priceModel,initialTab='usage',trends,lang,currency,onCurrency,priceMeta,onClose}){
 const zh=lang==='zh',dialog=useRef(null),[tab,setTab]=useState(initialTab);
 useEffect(()=>{setTab(initialTab)},[initialTab,capabilityModel?.id,usageModel?.id,priceModel?.slug]);
 useEffect(()=>{const active=document.activeElement,old=document.body.style.overflow;document.body.style.overflow='hidden';dialog.current?.showModal();return()=>{document.body.style.overflow=old;active?.focus()}},[]);
 const usageAvailable=Boolean(usageModel&&trends),priceAvailable=Boolean(priceModel&&priceMeta);
 const capabilityAvailable=Boolean(capabilityModel&&benchmarks),selectedAvailable=tab==='capability'?capabilityAvailable:tab==='usage'?usageAvailable:priceAvailable;
 return <dialog ref={dialog} className="model-profile-dialog" aria-labelledby="model-profile-title" onCancel={onClose} onClick={event=>{if(event.target===dialog.current)onClose()}}>
  <header className="model-profile-top">
   <nav className="model-profile-tabs" aria-label={zh?'模型档案类型':'Model profile type'}>
    <button aria-pressed={tab==='capability'} onClick={()=>setTab('capability')}>{zh?'能力档案':<>Capability<span className="model-profile-tab-suffix"> profile</span></>}</button>
    <button aria-pressed={tab==='usage'} onClick={()=>setTab('usage')}>{zh?'调用档案':<>Usage<span className="model-profile-tab-suffix"> profile</span></>}</button>
    <button aria-pressed={tab==='price'} onClick={()=>setTab('price')}>{zh?'价格档案':<>Pricing<span className="model-profile-tab-suffix"> profile</span></>}</button>
   </nav>
   <PosterShare lang={lang} className="model-profile-share" label={zh?'生成模型档案分享图':'Create model profile share image'} fileName={`penguin-model-${String(capabilityModel?.name||usageModel?.name||priceModel?.name||'profile').replace(/[^\w.-]+/g,'-')}.png`} build={async()=>{const {createProfilePoster}=await import('./model-poster');return createProfilePoster({capabilityModel,benchmarks,usageModel,priceModel,trends,priceMeta,currency,lang,tab})}}/>
   <button className="icon-button model-profile-close" aria-label={zh?'关闭档案':'Close profile'} onClick={onClose}><XIcon size={22}/></button>
  </header>
  <div className="model-profile-scroll">
   {selectedAvailable?(tab==='capability'?<CapabilityProfile model={capabilityModel} benchmarks={benchmarks} lang={lang}/>:tab==='usage'?<UsageProfile model={usageModel} trends={trends} lang={lang}/>:<PriceDetails model={priceModel} lang={lang} currency={currency} onCurrency={onCurrency} meta={priceMeta}/>):<EmptyProfile tab={tab} zh={zh} lang={lang} name={capabilityModel?.name||usageModel?.name||priceModel?.name} benchmarks={benchmarks} composite={composite}/>}
  </div>
 </dialog>;
}

// 模型没进某个榜时的空状态。能力档案额外列出能力榜的评测标准（评测数、领域、出分/排名门槛均取自数据）。
function EmptyProfile({tab,zh,lang,name,benchmarks,composite}){
 if(tab==='capability')return <CapabilityCriteria zh={zh} lang={lang} name={name} benchmarks={benchmarks} composite={composite}/>;
 const copy={
  usage:zh?['暂未进入调用榜','调用榜按 OpenRouter 每周调用量统计，只单独列出调用量靠前的模型，其余合并为「其他」。这个模型调用量进入前列后，会自动显示调用档案。']:['Not in the usage ranking yet','The usage ranking follows weekly OpenRouter token volume and lists only the top models individually; the rest are grouped as “Others”. This profile will appear once the model reaches the top.'],
  price:zh?['暂未收录价格','价格榜还没有收录这个模型的公开 API 价格，收录后会自动显示价格档案。']:['Pricing not listed yet','The pricing ranking has not listed public API prices for this model yet. Its pricing profile will appear once they are added.'],
 }[tab];
 return <section className="model-profile-empty">{name&&<p className="eyebrow">{name}</p>}<h2 id="model-profile-title">{copy[0]}</h2><p>{copy[1]}</p></section>;
}

function CapabilityCriteria({zh,lang,name,benchmarks,composite}){
 const count=(benchmarks||[]).filter(b=>!HIDDEN_BENCHMARKS.has(b.id)).length,params=composite?.params||{};
 const domains=Object.keys(params.DOMAIN_WEIGHTS||{}).map(d=>domainLabel(d,zh)),join=zh?'、':', ';
 const score=params.MIN_BENCHMARKS_FOR_SCORE||2,rank=params.MIN_BENCHMARKS_FOR_RANK||5,rankDomains=params.MIN_DOMAINS_FOR_RANK||3;
 const rows=zh?[
  ['收录评测',`精选 ${count} 项公开权威评测${domains.length?`，覆盖${domains.join(join)} ${domains.length} 个领域`:''}`],
  ['成绩来源','各评测官方榜单，或 Artificial Analysis 等第三方测评机构的公开榜单；每项只取最新一期'],
  ['综合分',`按模型在各评测中的名次汇总，不是百分制；至少 ${score} 项有成绩才出分，至少 ${rank} 项且覆盖 ${rankDomains} 个领域才参与排名`],
 ]:[
  ['Benchmarks',`${count} selected public benchmarks${domains.length?` across ${domains.length} areas: ${domains.join(join)}`:''}`],
  ['Source','Official leaderboards or public results from third-party evaluators such as Artificial Analysis; only the latest edition of each is used'],
  ['Composite',`Aggregated from the model’s rank on each benchmark, not a percentage. A score needs at least ${score} benchmarks; ranking needs at least ${rank} benchmarks across ${rankDomains} areas`],
 ];
 if(!benchmarks)return <section className="model-profile-empty"><h2 id="model-profile-title">{zh?'能力榜数据加载中':'Loading capability data'}</h2></section>;
 return <section className="model-profile-empty model-profile-criteria">{name&&<p className="eyebrow">{name}</p>}<h2 id="model-profile-title">{zh?'暂未进入能力榜':'Not in the capability ranking yet'}</h2><p>{zh?'这个模型目前在能力榜收录的评测中还没有成绩。':'This model has no score yet in the benchmarks covered by the capability ranking.'}</p>
  <dl><dt className="model-profile-criteria-title">{zh?'能力榜评测标准':'How the capability ranking works'}</dt>{rows.map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
  <p className="model-profile-criteria-foot">{zh?'评测发布该模型的成绩后，能力档案会自动出现。':'Its capability profile will appear once a benchmark publishes a score for it.'}</p></section>;
}
