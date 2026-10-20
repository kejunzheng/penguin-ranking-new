// 分享图底部品牌行：带上该榜数据的日期（按北京时间取日期）
export function dataDay(value){
 if(!value)return null;
 const s=String(value);
 if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
 const d=new Date(s);
 if(Number.isNaN(d.getTime()))return null;
 return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
}
// date 可以是一个日期，也可以是已拼好的多段日期说明（如“能力 2026-10-20，调用 2026-10-19”）
export function brandLine(lang,date){
 const zh=lang==='zh',day=dataDay(date);
 const when=day?(zh?`数据截至 ${day}`:`data as of ${day}`):date?(zh?`数据截至 ${date}`:`data as of ${date}`):'';
 return [zh?'企鹅智库 · AI 趋势榜':'Penguin Intelligence · AI Trend Rankings',when].filter(Boolean).join(' · ');
}
