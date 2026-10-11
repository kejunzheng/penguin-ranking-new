import {stackRows} from './usage-data';
import {modelBrand} from './model-brand';
import {assetUrl} from './asset-url';
import {chartColors} from './usage-palette';
import {dataDate,getDataNotes} from './DataNotes';

const font='Inter, "PingFang SC", "Microsoft YaHei", sans-serif';
const short=n=>new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(n);
function loadImage(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Image could not be loaded'));img.src=src;});}
function rect(ctx,x,y,w,h,r,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
function text(ctx,value,x,y,size,color='#14283f',weight=400){ctx.font=`${weight} ${size}px ${font}`;ctx.fillStyle=color;ctx.fillText(value,x,y);}
function fit(ctx,value,width,size){ctx.font=`600 ${size}px ${font}`;while(ctx.measureText(value).width>width&&size>16){size--;ctx.font=`600 ${size}px ${font}`;}return size;}
function wrap(ctx,value,x,y,width,size,color){let line='';for(const ch of value){ctx.font=`400 ${size}px ${font}`;if(ctx.measureText(line+ch).width>width){text(ctx,line,x,y,size,color);line='';y+=size*1.5;}line+=ch;}if(line)text(ctx,line,x,y,size,color);return y+size*1.5;}

// Render from the selected data window at a fixed resolution, independent of phone viewport.
export async function createUsagePoster({data,mode,theme,selected,singleWeek,lang,title}){
 await document.fonts.ready;
 const zh=lang==='zh',horizontal=singleWeek&&mode==='total',dark=theme==='dark';
 const pageTitle=zh?'模型调用榜':'Model usage';
 const pageDescription=zh?'基于 OpenRouter 公开数据，统一查看模型排行与总量趋势':'Explore model rankings and token trends with public OpenRouter data.';
 const dataNotes=getDataNotes('usage','product',lang);
 const {top,others}=stackRows(data);
 const rows=[...top,{id:'__others',name:zh?'其他模型':'Others',total:others[0]}];
 const [publisher,penguin,wave,...logos]=await Promise.all([
  loadImage(assetUrl('assets/tencent-technology.png')),loadImage(assetUrl('assets/penguin-logo-supplied.png')),
  loadImage(assetUrl('assets/blue-wave.webp')),
  ...top.map(r=>{const brand=modelBrand(r);return brand?loadImage(assetUrl('assets/models/'+brand.file)).catch(()=>null):Promise.resolve(null);})
 ]);
 const chartHeight=horizontal?rows.length*78+130:700;
 const width=1080,chartTop=390,footerHeight=zh?430:510,height=chartTop+chartHeight+footerHeight,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d');
 ctx.fillStyle='#f1f6fc';ctx.fillRect(0,0,width,height);
 ctx.fillStyle='#fff';ctx.fillRect(0,0,width,112);
 const siteName=zh?'AI 趋势榜':'AI Trend Rankings';text(ctx,siteName,48,72,30,'#10273f',700);
 const siteWidth=ctx.measureText(siteName).width,dividerX=48+siteWidth+24;
 ctx.strokeStyle='#cad9eb';ctx.beginPath();ctx.moveTo(dividerX,31);ctx.lineTo(dividerX,81);ctx.stroke();
 const ph=42,pw=publisher.width/publisher.height*ph,publisherX=dividerX+24;ctx.drawImage(publisher,publisherX,35,pw,ph);
 ctx.drawImage(penguin,publisherX+pw+24,30,penguin.width/penguin.height*52,52);
 // Approved wave artwork, with a soft left overlay for readable type.
 ctx.drawImage(wave,0,112,width,254);
 const wash=ctx.createLinearGradient(0,0,width,0);wash.addColorStop(0,'rgba(239,248,255,.97)');wash.addColorStop(1,'rgba(239,248,255,.12)');ctx.fillStyle=wash;ctx.fillRect(0,112,width,328);
 text(ctx,'02 / USAGE',48,158,18,'#547ba9',500);
 text(ctx,pageTitle,48,225,fit(ctx,pageTitle,984,48),'#10273f',700);
 text(ctx,pageDescription,48,274,22,'#4e6e90');
 const surface=dark?'#16202d':'#fff',ink=dark?'#f1f6fc':'#14283f',muted=dark?'#a5b6cb':'#627f9f';
 rect(ctx,32,chartTop,1016,chartHeight,22,surface);
 if(horizontal){
  text(ctx,title,64,chartTop+43,22,ink,600);
  text(ctx,`${data.from} — ${data.to}`,64,chartTop+72,16,muted);
  const max=Math.max(...rows.map(r=>r.total),1);
  rows.forEach((r,i)=>{const y=chartTop+112+i*78,name=r.name+(r.id.includes(':free')?' · Free':'');
   text(ctx,String(i+1).padStart(2,'0'),64,y+13,20,muted);
   if(logos[i]){rect(ctx,108,y-13,36,36,7,'#fff');ctx.drawImage(logos[i],112,y-9,28,28);}
   text(ctx,name,158,y+13,fit(ctx,name,560,23),ink,600);
   ctx.textAlign='right';text(ctx,short(r.total),891,y+13,24,ink,600);text(ctx,(data.platformTotal?r.total/data.platformTotal*100:0).toFixed(1)+'%',1016,y+13,20,muted);ctx.textAlign='left';
   rect(ctx,158,y+29,858,9,4,dark?'#2c3b4e':'#edf3fa');rect(ctx,158,y+29,858*r.total/max,9,4,r.id==='__others'?'#b8c9df':chartColors[i%chartColors.length]);
  });
 }else{
  const element=document.createElement('div');element.style.cssText='position:fixed;left:-10000px;top:0;width:984px;height:636px';document.body.append(element);let chart;
  try{const {createUsageChart}=await import('./chart');chart=createUsageChart(element,data,{mode,theme,selected,singleWeek:false,lang,title,exportMode:true});const bitmap=await loadImage(chart.getDataURL({type:'png',pixelRatio:2}));ctx.drawImage(bitmap,48,chartTop+16,984,636);}finally{chart?.dispose();element.remove();}
 }
 let footer=chartTop+chartHeight+34;
 const labels=zh?{source:'数据来源',method:'统计口径',disclaimer:'免责声明'}:{source:'Data sources',method:'Methodology',disclaimer:'Disclaimer'};
 for(const section of ['source','method','disclaimer']){
  text(ctx,labels[section],48,footer,18,'#45668a',600);footer+=30;
  for(const paragraph of dataNotes[section])footer=wrap(ctx,paragraph,48,footer,984,16,'#627f9f')+5;
  footer+=9;
 }
 const sourceLine=zh?`数据来自 OpenRouter rankings · 包含平台路由的模型 Token 用量 · 数据更新：${dataDate(data.updated,lang)}`:`Source: OpenRouter rankings · Includes model tokens routed through OpenRouter · Data updated: ${dataDate(data.updated,lang)}`;
 text(ctx,sourceLine,48,height-58,16,'#45668a',500);
 text(ctx,zh?'AI 趋势榜':'AI Trend Rankings',48,height-26,14,'#627f9f',500);
 const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Image export failed')),'image/png'));
 return {url:canvas.toDataURL('image/png'),blob};
}
