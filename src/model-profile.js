const tidy=value=>String(value||'').toLowerCase().replace(/\(free\)|\bpreview\b/g,'').replace(/[·:_/().-]+/g,' ').replace(/\b(?:19|20)\d{6}\b/g,'').replace(/\s+/g,' ').trim();
const providerKey=model=>tidy(model?.author||model?.provider_name||model?.provider||String(model?.id||model?.slug||'').split('/')[0]);
const modelKey=model=>tidy(model?.name||model?.id||model?.slug);
// 型号 ID 对齐：OpenRouter 价格用 -MMDD（如 deepseek-v4.1-flash-1017），调用数据用 -YYYYMMDD（如 -20261017）；去掉 :free 等变体后缀再比
const idOf=model=>String(model?.id||model?.slug||'').toLowerCase();
const variantOf=model=>idOf(model).split(':')[1]||'';
const slugKey=model=>idOf(model).split(':')[0].replace(/-(?:19|20)\d{2}(\d{4})$/,'-$1');
// 不带日期的别名（如 tencent/hy3-preview）对应调用数据里带日期的版本（tencent/hy3-preview-20260421）
const baseKey=model=>idOf(model).split(':')[0].replace(/-(?:19|20)\d{6}$/,'');

export function findMatchingPriceModel(usageModel,priceModels=[]){
 if(!usageModel)return null;
 const name=modelKey(usageModel),provider=providerKey(usageModel);
 return priceModels
  .filter(model=>(model.status??'active')==='active'&&!String(model.slug||'').includes(':batch'))
  .find(model=>modelKey(model)===name&&providerKey(model)===provider)
  ||priceModels.find(model=>modelKey(model)===name)
  ||null;
}

export function findMatchingUsageModel(priceModel,usageModels=[]){
 if(!priceModel)return null;
 const id=idOf(priceModel),key=slugKey(priceModel),variant=variantOf(priceModel);
 const exact=usageModels.find(model=>idOf(model)===id);if(exact)return exact;
 const sameId=usageModels.filter(model=>slugKey(model)===key);
 if(sameId.length)return sameId.find(model=>variantOf(model)===variant)||sameId[0];
 const base=idOf(priceModel).split(':')[0],sameBase=usageModels.filter(model=>baseKey(model)===base);
 if(sameBase.length){const pick=sameBase.filter(model=>variantOf(model)===variant);return (pick.length?pick:sameBase).sort((a,b)=>idOf(a).localeCompare(idOf(b)))[0];}
 const name=modelKey(priceModel),provider=providerKey(priceModel);
 return usageModels.find(model=>modelKey(model)===name&&providerKey(model)===provider)
  ||usageModels.find(model=>modelKey(model)===name)
  ||null;
}

// 调用榜 / 价格榜模型 → 能力榜模型：按模型名匹配，优先同厂商；只返回有评测记录的模型。
export function findMatchingCapabilityModel(model,capabilityModels=[]){
 if(!model)return null;
 const name=modelKey(model),provider=providerKey(model);
 const candidates=capabilityModels.filter(item=>item.records&&Object.values(item.records).some(list=>list?.length)&&modelKey(item)===name);
 return candidates.find(item=>tidy(item.organization)===provider)||candidates[0]||null;
}
