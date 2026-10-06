import {writeFile} from 'node:fs/promises';
import {reportFreshness} from './lib/net.mjs';

const api='https://api.skillhub.cn';
const headers={'user-agent':'PenguinIndex/1.0 (+https://yonge6.github.io/penguin-index/)'};
async function json(path){const response=await fetch(api+path,{headers});if(!response.ok)throw new Error(`${response.status} ${path}`);return response.json()}
// 只输出前台 SkillhubExplorer 实际读取的字段：
// - 不再输出 slug / handle / verified / updated_at（前台未使用）；
// - 不再输出 url，前台按 `https://skillhub.cn/skills/${id}` 拼接（与原 url 规则完全一致）；
// - 简介在表格中最多显示 2 行（约 110 个汉字），保留前 200 个字符足够展示与搜索。
const DESCRIPTION_LIMIT=200;
const compact=skill=>({
 id:`${skill.namespace?.handle||skill.ownerName||'skillhub'}/${skill.slug}`,
 name:skill.name,
 description:String(skill.description_zh||skill.description||'').replace(/\s+/g,' ').trim().slice(0,DESCRIPTION_LIMIT),
 category:skill.category||'uncategorized',
 downloads:Number(skill.downloads)||0,
 stars:Number(skill.stars)||0,
 source:skill.source||'SkillHub',
 icon_url:skill.iconUrl||null,
});

const trendingPayload=await json('/api/v1/showcase/trending');
const trending=(trendingPayload.skills||[]).slice(0,100).map(compact);
const downloads=[];
for(let page=1;page<=10;page++){
 const payload=await json(`/api/skills?page=${page}&pageSize=100&sortBy=downloads`);
 const rows=payload.data?.skills||[];
 downloads.push(...rows.map(compact));
 if(rows.length<100)break;
}
// 定时任务保护：上游异常返回空/过少数据时直接失败，保留旧快照，不用坏数据覆盖。
if(trending.length<50||downloads.length<500)throw new Error(`SkillHub 返回数据过少：trending=${trending.length} downloads=${downloads.length}`);
const output={schema_version:1,generated_at:new Date().toISOString(),source_url:'https://skillhub.cn/skills',rules:{trending_limit:100,downloads_limit:1000},trending,downloads:downloads.slice(0,1000)};
await writeFile(new URL('../public/data/skillhub.json',import.meta.url),JSON.stringify(output));
console.log(`SKILLHUB_UPDATED trending=${output.trending.length} downloads=${output.downloads.length} generated_at=${output.generated_at}`);
reportFreshness([{dataset:'SkillHub 榜',file:'data/skillhub.json',source:'https://api.skillhub.cn',mode:'live',latest:output.generated_at}]);
