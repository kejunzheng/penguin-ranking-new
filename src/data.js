export const routes = ['home', 'benchmarks', 'usage', 'pricing', 'opensource', 'skillhub'];
export function rankProjects(rows) { return [...rows].filter(r => r.starGrowth > 0).sort((a,b) => b.starGrowth-a.starGrowth || b.stars-a.stars || a.repositoryId-b.repositoryId).slice(0,10); }
export function usageRows(trends, count = 12) {
 const end=trends.weeks.findLastIndex(w=>w[1]==='f'); const start=Math.max(0,end-count+1); const sums=new Map();
 for (const [wi,mi,value] of trends.points) if(wi>=start&&wi<=end) sums.set(mi,(sums.get(mi)||0)+value);
 return {start,end,weeks:trends.weeks.slice(start,end+1),rows:[...sums].map(([mi,total])=>({...trends.models[mi],mi,total,values:Array.from({length:end-start+1},(_,i)=>trends.points.find(p=>p[0]===start+i&&p[1]===mi)?.[2]??null)})).sort((a,b)=>b.total-a.total)};
}
export function priceValue(model,currency,key){return model.latest?.[`${key}_${currency.toLowerCase()}`]??null;}
export function readState() {
 const p=new URLSearchParams(location.search); const route=p.get('page');
 let saved;try{saved=localStorage.getItem('penguin-locale')}catch{}
 return {priceScope:p.get('scope')==='china'?'china':'global',page:routes.includes(route)?route:'home',lang:['zh','en'].includes(p.get('lang'))?p.get('lang'):saved||'zh',channel:['product','skill'].includes(p.get('channel'))?p.get('channel'):'product',period:['daily','weekly','monthly'].includes(p.get('period'))?p.get('period'):'daily'};
}

export function paginatePrices(rows,requestedPage=1){
 const total=rows.length,pages=Math.max(1,Math.ceil(total/20));
 const page=Math.min(pages,Math.max(1,Number.isFinite(requestedPage)?Math.floor(requestedPage):1));
 const start=(page-1)*20,end=Math.min(start+20,total);
 return {rows:rows.slice(start,end),page,pages,start,end,total};
}
