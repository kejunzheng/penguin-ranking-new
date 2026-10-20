import {useEffect,useRef,useState} from 'react';
import {ShareNetworkIcon,XIcon,DownloadSimpleIcon} from '@phosphor-icons/react';
import {showImageShareMenu} from './utils/imageShare';

// 无边框分享图标：点击后生成分享海报（底部带二维码），弹窗里可长按保存、下载或调起分享。
// build 是返回 {url,blob} 的异步函数，点击时才调用，避免首页加载时就绘制海报。
export default function PosterShare({lang,build,fileName,label,className=''}){
 const zh=lang==='zh',[open,setOpen]=useState(false);
 return <>
  <button type="button" className={'poster-share-button '+className} onClick={()=>setOpen(true)} aria-label={label||(zh?'生成分享图':'Create share image')} title={label||(zh?'生成分享图':'Create share image')}><ShareNetworkIcon size={20} weight="bold" aria-hidden="true"/></button>
  {open&&<PosterDialog lang={lang} build={build} fileName={fileName} onClose={()=>setOpen(false)}/>}
 </>;
}

function PosterDialog({lang,build,fileName,onClose}){
 const zh=lang==='zh',dialog=useRef(null),[image,setImage]=useState(null),[busy,setBusy]=useState(true),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 const ua=navigator.userAgent||'',inWeChat=/MicroMessenger/i.test(ua),inNews=/qqnews/i.test(ua)&&Boolean(window.TencentNews?.invoke);
 useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close()},[]);
 useEffect(()=>{let cancelled=false;setBusy(true);setError('');setImage(null);
  build().then(result=>{if(!cancelled)setImage(result)}).catch(()=>{if(!cancelled)setError(zh?'图片生成失败，请重试。':'Could not create the image. Please try again.')}).finally(()=>{if(!cancelled)setBusy(false)});
  return()=>{cancelled=true}},[attempt]);
 const file=image&&new File([image.blob],fileName,{type:'image/png'});
 const canShare=file&&!inWeChat&&!inNews&&navigator.canShare?.({files:[file]});
 const download=()=>{const url=URL.createObjectURL(image.blob),a=document.createElement('a');a.href=url;a.download=fileName;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)};
 const share=async()=>{try{await navigator.share({files:[file]})}catch(e){if(e?.name!=='AbortError')setError(zh?'分享未完成，可以长按图片或下载保存。':'Sharing did not complete. Save the image below instead.')}};
 const hint=inWeChat?(zh?'长按下方图片，选择“发送给朋友”或“保存图片”。':'Touch and hold the image to send or save it.'):inNews?(zh?'点击下方按钮分享或保存图片，也可长按图片。':'Tap the button below to share or save, or touch and hold the image.'):(zh?'手机长按图片保存到相册，也可下载图片。':'Touch and hold the image to save it, or download it below.');
 return <dialog ref={dialog} className="export-dialog poster-share-dialog" aria-labelledby="poster-share-title" onCancel={event=>{event.preventDefault();event.stopPropagation();onClose()}} onClick={event=>{event.stopPropagation();if(event.target===dialog.current)onClose()}}>
  <div className="export-header"><div><h2 id="poster-share-title">{zh?'分享图':'Share image'}</h2><p>{hint}</p></div><button type="button" className="icon-button" aria-label={zh?'关闭':'Close'} onClick={onClose}><XIcon size={22}/></button></div>
  <div className="export-body" aria-busy={busy}>{busy&&<p className="export-loading" role="status">{zh?'正在生成分享图…':'Creating the share image…'}</p>}{image&&<img className="export-image" src={image.url} alt={zh?'榜单分享图':'Ranking share image'}/>}</div>
  {error&&<p className="export-error" role="alert">{error}</p>}
  <div className="export-actions">{image?(inWeChat?<p>{zh?'长按图片 → 发送给朋友 / 保存图片':'Touch and hold → Send / Save image'}</p>:inNews?<button type="button" className="solid" onClick={()=>showImageShareMenu({base64Image:image.url,showSavePic:1})}><ShareNetworkIcon size={18}/>{zh?'分享 / 保存图片':'Share / Save image'}</button>:<><button type="button" className="solid" onClick={download}><DownloadSimpleIcon size={18}/>{zh?'下载图片':'Download PNG'}</button>{canShare&&<button type="button" className="export-share" onClick={share}>{zh?'分享 / 保存到相册':'Share / Save to Photos'}</button>}</>):!busy&&<button type="button" className="solid" onClick={()=>setAttempt(x=>x+1)}>{zh?'重新生成':'Try again'}</button>}</div>
 </dialog>;
}
