import { execFile } from 'node:child_process';
import { getBuffer, getText, today } from './net.mjs';

export const GRAPHWALKS_SOURCE = 'https://www-cdn.anthropic.com/0b4915911bb0d19eca5b5ee635c80fef830a37ea.pdf';
export const ADDITIONAL_BENCHMARKS = [
 {id:'graphwalks',source_name:'GraphWalks',display_name:'GraphWalks',canonical_name:'GraphWalks BFS 256K',category:'长上下文',official_url:'https://huggingface.co/datasets/openai/graphwalks',update_mode:'result_addition',evidence_target:'B',ingestion_status:'live',score_label:'F1',rank_basis:'source_scores',rank_note:'BFS · 256K · F1；当前采用 Claude Opus 4.8 系统卡表 8.9.A 的 4 项公开成绩，按得分降序生成名次，不代表全行业排名。',rank_note_en:'BFS · 256K · F1. Ranks are derived from the four published results in Claude Opus 4.8 system card Table 8.9.A, not an industry-wide ranking.'},
 {id:'chartography',source_name:'Chartography',display_name:'Chartography',canonical_name:'Chartography',category:'视觉理解',official_url:'https://surgehq.ai/benchmarks/chartography',update_mode:'result_addition',evidence_target:'A',ingestion_status:'live',score_label:'Score',rank_basis:'source_scores',rank_note:'采用 Surge AI 官网 Chartography 主榜成绩，按得分降序生成名次，同分并列；不混用旧版 Pareto 图或有工具版本的成绩。',rank_note_en:'Ranks are derived from the scores on Surge AI’s main Chartography leaderboard, with tied scores sharing a rank. Older Pareto-chart data and tool-assisted results are not mixed in.'},
 {id:'agents_last_exam',source_name:'Agents’ Last Exam',display_name:"Agents’ Last Exam",canonical_name:"Agents’ Last Exam · Overall",category:'Agent能力',official_url:'https://snorkel.ai/leaderboard/agents-last-exam/',update_mode:'result_addition',evidence_target:'A',ingestion_status:'live',score_label:'Pass Rate',rank_basis:'source',rank_note:'采用 Overall 主榜的原始名次与 Pass Rate（完全成功率），保留每个模型＋框架的官网默认最佳推理配置；不混用含部分得分的 Score 或其他任务分组。其他推理强度不沿用最佳配置的名次。',rank_note_en:'Uses source ranks and strict Pass Rate from the Overall table, retaining each model/harness pair’s default best effort. Partial-credit Score, other task splits and unranked effort levels are not assigned these ranks.'},
];

