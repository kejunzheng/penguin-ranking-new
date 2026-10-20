// 综合分六大领域：数据里以中文名为键，英文界面显示时在这里翻译。
const DOMAIN_EN={'编程与Agent':'Coding & Agents','推理':'Reasoning','知识':'Knowledge','长上下文':'Long context','多模态':'Multimodal','真人偏好':'Human preference'};
export const domainLabel=(domain,zh)=>zh?domain:(DOMAIN_EN[domain]||domain);

// 评测配置说明由数据管线生成，含少量中文术语；英文界面显示时逐词替换，数据本身不改。
const CONFIG_EN=[
 ['标准/未注明','Standard / unspecified'],['未注明推理强度','reasoning effort unspecified'],['未注明 Agent','agent unspecified'],
 ['每模型最高分配置','best configuration per model'],['日期快照','dated snapshot'],['官网主榜','official leaderboard'],
 ['原生函数调用（FC）','native function calling (FC)'],['提示词模式（Prompt）','prompt mode'],['（OpenAI 发布成绩）',' (OpenAI-reported)'],
 ['默认采样','default sampling'],[/(\d+) 次均值/g,'mean of $1 runs'],[/\s*上下文/g,' context'],['未注明','unspecified'],['；','; '],['（','('],['）',')']
];
export const configLabel=(config,zh)=>{
 if(zh||!config)return config;
 return CONFIG_EN.reduce((text,[from,to])=>typeof from==='string'?text.split(from).join(to):text.replace(from,to),config);
};
