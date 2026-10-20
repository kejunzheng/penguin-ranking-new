const tidy=value=>String(value||'').toLowerCase().replace(/\(free\)|\bpreview\b/g,'').replace(/[·:_/().-]+/g,' ').replace(/\b(?:19|20)\d{6}\b/g,'').replace(/\s+/g,' ').trim();
const providerKey=model=>tidy(model?.author||model?.provider_name||model?.provider||String(model?.id||model?.slug||'').split('/')[0]);
const modelKey=model=>tidy(model?.name||model?.id||model?.slug);

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
