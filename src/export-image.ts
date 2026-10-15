// 导出图片：把图表 PNG 与一条参数摘要页脚合成到同一张画布上，然后触发下载。
//
// 只做一件事：让看图的人不用再问「这是什么参数」。所以
//   - 不往图片里嵌参数、不做导入，图片就是图片；
//   - 不导指标卡 / 逐年明细表（整页截图要 html-to-image 之类依赖）；
//   - 页脚文案 buildFooterLines / exportFileName 是纯函数、有单测；画布合成依赖真实
//     canvas（happy-dom 的 getContext('2d') 是 null），不走单测，靠真浏览器验。

import { formatPercent, formatWan, formatYuan } from './format'
import { averageAnnualAmount, perOccurrenceAmount, type CashFlowItem, type SimParams } from './lib'

/** getDataURL 的导出倍率；合成时按它把像素尺寸除回 CSS 尺寸 */
export const EXPORT_PIXEL_RATIO = 2

/** 页脚最多列出的项数，超出折叠成一行「…另外 N 项」 */
export const FOOTER_MAX_ITEMS = 12

/** 页脚配色沿用页面主题：canvas 默认透明，深色文字贴到白底聊天窗口里就没法看了 */
const BACKGROUND = '#202127'
const BORDER = '#3c3f44'
const TEXT = '#dfdfd6'
const FONT_STACK =
  "system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', Roboto, sans-serif"
const FONT_SIZE = 14
const LINE_HEIGHT = 24
const PADDING = 20

/** 周期的紧凑说法，页脚一行装得下（CashFlowItemRow 里那串详细描述太长） */
function periodLabel(item: CashFlowItem): string {
  if (item.period === 'month') return item.interval === 1 ? '每月' : `每 ${item.interval} 个月`
  return item.interval === 1 ? '每年' : `每 ${item.interval} 年`
}

function itemLine(label: '收入' | '支出', item: CashFlowItem): string {
  const amount =
    item.period === 'once'
      ? `${formatYuan(perOccurrenceAmount(item, item.startAge))}/次`
      : `年额约 ${formatYuan(averageAnnualAmount(item))}`
  // 一次性项的涨幅与年龄区间没有信息量（区间就是那一年），只留「N 岁一次」
  const period =
    item.period === 'once'
      ? `${item.startAge} 岁一次`
      : `${periodLabel(item)} · ${item.growth === 0 ? '' : `涨 ${formatPercent(item.growth)} · `}${
          item.startAge === item.endAge ? `${item.startAge} 岁` : `${item.startAge}→${item.endAge} 岁`
        }`
  return `${label} ${item.name} ${amount} · ${period}${item.enabled ? '' : '（已关闭）'}`
}

/** 页脚全文（含表头两行），一行一条，按收入 → 支出的顺序 */
export function buildFooterLines(params: SimParams): string[] {
  const lines = [
    `${params.startAge} → ${params.endAge} 岁 · 初始本金 ${formatWan(params.initialPrincipal)}`,
    `年化收益 普通 ${formatPercent(params.annualReturn)} / 乐观 ${formatPercent(
      params.optimisticReturn,
    )} / 悲观 ${formatPercent(params.pessimisticReturn)}`,
  ]

  const items = [
    ...params.incomes.map((item) => itemLine('收入', item)),
    ...params.expenses.map((item) => itemLine('支出', item)),
  ]
  if (items.length === 0) return [...lines, '（没有收支项）']

  const shown = items.slice(0, FOOTER_MAX_ITEMS)
  if (items.length > FOOTER_MAX_ITEMS) {
    shown.push(`…另外 ${items.length - FOOTER_MAX_ITEMS} 项（见参数面板）`)
  }
  return [...lines, ...shown]
}

/** 文件名：躺平模拟器_30-90岁_2026-10-15.png（日期取本地时区） */
export function exportFileName(params: SimParams, now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  return `躺平模拟器_${params.startAge}-${params.endAge}岁_${date}.png`
}

/**
 * 合成并下载，返回文件名（供调用方提示用户）。
 * 失败直接抛，由调用方 toast —— 这里不吞异常。
 */
export async function exportChartImage(chartDataUrl: string, params: SimParams): Promise<string> {
  const image = new Image()
  image.src = chartDataUrl
  await image.decode()

  // getDataURL 给的是 2x 像素，先按 CSS 尺寸合成，最后整体放大一次：
  // 免得页脚每个尺寸都乘倍率，也不会出现「图清楚了、字还是 14px」
  const width = Math.round(image.width / EXPORT_PIXEL_RATIO)
  const chartHeight = Math.round(image.height / EXPORT_PIXEL_RATIO)
  const lines = buildFooterLines(params)
  const footerHeight = PADDING * 2 + lines.length * LINE_HEIGHT

  const flat = document.createElement('canvas')
  flat.width = width
  flat.height = chartHeight + footerHeight
  const ctx = flat.getContext('2d')
  if (!ctx) throw new Error('无法创建画布上下文')

  ctx.fillStyle = BACKGROUND
  ctx.fillRect(0, 0, flat.width, flat.height)
  ctx.drawImage(image, 0, 0, width, chartHeight)

  ctx.strokeStyle = BORDER
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, chartHeight + 0.5)
  ctx.lineTo(flat.width, chartHeight + 0.5)
  ctx.stroke()

  ctx.fillStyle = TEXT
  ctx.font = `${FONT_SIZE}px ${FONT_STACK}`
  ctx.textBaseline = 'middle'
  // 第四参数让超长行压缩到可用宽度：页脚高度是按行数预算的，换行会把最后一行推出画布
  const maxTextWidth = width - PADDING * 2
  lines.forEach((line, index) => {
    ctx.fillText(line, PADDING, chartHeight + PADDING + index * LINE_HEIGHT + LINE_HEIGHT / 2, maxTextWidth)
  })

  const out = document.createElement('canvas')
  out.width = flat.width * EXPORT_PIXEL_RATIO
  out.height = flat.height * EXPORT_PIXEL_RATIO
  const outCtx = out.getContext('2d')
  if (!outCtx) throw new Error('无法创建画布上下文')
  outCtx.imageSmoothingQuality = 'high'
  outCtx.drawImage(flat, 0, 0, out.width, out.height)

  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('图片编码失败')

  const filename = exportFileName(params)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // 立刻 revoke 会让部分浏览器的下载中断，延后一拍
  setTimeout(() => URL.revokeObjectURL(url), 1000)

  return filename
}
