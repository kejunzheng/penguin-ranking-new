import {useEffect,useRef,useState} from 'react';
import {XIcon} from '@phosphor-icons/react';
import PriceDetails from './PriceDetails';
import UsageProfile from './UsageProfile';
import CapabilityProfile from './CapabilityProfile';

export default function ModelProfileDialog({capabilityModel,benchmarks,usageModel,priceModel,initialTab='usage',trends,lang,currency,onCurrency,priceMeta,onClose}){
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
   <button className="icon-button model-profile-close" aria-label={zh?'关闭档案':'Close profile'} onClick={onClose}><XIcon size={22}/></button>
  </header>
  <div className="model-profile-scroll">
   {selectedAvailable?(tab==='capability'?<CapabilityProfile model={capabilityModel} benchmarks={benchmarks} lang={lang}/>:tab==='usage'?<UsageProfile model={usageModel} trends={trends} lang={lang}/>:<PriceDetails model={priceModel} lang={lang} currency={currency} onCurrency={onCurrency} meta={priceMeta}/>):<EmptyProfile tab={tab} zh={zh} name={capabilityModel?.name||usageModel?.name||priceModel?.name} benchmarkCount={benchmarks?.length}/>}
  </div>
 </dialog>;
}

// 模型没进某个榜时的空状态：说明该榜的收录口径，并告诉用户进入后会自动出现。
function EmptyProfile({tab,zh,name,benchmarkCount}){
 const copy={
  capability:zh?['暂未进入能力榜',benchmarkCount?`能力榜目前汇总 ${benchmarkCount} 项公开评测，这个模型还没有出现在任何一项的成绩里。有成绩后会自动显示能力档案。`:'能力榜数据加载中，请稍后再看。']:['Not in the capability ranking yet',benchmarkCount?`The capability ranking covers ${benchmarkCount} public benchmarks, and this model has no score in any of them yet. Its capability profile will appear once a score is published.`:'Capability data is still loading.'],
  usage:zh?['暂未进入调用榜','调用榜按 OpenRouter 每周调用量统计，只单独列出调用量靠前的模型，其余合并为「其他」。这个模型调用量进入前列后，会自动显示调用档案。']:['Not in the usage ranking yet','The usage ranking follows weekly OpenRouter token volume and lists only the top models individually; the rest are grouped as “Others”. This profile will appear once the model reaches the top.'],
  price:zh?['暂未收录价格','价格榜还没有收录这个模型的公开 API 价格，收录后会自动显示价格档案。']:['Pricing not listed yet','The pricing ranking has not listed public API prices for this model yet. Its pricing profile will appear once they are added.'],
 }[tab];
 return <section className="model-profile-empty">{name&&<p className="eyebrow">{name}</p>}<h2 id="model-profile-title">{copy[0]}</h2><p>{copy[1]}</p></section>;
}
