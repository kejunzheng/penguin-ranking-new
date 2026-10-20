import QRCode from 'qrcode';
import {assetUrl} from './asset-url';

// 分享海报：首页各榜单 TOP 10、模型档案。固定 1080 宽画布绘制，与手机屏幕尺寸无关；底部带当前站点二维码。
const font='Inter, "PingFang SC", "Microsoft YaHei", sans-serif';
const W=1080,HEADER=112,FOOTER=240;

// 二维码指向当前站点（测试页 / 正式页 / GitHub Pages 各自指向自己）
export function siteUrl(params){const u=new URL(location.href);u.search='';u.hash='';for(const [k,v] of Object.entries(params))if(v!=null)u.searchParams.set(k,v);return u.toString();}

// 跨域素材须以 CORS 方式加载，否则画布被污染无法导出；加载失败返回 null，由调用方画占位
function loadImage(src){return new Promise((resolve,reject)=>{const img=new Image();if(!/^(data|blob):/.test(src))img.crossOrigin='anonymous';img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Image could not be loaded'));img.src=src;});}
const tryImage=src=>src?Promise.race([loadImage(src),new Promise((_,reject)=>setTimeout(()=>reject(new Error('timeout')),6000))]).catch(()=>null):Promise.resolve(null);
function rect(ctx,x,y,w,h,r,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
function setFont(ctx,size,weight){ctx.font=`${weight} ${size}px ${font}`;}
function text(ctx,value,x,y,size,color='#14283f',weight=400){setFont(ctx,size,weight);ctx.fillStyle=color;ctx.fillText(value,x,y);}
// 缩小字号直至放下；到最小字号仍放不下则截断加省略号
function fitText(ctx,value,x,y,maxWidth,size,color,weight=600,min=16){
 setFont(ctx,size,weight);while(ctx.measureText(value).width>maxWidth&&size>min){size--;setFont(ctx,size,weight);}
 let out=value;if(ctx.measureText(out).width>maxWidth){while(out.length>1&&ctx.measureText(out+'…').width>maxWidth)out=out.slice(0,-1);out+='…';}
 ctx.fillStyle=color;ctx.fillText(out,x,y);return size;
}

async function brandAssets(qrUrl){
 return Promise.all([
  QRCode.toDataURL(qrUrl,{margin:1,width:300,errorCorrectionLevel:'M'}).then(loadImage),
  loadImage(assetUrl('assets/tencent-technology.png')),loadImage(assetUrl('assets/penguin-logo-supplied.png')),
  tryImage(assetUrl('assets/blue-wave.webp')),
 ]);
}

function drawHeader(ctx,zh,publisher,penguin){
 ctx.fillStyle='#fff';ctx.fillRect(0,0,W,HEADER);
 const siteName=zh?'AI 趋势榜':'AI Trend Rankings';text(ctx,siteName,48,72,30,'#10273f',700);
 const dividerX=48+ctx.measureText(siteName).width+24;
 ctx.strokeStyle='#cad9eb';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(dividerX,31);ctx.lineTo(dividerX,81);ctx.stroke();
 const ph=42,pw=publisher.width/publisher.height*ph,px=dividerX+24;ctx.drawImage(publisher,px,35,pw,ph);
 ctx.drawImage(penguin,px+pw+24,30,penguin.width/penguin.height*52,52);
}
function drawHero(ctx,wave,height){
 if(wave)ctx.drawImage(wave,0,HEADER,W,height);
 const wash=ctx.createLinearGradient(0,0,W,0);wash.addColorStop(0,'rgba(239,248,255,.97)');wash.addColorStop(1,'rgba(239,248,255,.15)');ctx.fillStyle=wash;ctx.fillRect(0,HEADER,W,height);
}
function drawFooter(ctx,height,qr,title,lines){
 const size=156,qx=W-48-size,qy=height-size-40;
 rect(ctx,qx-12,qy-12,size+24,size+24,16,'#fff');ctx.drawImage(qr,qx,qy,size,size);
 text(ctx,title,48,height-138,28,'#10273f',700);
 lines.forEach((line,i)=>fitText(ctx,line,48,height-96+i*32,qx-48-40,19,'#45668a',500,13));
}
async function finish(canvas){
 const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Image export failed')),'image/png'));
 return {url:canvas.toDataURL('image/png'),blob};
}
function placeholder(ctx,x,y,size,label){rect(ctx,x,y,size,size,12,'#e9f2ff');text(ctx,label,x+size/2-10,y+size/2+10,26,'#176be8',700);}

// rows: [{rank,name,meta,value,valueLabel,logo,fallback}]
export async function createRankingPoster({lang,eyebrow,title,caption,rows,qrUrl,notes=[]}){
 await document.fonts.ready;
 const zh=lang==='zh';
 const [[qr,publisher,penguin,wave],logos]=await Promise.all([brandAssets(qrUrl),Promise.all(rows.map(r=>tryImage(r.logo)))]);
 const heroH=250,rowH=104,listTop=HEADER+heroH+20,listH=rows.length*rowH+56,height=listTop+listH+FOOTER;
 const canvas=document.createElement('canvas');canvas.width=W;canvas.height=height;const ctx=canvas.getContext('2d');
 ctx.fillStyle='#f1f6fc';ctx.fillRect(0,0,W,height);
 drawHeader(ctx,zh,publisher,penguin);drawHero(ctx,wave,heroH);
 text(ctx,eyebrow,48,HEADER+62,19,'#547ba9',600);
 fitText(ctx,title,48,HEADER+136,W-96,56,'#10273f',700,30);
 fitText(ctx,caption,48,HEADER+190,W-96,24,'#4e6e90',500,16);
 rect(ctx,32,listTop,W-64,listH,24,'#fff');
 rows.forEach((r,i)=>{
  const y=listTop+28+i*rowH,mid=y+rowH/2;
  if(i>0){ctx.strokeStyle='#edf2f8';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(72,y);ctx.lineTo(W-72,y);ctx.stroke();}
  text(ctx,String(r.rank).padStart(2,'0'),72,mid+10,26,i<3?'#176be8':'#8597ad',700);
  const lx=136,ls=56,ly=mid-ls/2;
  if(logos[i]){rect(ctx,lx,ly,ls,ls,12,'#fff');ctx.strokeStyle='#dce6f1';ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(lx,ly,ls,ls,12);ctx.stroke();const s=42,iw=logos[i].width||s,ih=logos[i].height||s,k=Math.min(s/iw,s/ih);ctx.drawImage(logos[i],lx+(ls-iw*k)/2,ly+(ls-ih*k)/2,iw*k,ih*k);}
  else placeholder(ctx,lx,ly,ls,(r.fallback||r.name||'·').trim()[0]||'·');
  const vx=W-72;ctx.textAlign='right';
  setFont(ctx,30,700);const valueW=Math.max(ctx.measureText(r.value).width,r.valueLabel?(setFont(ctx,16,500),ctx.measureText(r.valueLabel).width):0);
  text(ctx,r.value,vx,r.valueLabel?mid+2:mid+11,30,'#10273f',700);
  if(r.valueLabel)text(ctx,r.valueLabel,vx,mid+30,16,'#7d8da1',500);
  ctx.textAlign='left';
  const nx=lx+ls+22,nw=vx-valueW-32-nx;
  fitText(ctx,r.name,nx,r.meta?mid-4:mid+10,nw,28,'#14283f',600,23);
  if(r.meta)fitText(ctx,r.meta,nx,mid+28,nw,18,'#7d8da1',500,13);
 });
 drawFooter(ctx,height,qr,zh?'扫码查看完整榜单':'Scan for the full ranking',notes);
 return finish(canvas);
}

// blocks: [{title,empty?,metrics:[[label,value,sub]],bars?:[[label,score]]}]
export async function createModelPoster({lang,name,meta,logo,fallback,blocks,qrUrl,notes=[]}){
 await document.fonts.ready;
 const zh=lang==='zh';
 const [[qr,publisher,penguin,wave],logoImg]=await Promise.all([brandAssets(qrUrl),tryImage(logo)]);
 const heroH=240,blockGap=24,tileH=128;
 const blockHeight=b=>b.empty?150:84+Math.ceil(b.metrics.length/2)*(tileH+16)+(b.bars?.length?28+b.bars.length*46:0)+12;
 const blocksTop=HEADER+heroH+20,blocksH=blocks.reduce((s,b)=>s+blockHeight(b)+blockGap,0),height=blocksTop+blocksH+FOOTER-blockGap+20;
 const canvas=document.createElement('canvas');canvas.width=W;canvas.height=height;const ctx=canvas.getContext('2d');
 ctx.fillStyle='#f1f6fc';ctx.fillRect(0,0,W,height);
 drawHeader(ctx,zh,publisher,penguin);drawHero(ctx,wave,heroH);
 text(ctx,zh?'模型档案 · MODEL PROFILE':'MODEL PROFILE',48,HEADER+62,19,'#547ba9',600);
 const ls=104,ly=HEADER+92;
 rect(ctx,48,ly,ls,ls,22,'#fff');
 if(logoImg){const s=72,iw=logoImg.width||s,ih=logoImg.height||s,k=Math.min(s/iw,s/ih);ctx.drawImage(logoImg,48+(ls-iw*k)/2,ly+(ls-ih*k)/2,iw*k,ih*k);}else placeholder(ctx,48,ly,ls,(fallback||name||'·').trim()[0]);
 fitText(ctx,name,176,ly+52,W-176-48,50,'#10273f',700,26);
 if(meta)fitText(ctx,meta,176,ly+94,W-176-48,22,'#4e6e90',500,15);
 let y=blocksTop;
 for(const b of blocks){
  const h=blockHeight(b);rect(ctx,32,y,W-64,h,24,'#fff');
  text(ctx,b.title,64,y+54,28,'#10273f',700);
  if(b.empty){fitText(ctx,b.empty,64,y+106,W-128,21,'#7d8da1',500,14);}
  else{
   const tw=(W-128-16)/2;
   b.metrics.forEach(([label,value,sub],i)=>{
    const tx=64+(i%2)*(tw+16),ty=y+84+Math.floor(i/2)*(tileH+16);
    rect(ctx,tx,ty,tw,tileH,16,'#f4f8fd');
    fitText(ctx,label,tx+22,ty+38,tw-44,18,'#627f9f',500,13);
    fitText(ctx,value,tx+22,ty+84,tw-44,38,'#10273f',700,20);
    if(sub)fitText(ctx,sub,tx+22,ty+112,tw-44,16,'#7d8da1',500,12);
   });
   if(b.bars?.length){
    let by=y+84+Math.ceil(b.metrics.length/2)*(tileH+16)+20;
    for(const [label,score] of b.bars){
     fitText(ctx,label,64,by+8,150,19,'#45668a',500,13);
     rect(ctx,230,by-8,W-230-170,14,7,'#edf3fa');
     const pct=Math.max(.04,Math.min(1,score/100));rect(ctx,230,by-8,(W-230-170)*pct,14,7,score>=80?'#176be8':score>=65?'#4d8ff0':'#9dbcec');
     ctx.textAlign='right';text(ctx,score.toFixed(1),W-64,by+8,21,'#14283f',700);ctx.textAlign='left';
     by+=46;
    }
   }
  }
  y+=h+blockGap;
 }
 drawFooter(ctx,height,qr,zh?'扫码查看模型档案':'Scan to open this model profile',notes);
 return finish(canvas);
}

// 价格斩杀线：纵轴综合分、横轴折算价格（对数刻度）；斩杀线节点画图标和名称，其余模型画小圆点；下方列出斩杀线模型。
// points: [{id,name,score,price,logo,onLine}]，line 为斩杀线节点（按价格升序）
export async function createFrontierPoster({lang,title,caption,points,line,ticks,minScore,currencySymbol,qrUrl,notes=[]}){
 await document.fonts.ready;
 const zh=lang==='zh';
 const [[qr,publisher,penguin,wave],logos]=await Promise.all([brandAssets(qrUrl),Promise.all(line.map(p=>tryImage(p.logo)))]);
 const heroH=230,cardTop=HEADER+heroH+20,plotH=620,listRowH=64,cardH=96+plotH+70+line.length*listRowH+64,height=cardTop+cardH+FOOTER;
 const canvas=document.createElement('canvas');canvas.width=W;canvas.height=height;const ctx=canvas.getContext('2d');
 ctx.fillStyle='#f1f6fc';ctx.fillRect(0,0,W,height);
 drawHeader(ctx,zh,publisher,penguin);drawHero(ctx,wave,heroH);
 text(ctx,zh?'01 / MODEL CAPABILITY / PRICE FRONTIER':'01 / MODEL CAPABILITY / PRICE FRONTIER',48,HEADER+62,19,'#547ba9',600);
 fitText(ctx,title,48,HEADER+134,W-96,56,'#10273f',700,30);
 fitText(ctx,caption,48,HEADER+186,W-96,23,'#4e6e90',500,15);
 rect(ctx,32,cardTop,W-64,cardH,24,'#fff');
 // 坐标
 const px=120,pw=W-px-80,py=cardTop+80,ph=plotH;
 const prices=points.map(p=>p.price),scores=points.map(p=>p.score);
 const xMin=Math.log10(Math.min(...prices)/1.4),xMax=Math.log10(Math.max(...prices)*1.4);
 const yMin=Math.floor(minScore-1),yMax=Math.ceil(Math.max(...scores)+3);
 const X=price=>px+(Math.log10(price)-xMin)/(xMax-xMin)*pw,Y=score=>py+(1-(score-yMin)/(yMax-yMin))*ph;
 text(ctx,zh?'综合分 ↑':'Composite ↑',64,cardTop+52,18,'#627f9f',600);
 ctx.lineWidth=1.5;ctx.strokeStyle='#edf2f8';ctx.fillStyle='#8597ad';
 for(let t=Math.ceil(yMin/5)*5;t<=yMax;t+=5){const yy=Y(t);ctx.beginPath();ctx.moveTo(px,yy);ctx.lineTo(px+pw,yy);ctx.stroke();ctx.textAlign='right';text(ctx,String(t),px-14,yy+6,16,'#8597ad',500);ctx.textAlign='left';}
 for(const t of ticks.filter(t=>Math.log10(t)>=xMin&&Math.log10(t)<=xMax)){const xx=X(t);ctx.beginPath();ctx.moveTo(xx,py);ctx.lineTo(xx,py+ph);ctx.stroke();ctx.textAlign='center';text(ctx,currencySymbol+String(t),xx,py+ph+30,16,'#8597ad',500);ctx.textAlign='left';}
 ctx.textAlign='right';text(ctx,zh?`价格（${currencySymbol} / 百万 Token）→`:`Price (${currencySymbol} / 1M tokens) →`,px+pw,py+ph+60,17,'#627f9f',600);ctx.textAlign='left';
 // 门槛线
 ctx.save();ctx.setLineDash([8,8]);ctx.strokeStyle='#c4d2e3';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(px,Y(minScore));ctx.lineTo(px+pw,Y(minScore));ctx.stroke();ctx.restore();
 // 斩杀线阶梯与下方填充
 if(line.length){
  ctx.beginPath();line.forEach((p,i)=>{if(!i)ctx.moveTo(X(p.price),Y(p.score));else{ctx.lineTo(X(p.price),Y(line[i-1].score));ctx.lineTo(X(p.price),Y(p.score));}});
  const stepEnd=()=>ctx.lineTo(px+pw,Y(line.at(-1).score));
  ctx.save();stepEnd();ctx.lineTo(px+pw,py+ph);ctx.lineTo(X(line[0].price),py+ph);ctx.closePath();ctx.fillStyle='rgba(23,107,232,.07)';ctx.fill();ctx.restore();
  ctx.beginPath();line.forEach((p,i)=>{if(!i)ctx.moveTo(X(p.price),Y(p.score));else{ctx.lineTo(X(p.price),Y(line[i-1].score));ctx.lineTo(X(p.price),Y(p.score));}});
  ctx.strokeStyle='#176be8';ctx.lineWidth=4;ctx.lineJoin='round';ctx.stroke();
  ctx.save();ctx.setLineDash([6,8]);ctx.beginPath();ctx.moveTo(X(line.at(-1).price),Y(line.at(-1).score));ctx.lineTo(px+pw,Y(line.at(-1).score));ctx.strokeStyle='#8db4ef';ctx.lineWidth=3;ctx.stroke();ctx.restore();
 }
 // 其他模型：小圆点
 for(const p of points.filter(p=>!p.onLine)){ctx.beginPath();ctx.arc(X(p.price),Y(p.score),7,0,Math.PI*2);ctx.fillStyle='#c9d6e6';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();}
 // 斩杀线节点：先画全部图标，再逐个放名称——依次尝试右、左、上、下及斜向位置，取第一个不与已放名称和图标重叠的位置
 const r=22,chips=line.map(p=>({x:X(p.price),y:Y(p.score)}));
 line.forEach((p,i)=>{
  const {x:cx,y:cy}=chips[i];
  ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#176be8';ctx.lineWidth=3;ctx.stroke();
  if(logos[i]){const s=28,iw=logos[i].width||s,ih=logos[i].height||s,k=Math.min(s/iw,s/ih);ctx.drawImage(logos[i],cx-iw*k/2,cy-ih*k/2,iw*k,ih*k);}
  else text(ctx,(p.name||'·').trim()[0],cx-8,cy+8,20,'#176be8',700);
 });
 const placed=chips.map(c=>({x:c.x-r-2,y:c.y-r-2,w:2*r+4,h:2*r+4}));
 line.forEach((p,i)=>{
  const {x:cx,y:cy}=chips[i],label=p.name,sub=`${p.score.toFixed(1)} · ${currencySymbol}${p.price>=10?p.price.toFixed(1):p.price.toFixed(2)}`;
  setFont(ctx,17,700);const nameW=ctx.measureText(label).width;setFont(ctx,15,500);
  const lw=Math.min(220,Math.max(nameW,ctx.measureText(sub).width)),bw=lw+12,bh=46;
  const g=r+8,cands=[];
  // 由近到远：8 个方向 × 4 个距离，远处的名称用细引线连回图标
  for(const d of [0,60,120,180])for(const [dx,dy] of [[1,0],[-1,0],[0,-1],[0,1],[1,-1],[1,1],[-1,-1],[-1,1]]){
   const x=dx>0?cx+g+d:dx<0?cx-g-d-bw:cx-bw/2,y=dy<0?cy-g-d*.6-bh+(dx?bh/2:0):dy>0?cy+g+d*.6-(dx?bh/2:0):cy-bh/2;cands.push([x,y]);
  }
  const clamp=([x,y])=>({x:Math.max(px-40,Math.min(px+pw-bw,x)),y:Math.max(py-30,Math.min(py+ph-bh,y)),w:bw,h:bh});
  const overlap=b=>placed.reduce((sum,o)=>sum+Math.max(0,Math.min(b.x+b.w,o.x+o.w)-Math.max(b.x,o.x))*Math.max(0,Math.min(b.y+b.h,o.y+o.h)-Math.max(b.y,o.y)),0);
  let box=null,best=Infinity;for(const c of cands){const b=clamp(c),o=overlap(b);if(o<best){best=o;box=b;if(!o)break;}}
  placed.push(box);
  // 名称离图标较远时画一条细引线
  const bx=Math.max(box.x,Math.min(cx,box.x+box.w)),by=Math.max(box.y,Math.min(cy,box.y+box.h));
  const dist=Math.hypot(bx-cx,by-cy);if(dist>r+14){const ux=(bx-cx)/dist,uy=(by-cy)/dist;ctx.beginPath();ctx.moveTo(cx+ux*(r+2),cy+uy*(r+2));ctx.lineTo(bx,by);ctx.strokeStyle='#9dbcec';ctx.lineWidth=1.5;ctx.stroke();}
  rect(ctx,box.x,box.y,box.w,box.h,8,'rgba(255,255,255,.92)');
  fitText(ctx,label,box.x+6,box.y+20,lw,17,'#14283f',700,12);
  fitText(ctx,sub,box.x+6,box.y+40,lw,15,'#176be8',600,11);
 });
 // 斩杀线模型列表
 let ly=py+ph+110;
 text(ctx,zh?`斩杀线上的模型 · ${line.length} 个`:`Models on the frontier · ${line.length}`,64,ly,24,'#10273f',700);ctx.textAlign='right';text(ctx,zh?'综合分':'Composite',W-230,ly,16,'#7d8da1',500);text(ctx,zh?'折算价格':'Blended',W-64,ly,16,'#7d8da1',500);ctx.textAlign='left';ly+=24;
 line.forEach((p,i)=>{
  const y=ly+i*listRowH;
  if(i>0){ctx.strokeStyle='#edf2f8';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(64,y);ctx.lineTo(W-64,y);ctx.stroke();}
  const mid=y+listRowH/2+8;
  text(ctx,String(i+1).padStart(2,'0'),64,mid,20,'#8597ad',700);
  ctx.textAlign='right';
  text(ctx,`${currencySymbol}${p.price>=10?p.price.toFixed(1):p.price.toFixed(2)}`,W-64,mid,22,'#45668a',600);
  text(ctx,p.score.toFixed(1),W-230,mid,24,'#10273f',700);
  ctx.textAlign='left';
  fitText(ctx,p.name,116,mid,W-116-360,23,'#14283f',600,15);
 });
 drawFooter(ctx,height,qr,zh?'扫码查看价格斩杀线':'Scan to open the price frontier',notes);
 return finish(canvas);
}
