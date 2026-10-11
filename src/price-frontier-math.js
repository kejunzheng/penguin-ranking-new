// 价格斩杀线的纯计算部分（组件与测试共用）
// 只画评测榜收录、且 AA 实测分数不低于 MIN_SCORE 的模型；价格为 0 的无法放在对数轴上，不画。
export const MIN_SCORE=35;
export const TICKS=[0.1,0.3,1,3,10,30,100,300];

export function blendedPrice(point,blend,rate){
 const cache=point.cache??point.input;
 const total=blend.cache+blend.input+blend.output;
 return (blend.cache*cache+blend.input*point.input+blend.output*point.output)/total*(rate||1);
}

export function frontierOf(points){
 const sorted=[...points].sort((a,b)=>a.price-b.price||b.score-a.score);
 const line=[];
 for(const point of sorted)if(!line.length||point.score>line.at(-1).score)line.push(point);
 return line;
}

