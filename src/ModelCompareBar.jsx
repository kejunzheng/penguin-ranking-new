import React,{useEffect,useRef,useState} from 'react';
import {CheckIcon,MagnifyingGlassIcon,XIcon} from '@phosphor-icons/react';
import ModelLogo from './ModelLogo';

// 评测榜与调用榜共用的“对比模型”选择条：一个搜索入口，选中即生效，已选模型以标签展示。
// options: [{id,name,meta,logo,disabled,note}]，disabled 的选项灰显并附 note（如“该时段无独立用量”）。
// markers: 每个已选模型左侧的标识（颜色点或序号），与图表 / 表格列保持一致。
export const COMPARE_LIMIT=5;

export default function ModelCompareBar({lang,options,selectedIds,onToggle,onClear,marker,limit=COMPARE_LIMIT,actions}){
 const zh=lang==='zh',[query,setQuery]=useState(''),[open,setOpen]=useState(false),rootRef=useRef(null),inputRef=useRef(null);
 const q=query.trim().toLowerCase();
 const matches=options.filter(option=>!q||[option.name,option.meta,option.id].join(' ').toLowerCase().includes(q));
 const full=selectedIds.length>=limit;
 const byId=new Map(options.map(option=>[option.id,option]));
 useEffect(()=>{if(!open)return;const close=event=>{if(event.key==='Escape'){setOpen(false);inputRef.current?.blur()}};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close)},[open]);
 return <section className="compare-bar" ref={rootRef} aria-label={zh?'对比模型':'Models to compare'} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false)}}>
  <div className="compare-bar-row">
   <h3>{zh?'对比模型':'Compare'} <span aria-live="polite">{selectedIds.length}/{limit}</span></h3>
   <div className="compare-bar-search">
    <MagnifyingGlassIcon size={15} aria-hidden="true"/>
    <input ref={inputRef} value={query} autoComplete="off" onFocus={()=>setOpen(true)} onChange={e=>{setQuery(e.target.value);setOpen(true)}} placeholder={zh?`搜索模型或厂商，最多 ${limit} 个`:`Search models or providers, up to ${limit}`} aria-label={zh?`搜索并选择最多 ${limit} 个模型`:`Search and select up to ${limit} models`} aria-expanded={open} aria-controls="compare-bar-list"/>
    {query&&<button type="button" aria-label={zh?'清除搜索':'Clear search'} onClick={()=>{setQuery('');inputRef.current?.focus()}}><XIcon size={14}/></button>}
    {open&&<div className="compare-bar-list" id="compare-bar-list" role="listbox" aria-multiselectable="true" onMouseDown={e=>e.preventDefault()}>
     <div className="compare-bar-list-head"><span>{q?(zh?`匹配 ${matches.length} 个模型`:`${matches.length} matches`):(zh?`全部 ${options.length} 个模型`:`All ${options.length} models`)}</span>{full&&<b>{zh?`已选满 ${limit} 个，移除后可继续添加`:`Limit of ${limit} reached`}</b>}<button type="button" className="compare-bar-done" onClick={()=>setOpen(false)}>{zh?'完成':'Done'}</button></div>
     {matches.length?matches.map(option=>{const checked=selectedIds.includes(option.id),blocked=!checked&&(full||option.disabled);return <button type="button" role="option" key={option.id} aria-selected={checked} disabled={blocked} onClick={()=>onToggle(option.id)}>
      <span className="compare-bar-check">{checked&&<CheckIcon weight="bold" size={12}/>}</span>
      {option.logo&&<ModelLogo item={option.logo} lang={lang}/>}
      <span className="compare-bar-option"><strong>{option.name}</strong><small>{option.disabled?option.note:option.meta}</small></span>
     </button>}):<p className="compare-bar-empty">{zh?'未找到匹配的模型':'No matching models'}</p>}
    </div>}
   </div>
   <div className="compare-bar-actions">{actions}{selectedIds.length>0&&<button type="button" className="compare-bar-clear" onClick={onClear}>{zh?'清空':'Clear'}</button>}</div>
  </div>
  {selectedIds.length>0&&<ul className="compare-bar-tags">{selectedIds.map((id,index)=>{const option=byId.get(id);return <li key={id}>{marker?.(id,index)}<span>{option?.name||id}</span>{option?.disabled&&<small>{option.note}</small>}<button type="button" aria-label={(zh?'移除 ':'Remove ')+(option?.name||id)} onClick={()=>onToggle(id)}><XIcon size={13}/></button></li>})}</ul>}
 </section>;
}
