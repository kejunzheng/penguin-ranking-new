import * as echarts from 'echarts/core';
import {LineChart,BarChart} from 'echarts/charts';
import {GridComponent,TooltipComponent,LegendComponent,DataZoomComponent,TitleComponent,GraphicComponent} from 'echarts/components';
import {CanvasRenderer} from 'echarts/renderers';
import {modelBrand} from './model-brand';
import {assetUrl} from './asset-url';
import {stackRows} from './usage-data';
echarts.use([LineChart,BarChart,GridComponent,TooltipComponent,LegendComponent,DataZoomComponent,TitleComponent,GraphicComponent,CanvasRenderer]);
import {chartColors} from './usage-palette';
export {chartColors} from './usage-palette';
const compact=n=>new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(n);
const colors=dark=>({bg:dark?'#16202d':'#ffffff',text:dark?'#f1f6fc':'#162333',muted:dark?'#a5b6cb':'#7c8fa7',line:dark?'#344253':'#e9edf6',other:dark?'#56687e':'#d4deec'});
export function createChart(element,data){return createUsageChart(element,data,{mode:'total',lang:document.documentElement.lang.startsWith('zh')?'zh':'en'});}
export function createUsageChart(element,data,options={}){
 const {mode='total',theme='light',selected=[],singleWeek=false,lang='en',title='',onHover,onModelClick,exportMode=false}=options;
 const chart=echarts.init(element),c=colors(theme==='dark'),zh=lang==='zh',{top,others}=stackRows(data);
 const arrowIcon='data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="${c.text}"><path d="M200,64V168a8,8,0,0,1-16,0V83.31L69.66,197.66a8,8,0,0,1-11.32-11.32L172.69,72H88a8,8,0,0,1,0-16H192A8,8,0,0,1,200,64Z"/></svg>`);
 const picked=mode==='compare'?selected:top;
 const total=data.platformTotal??data.weeks.reduce((s,w)=>s+w[2],0);
 const header=title?70:20;
 const series=singleWeek&&mode==='total'?[{name:zh?'调用量':'Tokens',type:'bar',barMaxWidth:25,data:[...top.map((r,i)=>({value:r.total,itemStyle:{color:chartColors[i],borderRadius:[0,4,4,0]}})),{value:others[0],itemStyle:{color:c.other,borderRadius:[0,4,4,0]}}],label:{show:true,position:'right',color:c.text,fontSize:12,formatter:p=>compact(p.value)+'  '+(total?p.value/total*100:0).toFixed(1)+'%'}}]:[
 ...picked.map((r,rank)=>({id:r.id,name:r.id,type:mode==='compare'?'line':'bar',stack:mode==='compare'?undefined:'usage',barMaxWidth:48,barCategoryGap:'36%',showSymbol:mode==='compare'&&data.weeks.length<3,symbolSize:7,connectNulls:false,lineStyle:{width:2.5},itemStyle:{color:chartColors[rank%chartColors.length]},emphasis:{focus:'series'},data:r.values.map((v,i)=>({value:mode==='total'?(v??0):v,itemStyle:{opacity:data.weeks[i][1]==='i'?.35:1}}))})),
 ...(mode==='total'?[{id:'__others',name:'__others',type:'bar',stack:'usage',barMaxWidth:48,itemStyle:{color:c.other,borderRadius:[3,3,0,0]},emphasis:{focus:'series'},data:others.map((v,i)=>({value:v,itemStyle:{opacity:data.weeks[i][1]==='i'?.35:1}}))}]:[])
 ];
 const names=new Map(picked.map(r=>[r.id,r.name+(r.id.includes(':free')?' · Free':'')]));names.set('__others',zh?'其他模型':'Others');
 const horizontal=singleWeek&&mode==='total';
 const rich={rank:{color:c.muted,width:24,fontSize:11},name:{color:c.text,fontSize:12,align:'left'},arrow:{width:16,height:16,padding:[0,0,0,6],backgroundColor:{image:arrowIcon}},spacer:{width:9},brandPlaceholder:{width:22,height:22}};
 top.forEach((r,i)=>{const brand=modelBrand(r);if(brand)rich['brand'+i]={height:22,width:22,backgroundColor:{image:assetUrl('assets/models/'+brand.file)}};});
 chart.setOption({animation:false,backgroundColor:c.bg,color:chartColors,textStyle:{fontFamily:'Inter, sans-serif'},title:title?{text:title,left:16,top:12,textStyle:{color:c.text,fontSize:20,fontWeight:600},subtext:(data.from||data.weeks[0]?.[0])+' — '+(data.to||data.weeks.at(-1)?.[0]),subtextStyle:{color:c.muted,fontSize:12}}:undefined,
 grid:{left:horizontal?260:12,right:horizontal?106:22,top:header,bottom:horizontal?42:exportMode?115:100,containLabel:!horizontal},
 tooltip:{trigger:'axis',axisPointer:{type:mode==='total'?'shadow':'line'},renderMode:'richText',confine:true,backgroundColor:c.bg,borderColor:c.line,textStyle:{color:c.text,fontSize:11},formatter:params=>{const items=Array.isArray(params)?params:[params];if(horizontal)return items.map(p=>`${p.name}: ${compact(p.value)}`).join('\n');const index=items[0]?.dataIndex;const week=data.weeks[index];return [week?.[0]+(week?.[1]==='i'?(zh?' · 本周未结束':' · Incomplete week'):''),mode==='total'?(zh?'平台总量 ':'Platform total ')+compact(week?.[2]??0):'',...items.filter(p=>p.value!=null&&p.value!==0).sort((a,b)=>b.value-a.value).map(p=>(names.get(p.seriesName)||p.seriesName)+': '+compact(p.value)+(mode==='total'&&week?.[2]?'  '+(p.value/week[2]*100).toFixed(1)+'%':''))].filter(Boolean).join('\n')}},
 xAxis:horizontal?{type:'value',axisLabel:{color:c.muted,fontSize:10,formatter:compact},splitLine:{lineStyle:{color:c.line}},axisLine:{show:false}}:{type:'category',data:data.weeks.map(w=>w[0]),axisTick:{show:false},axisLine:{lineStyle:{color:c.line}},axisLabel:{color:c.muted,fontSize:10,hideOverlap:true,formatter:v=>v.slice(5)}},
 yAxis:horizontal?{type:'category',inverse:true,triggerEvent:!!onModelClick,data:[...top.map(r=>r.name+(r.id.includes(':free')?' · Free':'')),zh?'其他模型':'Others'],axisTick:{show:false},axisLine:{show:false},axisLabel:{color:c.text,fontSize:12,align:'left',margin:248,rich,formatter:(value,index)=>'{rank|'+String(index+1).padStart(2,'0')+'}'+(rich['brand'+index]?'{brand'+index+'|}':'{brandPlaceholder| }')+'{spacer| }{name|'+(value.length>27?value.slice(0,25)+'…':value)+'}'+(index<top.length&&onModelClick&&!exportMode?'{arrow| }':'')}}:{type:'value',axisLabel:{color:c.muted,fontSize:10,formatter:compact},splitLine:{lineStyle:{color:c.line,type:'dashed'}}},
 legend:horizontal?{show:false}:{type:exportMode?'plain':'scroll',bottom:exportMode?10:23,itemWidth:12,itemHeight:7,textStyle:{fontSize:exportMode?13:10,color:c.text},pageTextStyle:{color:c.muted},formatter:name=>names.get(name)||name},
 dataZoom:horizontal||exportMode?[]:[{type:'slider',bottom:55,height:15,borderColor:c.line,backgroundColor:c.bg,fillerColor:theme==='dark'?'rgba(74,145,240,.18)':'rgba(30,118,240,.12)',handleStyle:{color:'#61a8ff'},textStyle:{color:c.muted,fontSize:9}}],
 graphic:[],series});
 if(onHover&&!horizontal){chart.on('mouseover',event=>{if(event.componentType==='series')onHover(event.dataIndex)});chart.on('globalout',()=>onHover(null))}
 if(onModelClick&&!exportMode)chart.on('click',event=>{
  let model;
  if(horizontal&&event.componentType==='yAxis')model=top.find(r=>r.name+(r.id.includes(':free')?' · Free':'')===event.value);
  else if(event.componentType==='series')model=horizontal?top[event.dataIndex]:picked.find(r=>r.id===event.seriesId);
  if(model)onModelClick(model);
 });
 return chart;
}
export function createPriceChart(element,history,currency,t){
 const chart=echarts.init(element);const symbol=currency==='USD'?'$':'¥';
 chart.setOption({animation:false,color:['#549ef8','#22b8d3'],textStyle:{fontFamily:'Inter, sans-serif'},tooltip:{trigger:'axis',renderMode:'richText',confine:true,valueFormatter:v=>v==null?'—':symbol+Number(v).toFixed(4)},legend:{bottom:0,itemWidth:13,itemHeight:7,textStyle:{fontSize:10,color:'#7c8fa7'}},grid:{top:22,left:12,right:14,bottom:48,containLabel:true},xAxis:{type:'category',data:history.map(p=>p.date),axisTick:{show:false},axisLine:{lineStyle:{color:'#e3e8f4'}},axisLabel:{fontSize:9,color:'#7c8fa7',formatter:v=>v.slice(5),hideOverlap:true}},yAxis:{type:'value',min:0,axisLabel:{fontSize:9,color:'#7c8fa7',formatter:v=>symbol+v},splitLine:{lineStyle:{color:'#edf0f7',type:'dashed'}}},series:['input','output'].map(key=>({name:t[key],type:'line',data:history.map(p=>p[key]),connectNulls:false,showSymbol:history.length===1,lineStyle:{width:2.5},step:'end'}))});return chart;
}
