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
    {capabilityModel&&<button aria-pressed={tab==='capability'} onClick={()=>setTab('capability')}>{zh?'能力档案':'Capability profile'}</button>}
    <button aria-pressed={tab==='usage'} onClick={()=>setTab('usage')}>{zh?'调用档案':'Usage profile'}</button>
    <button aria-pressed={tab==='price'} onClick={()=>setTab('price')}>{zh?'价格档案':'Pricing profile'}</button>
   </nav>
   <button className="icon-button model-profile-close" aria-label={zh?'关闭档案':'Close profile'} onClick={onClose}><XIcon size={22}/></button>
  </header>
  <div className="model-profile-scroll">
   {selectedAvailable?(tab==='capability'?<CapabilityProfile model={capabilityModel} benchmarks={benchmarks} lang={lang}/>:tab==='usage'?<UsageProfile model={usageModel} trends={trends} lang={lang}/>:<PriceDetails model={priceModel} lang={lang} currency={currency} onCurrency={onCurrency} meta={priceMeta}/>):<section className="model-profile-empty"><h2 id="model-profile-title">{tab==='capability'?(zh?'暂无能力档案':'No capability profile'):tab==='usage'?(zh?'暂无调用档案':'No usage profile'):(zh?'暂无价格档案':'No pricing profile')}</h2><p>{zh?'当前模型暂未在该榜单的数据源中匹配到记录。':'No matching record for this model is available in this ranking source yet.'}</p></section>}
  </div>
 </dialog>;
}
