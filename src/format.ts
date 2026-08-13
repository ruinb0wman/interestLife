/** 金额格式化工具（展示用，与计算公式无关） */

/** 整元，千分位：1,055,357 元 */
export function formatYuan(n: number): string {
  return `${Math.round(n).toLocaleString('zh-CN')} 元`
}

/** 万元，两位小数：105.54 万 */
export function formatWan(n: number): string {
  return `${(n / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} 万`
}

/** 万元，保留一位小数（图表用）：1,055.4 万 */
export function formatWanShort(n: number): string {
  return `${(n / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 1 })}万`
}

/** 百分数：0.03 → 3% */
export function formatPercent(n: number): string {
  return `${(n * 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}%`
}
