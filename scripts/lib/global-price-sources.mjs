// 第一方文本 Token 报价；各解析器只读取标准按量档，拒绝把缺失价格当成免费。
import { cellText, extractTables } from './formats.mjs';
export const dollars = text => { const match = String(text ?? '').match(/\$\s*([\d]+(?:\.[\d]+)?)/); return match ? Number(match[1]) : /^(?:free|free of charge)$/i.test(String(text).trim()) ? 0 : null; };
const clean = html => String(html).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '');
const slug = name => name.toLowerCase().replace(/[^a-z\d.]+/g, '-').replace(/^-|-$/g, '');
const valid = rows => [...new Map(rows.filter(r => r.id && Number.isFinite(r.input) && Number.isFinite(r.output) && r.input >= 0 && r.output >= 0).map(r => [r.id, r])).values()];
export function parseOpenAI(source) {
  const rows = [], seen = new Set();
  for (const table of extractTables(source)) {
    const h = table.grid[0];
    const standard = table.before === 'Standard pricing data';
    const cyber = h[0] === 'Model' && h[1] === 'Short context input' && /cyber/.test(table.grid.map(r=>r[0]).join(' ')) && !/batch|flex|fast/i.test(table.before);
    const specialized = h.join('|') === 'Category|Model|Input|Cached input|Output';
    if (!standard && !cyber && !specialized) continue;
    for (const row of table.grid.slice(1)) {
      const name = row[specialized ? 1 : 0], id = name.split(/\s*\(/)[0];
      if (seen.has(id)) continue; seen.add(id);
      rows.push({ id, name: id, input: dollars(row[specialized ? 2 : 1]), output: dollars(row[4]), tier: standard || cyber ? 'Standard · short context' + (name.includes('(') ? ' · '+name.slice(name.indexOf('(')) : '') : 'Standard', tiered: dollars(row[5]) != null });
    }
  }
  return valid(rows);
}
export function parseAnthropic(source) {
  const table = extractTables(source).find(t => t.grid[0][1] === 'Base input tokens');
  if (!table) return [];
  const seen = new Set();
  return valid(table.grid.slice(1).flatMap(row => {
    if (/retired/i.test(row[0])) return [];
    const name = row[0].split(/\s*\(/)[0], id = slug(name);
    if (seen.has(id)) return []; seen.add(id);
    return [{id, name, input:dollars(row[1]), output:dollars(row[5]), tier:'Base tokens · global endpoint' + (row[0].includes('for prompts') ? ' · '+row[0].slice(row[0].indexOf('(for prompts')) : ''), tiered:/for prompts/.test(row[0]), note:/limited availability/.test(row[0])?'Limited availability; see provider eligibility requirements.':null}];
  }));
}
// 官网明确给出未来价格时按生效日期选择，避免促销结束后永久沿用旧价。
export function scheduledDollars(text, now = new Date()) {
  const starts = [...String(text).matchAll(/\$\s*([\d.]+)\s+starting\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/g)];
  const active = starts.filter(m => Date.parse(m[2]+' 00:00:00 UTC') <= +now).at(-1);
  return active ? Number(active[1]) : dollars(text);
}
export function parseGoogle(source, now = new Date()) {
  const rows = [];
  for (const section of clean(source).split(/(?=<h2\b)/i)) {
    const heading = section.match(/^<h2[^>]*>([\s\S]*?)<\/h2>/i);
    const id = cellText(section.match(/<code[^>]*>([\s\S]*?)<\/code>/i)?.[1] || '');
    if (!heading || !/^gemini-[\w.-]+$/.test(id) || /image|tts|audio|live|embedding|robotics/.test(id)) continue;
    const table = extractTables(section).find(t=>t.before==='Standard');
    if (!table || !/per 1M tokens in USD/.test(table.grid[0].at(-1))) continue;
    const input = table.grid.find(r=>/^Input price/.test(r[0]))?.at(-1), output = table.grid.find(r=>/^Output price/.test(r[0]))?.at(-1);
    // 音频专用输入、每分钟和每张计费不与文本 Token 混算。
    if (!input || !output || (/\(audio\)/.test(input) && !/text/.test(input)) || (/\(audio\)|\(video\)|image/.test(output) && !/text/.test(output))) continue;
    rows.push({id,name:cellText(heading[1]),input:scheduledDollars(input,now),output:scheduledDollars(output,now),tier:'Standard · paid tier · text · short context',tiered:/prompts|starting|through/.test(input+' '+output),note:'Input: '+input+'; Output: '+output});
  }
  return valid(rows);
}
export function parseXAI(source) {
  const table = extractTables(source).find(t=>t.before==='Text API');
  return valid((table?.grid.slice(2)||[]).map(row=>({id:row[0].split(' ')[0],input:dollars(row[2]),output:dollars(row[4]),context:row[1].endsWith('M')?parseFloat(row[1])*1e6:row[1].endsWith('k')?parseFloat(row[1])*1e3:null,tier:'Text API · short context · '+row[0],tiered:dollars(row[5])!=null})));
}
export function parseWriter(source) {
  const table = extractTables(source).find(t=>t.grid[0].join('|')==='Model name|Model ID|Input / 1M|Output / 1M');
  return valid((table?.grid.slice(1)||[]).map(r=>({id:r[1],name:r[0],input:dollars(r[2]),output:dollars(r[3]),tier:'Base model · standard'})));
}
export function parseArcee(source) {
  return valid(extractTables(source).flatMap(t=>t.grid.slice(1)).filter(r=>/^trinity-/.test(r[0])).map(r=>({id:r[0],input:dollars(r[1]),output:dollars(r[2]),tier:'Text models · standard'})));
}
export function parseThinking(source) {
  return valid(JSON.parse(source).filter(r=>r.tinker_id?.startsWith('thinkingmachines/')).map(r=>({id:r.tinker_id.split('/')[1]+'-'+slug(r.context),name:r.name.includes(r.context)?r.name:r.name+' ('+r.context+')',input:dollars(r.prefill),output:dollars(r.sample),context:parseFloat(r.context)*(/M/i.test(r.context)?1e6:1e3),tier:'Tinker · prefill / sample · '+r.context,tiered:true,note:r.note || null})));
}
// 只解析 JSON 数据，不执行网页代码。
export function embeddedJson(source, marker) {
  const start = source.indexOf(marker); if (start < 0) throw new Error('定价数据块缺失');
  const begin = source.indexOf('{',start+marker.length); let depth=0,quoted=false,escaped=false;
  for(let i=begin;i<source.length;i++){const c=source[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}else if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0)return JSON.parse(source.slice(begin,i+1));}
  throw new Error('定价 JSON 不完整');
}
export function parsePerplexity(source) {
  const pricing = embeddedJson(source,'const PRICING =');
  const sonar = pricing.sonar.models;
  return valid(sonar.map(r=>({id:r.id,name:r.label,input:r.input,output:r.output,tier:'Token price only · standard',note:'Additional request, search, citation and reasoning-token fees may apply; see official pricing.'})));
}
export function parseCohere(source) {
  const rsc = [...source.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)].map(m=>JSON.parse(m[1])).join('');
  const rows=[];
  for (const m of rsc.matchAll(/"modelName":"(Command[^"\\]*)"/g)) {
    // Model objects are serialized JSON on the official page; isolate the containing object.
    const begin = rsc.lastIndexOf('{',m.index), tail = rsc.slice(begin);
    try { const r=embeddedJson('MODEL '+tail,'MODEL '); const p=r.pricings?.find(p=>p.inputLabel==='Input'&&p.outputLabel==='Output');
      if(p && /1M tokens/.test(r.per))rows.push({id:slug(r.modelName),name:r.modelName,input:p.inputPrice,output:p.outputPrice,tier:'Standard · 1M tokens'});
    }catch{}
  }
  return valid(rows);
}
export function parseUpstage(source, now = new Date()) {
  const rows=[];
  for(const card of clean(source).split(/class="pricing-card-v2"/).slice(1)){
    const name=cellText(card.match(/<h4[^>]*>([\s\S]*?)<\/h4>/)?.[1]||'');
    const id=card.match(/https:\/\/console\.upstage\.ai\/docs\/models\/([\w-]+)/)?.[1] || (/^Solar Pro 2$/.test(name)?'solar-pro-2':null);
    if(!id || !/^solar-/.test(id))continue;
    const retirement=cellText(card).match(/End of service on (\d{4}-\d{2}-\d{2}) \(KST\)/)?.[1];
    if(retirement && +now >= Date.parse(retirement+'T00:00:00+09:00'))continue;
    let input=Number(card.match(/data-rate="input"[^>]*>([\d.]+)/)?.[1]??NaN),output=Number(card.match(/data-rate="output"[^>]*>([\d.]+)/)?.[1]??NaN),note=retirement?'End of service: '+retirement+' (KST)':null;
    const schedule=card.match(/<div data-promo="schedule"[^>]*>([\s\S]*?)<\/div>/)?.[1];
    for(const line of (schedule||'').trim().split('\n')){const [from,to,...rates]=line.trim().split('|');if(Date.parse(from)<=+now&&(!to||+now<Date.parse(to))){
      if(rates.includes('free'))input=output=0;else{const p=Object.fromEntries(rates.map(x=>x.split('=')));if(p.input!=null&&p.output!=null){input=Number(p.input);output=Number(p.output);}}
      note='Official promotional rate: '+from+' → '+(to||'until further notice');break;
    }}
    rows.push({id,name,input,output,tier:'Standard · '+(note||'pay as you go'),tiered:Boolean(schedule),note});
  }
  return valid(rows);
}
export const GLOBAL_PRICE_SOURCES = [
  {provider:'openai',name:'OpenAI',url:'https://developers.openai.com/api/docs/pricing',fetchUrl:'https://developers.openai.com/api/docs/pricing.md',parse:parseOpenAI},
  {provider:'anthropic',name:'Anthropic',url:'https://platform.claude.com/docs/en/about-claude/pricing',fetchUrl:'https://platform.claude.com/docs/en/about-claude/pricing.md',parse:parseAnthropic},
  {provider:'google',name:'Google',url:'https://ai.google.dev/gemini-api/docs/pricing?hl=en',parse:parseGoogle},
  {provider:'x-ai',name:'xAI',url:'https://docs.x.ai/developers/pricing',parse:parseXAI},
  {provider:'writer',name:'WRITER',url:'https://dev.writer.com/home/pricing',parse:parseWriter},
  {provider:'arcee-ai',name:'Arcee AI',url:'https://docs.arcee.ai/get-started/pricing',fetchUrl:'https://docs.arcee.ai/get-started/pricing.md',parse:parseArcee},
  {provider:'thinkingmachines',name:'Thinking Machines',url:'https://tinker-docs.thinkingmachines.ai/tinker/models.json',parse:parseThinking},
  {provider:'perplexity',name:'Perplexity',url:'https://docs.perplexity.ai/docs/getting-started/pricing',fetchUrl:'https://docs.perplexity.ai/docs/getting-started/pricing.md',parse:parsePerplexity},
  {provider:'cohere',name:'Cohere',url:'https://cohere.com/pricing',parse:parseCohere},
  {provider:'upstage',name:'Upstage',url:'https://www.upstage.ai/pricing/api',parse:parseUpstage},
];
