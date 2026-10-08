import {priceValue} from './data.js';
export const blendedPrice=(input,output)=>input==null||output==null?null:(3*input+output)/4;
export function priceHistory(model,currency,rate){
 const latest=model.latest?.date || model.history?.at(-1)?.[0];
 if(!latest)return [];
 const cutoff=new Date(latest+'T00:00:00Z');cutoff.setUTCDate(cutoff.getUTCDate()-29);
 const first=cutoff.toISOString().slice(0,10);
 const convert=n=>n==null?null:currency===(model.history_currency||'CNY')?n:rate>0?Number((model.history_currency==='USD'?n*rate:n/rate).toFixed(4)):null;
 return (model.history||[]).filter(([date])=>date>=first&&date<=latest).map(([date,input,output])=>({date,input:convert(input),output:convert(output)}));
}
export function modelPrices(model,currency){const input=priceValue(model,currency,'input'),output=priceValue(model,currency,'output');return {input,output,blended:blendedPrice(input,output)}}
