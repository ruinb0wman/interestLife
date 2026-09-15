// 现金流图的 ECharts 配置构造：纯函数，与 DOM / 实例生命周期解耦，便于单测。
import type { YearRow } from './lib'
import { formatWanShort } from './format'
import type { LineSeriesOption, ChartOption } from './chart-setup'

/** 三个情景的逐年数据。optimistic/pessimistic 缺省时退化为普通（单情景） */
export interface ChartOptionInput {
  rows: YearRow[]
  optimisticRows?: YearRow[]
  pessimisticRows?: YearRow[]
}

const PRINCIPAL_COLORS = {
  optimistic: '#3dd68c',
  neutral: '#a8b1ff',
  pessimistic: '#f9b44e',
}

/**
 * 年度收支的合并系列：**所有收入项合成一条、所有支出项合成一条**，
 * 不再逐项画线（项数多时右轴会糊成一片，且各项的周期差异看图也读不出来）。
 * 颜色刻意避开三个本金情景的绿/紫/琥珀，避免与左轴曲线混淆。
 */
const CASHFLOW_COLORS = {
  income: '#22d3ee',
  expense: '#f0abfc',
}

/** 会被画成系列的数值列 */
type SeriesKey = 'endPrincipal' | 'incomeTotal' | 'expenseTotal'

/**
 * 取某列数据；超出该情景被模拟到的年份时补 null，
 * 让曲线在耗尽处自然断开而不是掉到 0。
 */
function pick(list: YearRow[], key: SeriesKey, length: number): Array<number | null> {
  return Array.from({ length }, (_, i) => (list[i] ? list[i][key] : null))
}

function hasNonZero(data: Array<number | null>): boolean {
  return data.some((v) => typeof v === 'number' && v !== 0)
}

export function buildChartOption(input: ChartOptionInput): ChartOption {
  const { rows } = input
  const optimisticRows = input.optimisticRows ?? rows
  const pessimisticRows = input.pessimisticRows ?? rows
  const startAge = rows[0]?.age ?? 0

  // 破产截断后三个情景的年份长度不再相同：统一按最长情景铺时间轴，
  // 较短的情景用 null 补齐，这样每条曲线在各自耗尽的那一年自然断开。
  const length = Math.max(rows.length, optimisticRows.length, pessimisticRows.length)
  const ages = Array.from({ length }, (_, i) => startAge + i)

  const main = pick(rows, 'endPrincipal', length)
  const optimistic = pick(optimisticRows, 'endPrincipal', length)
  const pessimistic = pick(pessimisticRows, 'endPrincipal', length)

  // 耗尽点：每个情景最后一个被模拟到的年份（年末本金为负即已耗尽）
  const depletedPoints: Array<[number, number]> = []
  for (const list of [rows, optimisticRows, pessimisticRows]) {
    const last = list[list.length - 1]
    if (last && last.endPrincipal < 0) depletedPoints.push([last.age, 0])
  }

  // 年度收支：只按「收入合计 / 支出合计」两条线呈现（只取普通情景）。
  // 全年为 0 的系列不占图例，也不占色号。
  const cashflowSeries: LineSeriesOption[] = []
  if (hasNonZero(pick(rows, 'incomeTotal', length))) {
    cashflowSeries.push({
      name: '收入合计',
      type: 'line',
      data: pick(rows, 'incomeTotal', length),
      symbol: 'none',
      yAxisIndex: 1,
      lineStyle: { width: 1.5, type: 'dashed', color: CASHFLOW_COLORS.income },
      itemStyle: { color: CASHFLOW_COLORS.income },
    })
  }
  if (hasNonZero(pick(rows, 'expenseTotal', length))) {
    cashflowSeries.push({
      name: '支出合计',
      type: 'line',
      data: pick(rows, 'expenseTotal', length),
      symbol: 'none',
      yAxisIndex: 1,
      lineStyle: { width: 2, color: CASHFLOW_COLORS.expense },
      itemStyle: { color: CASHFLOW_COLORS.expense },
    })
  }

  // 图例与系列一一对应（s.name 在类型上是可选的，这里收回成 string）
  const cashflowLegend = cashflowSeries.flatMap((s) => (typeof s.name === 'string' ? [s.name] : []))

  return {
    color: [PRINCIPAL_COLORS.neutral, PRINCIPAL_COLORS.optimistic, PRINCIPAL_COLORS.pessimistic],
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      backgroundColor: 'rgba(32,33,39,0.96)',
      borderColor: '#3c3f44',
      textStyle: { color: '#dfdfd6' },
      formatter(params: unknown) {
        const list = params as Array<{
          seriesName: string
          value: number | number[] | null
          axisValue: string
        }>
        // 散点（耗尽点）的 value 是数组，非数值项直接跳过
        const lines = list
          .filter((p) => typeof p.value === 'number' && p.value !== 0)
          .map((p) => `${p.seriesName}：${formatWanShort(p.value as number)} 元`)
        const head = `年龄 ${list[0]?.axisValue} 岁`
        return lines.length === 0 ? head : `${head}<br/>${lines.join('<br/>')}`
      },
    },
    legend: {
      top: 0,
      type: 'scroll',
      textStyle: { color: '#98989f' },
      data: ['本金·乐观', '本金·普通', '本金·悲观', '耗尽点', ...cashflowLegend],
    },
    grid: { left: 80, right: 80, top: 46, bottom: 30 },
    xAxis: {
      type: 'category',
      data: ages,
      name: '年龄（岁）',
      nameLocation: 'middle',
      nameGap: 28,
      nameTextStyle: { color: '#98989f' },
      axisLine: { lineStyle: { color: '#3c3f44' } },
      axisLabel: {
        color: '#98989f',
        interval: Math.max(1, Math.round(ages.length / 15)),
      },
    },
    yAxis: [
      {
        type: 'value',
        name: '本金（元）',
        nameTextStyle: { color: '#98989f' },
        axisLabel: { color: '#98989f', formatter: (v: number) => formatWanShort(v) },
        axisLine: { lineStyle: { color: '#3c3f44' } },
        splitLine: { lineStyle: { color: '#2e2e32' } },
      },
      {
        type: 'value',
        name: '年度收支（元）',
        nameTextStyle: { color: '#98989f' },
        axisLabel: { color: '#98989f', formatter: (v: number) => formatWanShort(v) },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: '本金·乐观',
        type: 'line',
        data: optimistic,
        symbol: 'none',
        lineStyle: { width: 1.5, type: 'dashed', color: PRINCIPAL_COLORS.optimistic },
      },
      {
        name: '本金·普通',
        type: 'line',
        data: main,
        symbol: 'none',
        lineStyle: { width: 2.5, color: PRINCIPAL_COLORS.neutral },
        areaStyle: { color: 'rgba(168, 177, 255, 0.10)' },
        markLine: {
          symbol: 'none',
          silent: true,
          label: { show: false },
          lineStyle: { color: '#f66f81', type: 'dashed', width: 1 },
          data: [{ yAxis: 0 }],
        },
      },
      {
        name: '本金·悲观',
        type: 'line',
        data: pessimistic,
        symbol: 'none',
        lineStyle: { width: 1.5, type: 'dashed', color: PRINCIPAL_COLORS.pessimistic },
      },
      {
        name: '耗尽点',
        type: 'scatter',
        data: depletedPoints,
        symbolSize: 9,
        itemStyle: { color: '#f66f81', borderColor: '#1b1b1f', borderWidth: 2 },
        yAxisIndex: 0,
        z: 5,
      },
      ...cashflowSeries,
    ],
  }
}