const decode = text => String(text).replace(/&quot;/g,'"').replace(/&#0*39;|&apos;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ');
const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)].map(match=>[match[1],decode(match[2])]));
const plain = html => decode(html.replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
function divBlock(html,start){
 const tags=/<\/?div\b[^>]*>/gi;tags.lastIndex=start;let depth=0;
 for(let match=tags.exec(html);match;match=tags.exec(html)){
  depth+=match[0].startsWith('</')?-1:1;
  if(depth===0)return html.slice(start,tags.lastIndex);
 }
 throw new Error('Incomplete leaderboard div');
}
function byClass(html,className){
 for(const match of html.matchAll(/<div\b[^>]*>/gi)){
  if((attrs(match[0]).class||'').split(/\s+/).includes(className))return plain(divBlock(html,match.index));
 }
 throw new Error('Missing class '+className);
}
function rankScores(rows){
 const sorted=[...rows].sort((a,b)=>b.score-a.score||a.raw.localeCompare(b.raw));
 return sorted.map((row,index)=>({...row,rank:index&&row.score===sorted[index-1].score?sorted.findIndex(other=>other.score===row.score)+1:index+1}));
}
export function parseChartography(html){
 if(!/<h1\b[^>]*>\s*Chartography\s*<\/h1>/i.test(html))throw new Error('Not the Chartography page');
 const start=html.search(/<div\b[^>]*data-leaderboard-table=""[^>]*>/i);
 if(start<0)throw new Error('Missing Chartography main table');
 const table=divBlock(html,start),rows=[];
 for(const match of table.matchAll(/<div\b[^>]*data-leaderboard-row=""[^>]*>/gi)){
  const block=divBlock(table,match.index),brand=byClass(block,'head-rank-table-brand'),name=byClass(block,'head-rank-table-name');
  const score=Number(block.match(/\bdata-score="([\d.]+)"/)?.[1]);
  if(!name||!Number.isFinite(score)||score<0||score>100)throw new Error('Invalid Chartography row');
  const raw=brand===name?name:`${brand} ${name}`;
  const effort=name.match(/\(([^()]*(?:reasoning|thinking|adaptive|max)[^()]*)\)\s*$/i)?.[1]||'未注明';
  rows.push({benchmarkId:'chartography',raw,score,config:`官网主榜 · ${effort}`,source:'https://surgehq.ai/benchmarks/chartography'});
 }
 if(rows.length<10)throw new Error('Too few Chartography rows');
 return rankScores(rows);
}
export async function fetchChartography(){return {date:today(),dataDate:null,rows:parseChartography(await getText('https://surgehq.ai/benchmarks/chartography'))};}

export function parseAgentsLastExam(html){
 const start=html.search(/<div\b[^>]*class="tb-tab-content active"[^>]*data-tab="overall"[^>]*>/i);
 if(start<0)throw new Error('Missing ALE Overall table');
 const end=html.indexOf('</table>',start);if(end<0)throw new Error('Incomplete ALE Overall table');
 const rows=[];
 for(const match of html.slice(start,end).matchAll(/<tr\b[^>]*>/gi)){
  const a=attrs(match[0]);if(!a['data-model'])continue;
  const rank=Number(a['data-rank']),score=Number(a['data-pass_rate_pct']);
  if(!Number.isInteger(rank)||rank<1||!Number.isFinite(score)||score<0||score>100||!a['data-harness'])throw new Error('Invalid ALE row');
  rows.push({benchmarkId:'agents_last_exam',raw:a['data-model'],rank,score,source:'https://snorkel.ai/leaderboard/agents-last-exam/',config:`Overall · Pass Rate · ${a['data-harness']} · ${a['data-effort']||'未注明'}`});
 }
 if(rows.length<10||new Set(rows.map(r=>r.rank)).size!==rows.length)throw new Error('Invalid ALE rank coverage');
 return rows;
}
export async function fetchAgentsLastExam(){return {date:today(),dataDate:null,rows:parseAgentsLastExam(await getText('https://snorkel.ai/leaderboard/agents-last-exam/'))};}

export function parseGraphwalks(text){
 const section=text.slice(text.lastIndexOf('8.9 Long context: GraphWalks'));
 const header=section.slice(0,section.indexOf('GraphWalks BFS')).replace(/\s+/g,' ');
 if(!header.includes('Evaluation Claude Claude Claude GPT-5.5 (F1 Score) Opus 4.8 Opus 4.7 Opus 4.6'))throw new Error('GraphWalks model headers changed');
 const scores=section.match(/GraphWalks BFS\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+256K subset/);
 if(!scores)throw new Error('Missing GraphWalks BFS 256K results');
 const names=['Claude Opus 4.8','Claude Opus 4.7','Claude Opus 4.6','GPT-5.5'];
 return rankScores(names.map((raw,index)=>{
  const score=Number(scores[index+1]);if(!Number.isFinite(score)||score<0||score>100)throw new Error('Invalid GraphWalks score');
  return {benchmarkId:'graphwalks',raw,score,source:GRAPHWALKS_SOURCE,config:index===3?'BFS · 256K · F1 · xHigh（OpenAI 发布成绩）':'BFS · 256K · F1 · 默认采样 · 5 次均值'};
 }));
}
export async function fetchGraphwalks(){
 const pdf=await getBuffer(GRAPHWALKS_SOURCE);
 const text=await new Promise((resolve,reject)=>{
  const child=execFile('pdftotext',['-layout','-','-'],{maxBuffer:8*1024*1024,timeout:45000},(error,stdout)=>error?reject(error):resolve(stdout));
  child.stdin.on('error',()=>{});child.stdin.end(pdf);
 });
 const publication=text.slice(0,350).match(/([A-Z][a-z]+ \d{1,2}, 20\d{2})/);
 const date=publication&&Date.parse(publication[1]+' UTC');
 return {date:today(),dataDate:Number.isFinite(date)?new Date(date).toISOString().slice(0,10):null,rows:parseGraphwalks(text)};
}
export const ADDITIONAL_SOURCES = [
 {name:'GraphWalks',benchmarks:['graphwalks'],fetch:fetchGraphwalks},
 {name:'Chartography',benchmarks:['chartography'],fetch:fetchChartography},
 {name:"Agents’ Last Exam",benchmarks:['agents_last_exam'],fetch:fetchAgentsLastExam},
];
