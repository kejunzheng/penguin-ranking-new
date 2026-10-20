import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {ShareNetworkIcon,XIcon} from '@phosphor-icons/react';

// 右上角分享按钮。分享卡片的标题/描述/图标由 assets/penguin-share.js 在页面加载时设置（腾讯新闻端内 setShareInfo、微信 WeixinJSBridge、QQ meta）。
// 浮层用 portal 挂到 body：页头有 backdrop-filter，会让内部 fixed 元素相对页头定位。
// 端内和微信没有可由页面主动唤起的链接分享面板，点击后引导用户使用右上角「···」；其他浏览器优先用系统分享，不支持时复制链接。
const SHARE_TEXT={zh:{title:'企鹅智库 · AI 趋势榜',text:'模型能力榜·模型调用榜·模型价格榜·开源产品榜'},en:{title:'AI Trend Rankings',text:'Model capability, usage, pricing and open-source product rankings'}};

async function copyText(text){
 try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);return true;}}catch(error){/* 回退到 execCommand */}
 const area=document.createElement('textarea');area.value=text;area.setAttribute('readonly','');area.style.cssText='position:fixed;top:-1000px;opacity:0';document.body.appendChild(area);area.select();
 let ok=false;try{ok=document.execCommand('copy');}catch(error){ok=false;}
 area.remove();return ok;
}

export default function ShareButton({lang}){
 const zh=lang==='zh',[guide,setGuide]=useState(false),[toast,setToast]=useState('');
 useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),2400);return()=>clearTimeout(timer)},[toast]);
 useEffect(()=>{if(!guide)return;const onKey=event=>{if(event.key==='Escape')setGuide(false)};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[guide]);
 const share=async()=>{
  const ua=navigator.userAgent||'';
  if(/qqnews/i.test(ua)||/MicroMessenger/i.test(ua)){setGuide(true);return;}
  const url=location.href,{title,text}=SHARE_TEXT[zh?'zh':'en'];
  if(navigator.share){
   try{await navigator.share({title,text,url});return;}catch(error){if(error?.name==='AbortError')return;}
  }
  setToast(await copyText(url)?(zh?'链接已复制，粘贴即可分享':'Link copied — paste it to share'):(zh?'复制失败，请手动复制地址栏链接':'Copy failed. Please copy the address bar link.'));
 };
 return <>
  <button type="button" className="header-share" onClick={share} aria-label={zh?'分享本页':'Share this page'}><ShareNetworkIcon size={16} weight="bold" aria-hidden="true"/><span>{zh?'分享':'Share'}</span></button>
  {guide&&createPortal(<div className="share-guide" role="dialog" aria-modal="true" aria-label={zh?'分享引导':'How to share'} onClick={()=>setGuide(false)}>
   <svg className="share-guide-arrow" viewBox="0 0 90 120" aria-hidden="true"><path d="M12 112 C 18 60, 40 30, 78 12" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeDasharray="2 10"/><path d="M58 8 L80 11 L72 32" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/></svg>
   <div className="share-guide-card" onClick={event=>event.stopPropagation()}>
    <p className="share-guide-title">{zh?'点击右上角「···」':'Tap “···” at the top right'}</p>
    <p>{zh?'选择发送给朋友或分享到朋友圈':'Then send it to a friend or share it to your feed'}</p>
    <button type="button" onClick={()=>setGuide(false)}><XIcon size={14} weight="bold" aria-hidden="true"/>{zh?'知道了':'Got it'}</button>
   </div>
  </div>,document.body)}
  {toast&&createPortal(<div className="share-toast" role="status">{toast}</div>,document.body)}
 </>;
}
