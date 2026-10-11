const root=import.meta.env.BASE_URL;
// H5 发布工具会把代码里的图片字面量替换成 CDN 绝对地址；拼接后若含绝对地址，直接取出使用。
export function assetUrl(path){const abs=/https?:\/\/.+$/.exec(path);return abs?abs[0]:root+path;}
// H5 版把 data/*.json 内联到 window.__PENGUIN_DATA__（base64 编码），优先读取；普通站点照常请求。
export function loadJson(path){const inline=typeof window!=='undefined'&&window.__PENGUIN_DATA__?.[path];if(inline)return Promise.resolve(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(inline),c=>c.charCodeAt(0)))));return fetch(root+path).then(r=>{if(!r.ok)throw Error(r.status);return r.json()});}
