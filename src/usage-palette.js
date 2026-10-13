export const chartColors=['#54a1ff','#338fff','#12b8dc','#3accdf','#79a9ff','#8bbfff','#62a1ee','#97c1f5','#b8d8ff','#5483e8'];
// 模型对比（折线）专用分类色：前 5 个色相来自参考分类色板，已用 dataviz 校验器验证浅色 / 深色下色觉障碍可分辨。
// 总量趋势仍用上面的蓝色系（同一指标的堆叠），对比模式下不同模型必须能靠颜色区分。
export const compareColors={light:['#2a78d6','#eb6834','#1baf7a','#eda100','#e87ba4'],dark:['#3987e5','#d95926','#199e70','#c98500','#d55181']};
export const compareColor=(index,theme='light')=>compareColors[theme==='dark'?'dark':'light'][index%5];
