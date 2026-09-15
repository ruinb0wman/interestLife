// 现金流图的 ECharts 配置构造：纯函数，与 DOM / 实例生命周期解耦，便于单测。
import type { CashFlowItem, YearRow } from './lib'
import { formatWanShort } from './format'
import type { BarSeriesOption, ChartOption, LineSeriesOption } from './chart-setup'

/** 三个情景的逐年数据 + 收支项定义。optimistic/pessimistic 缺省时退化为普通（单情景） */
export interface ChartOptionInput {
  rows: YearRow[]
  optimisticRows?: YearRow[]
  pessimisticRows?: YearRow[]
  /** 收入项定义（与 YearRow.incomes 同序），用于图例名称与「仅一次」的柱状呈现 */
  incomes?: CashFlowItem[]
  expenses?: CashFlowItem[]
}

const PRINCIPAL_COLORS = {
  optimistic: '#3dd68c',
  neutral: '#a8b1ff',
  pessimistic: '#f9b44e',
}

/** 收支项的调色板：项数超出后循环取用 */
const ITEM_COLORS = [
  '#38bdf8',
  '#c8abfa',
  '#fb923c',
  '#f0abfc',
  '#4ade80',
  '#facc15',
  '#22d3ee',
  '#f87171',
  '#a3e635',
  '#818cf8',
  '#e879f9',
  '#2dd4bf',
]

/** 某项的逐年金额；超出该情景被模拟到的年份时补 null，让曲线在耗尽处自然断开 */
function pickItem(
  list: YearRow[],
  key: 'incomes' | 'expenses',
  index: number,
  length: number,
): Array<number | null> {
  return Array.from({ length }, (_, i) => (list[i] ? (list[i][key][index] ?? 0) : null))
}

function hasNonZero(data: Array<number | null>): boolean {
  return data.some((v) => typeof v === 'number' && v !== 0)
}

/**
 * 图例名去重：收支两个列表共用一个已用名集合，避免「收入/支出同名」时
 * ECharts 把两个 series 当成同一个（图例点击会联动、tooltip 会串名）。
 */
function uniqueNames(items: CashFlowItem[], fallback: string, used: Map<string, number>): string[] {
  return items.map((item, index) => {
    const base = item.name.trim() || `${fallback}${index + 1}`
    const seen = used.get(base) ?? 0
    used.set(base, seen + 1)
    return seen === 0 ? base : `${base}(${seen + 1})`
  })
}

interface ItemSpec {
  name: string
  data: Array<number | null>
  /** 仅一次的支出用柱状呈现，其余用虚线 */
  oneOff: boolean
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
  const pick = (list: YearRow[], key: 'endPrincipal') =>
    Array.from({ length }, (_, i) => (list[i] ? (list[i][key] as number) : null))

  const main = pick(rows, 'endPrincipal')
  const optimistic = pick(optimisticRows, 'endPrincipal')
  const pessimistic = pick(pessimisticRows, 'endPrincipal')

  // 耗尽点：每个情景最后一个被模拟到的年份（年末本金为负即已耗尽）
  const depletedPoints: Array<[number, number]> = []
  for (const list of [rows, optimisticRows, pessimisticRows]) {
    const last = list[list.length - 1]
    if (last && last.endPrincipal < 0) depletedPoints.push([last.age, 0])
  }

  const incomes = input.incomes ?? []
  const expenses = input.expenses ?? []
  const used = new Map<string, number>()
  const incomeNames = uniqueNames(incomes, '收入', used)
  const expenseNames = uniqueNames(expenses, '支出', used)

  const specs: ItemSpec[] = []
  incomes.forEach((_item, index) => {
    const data = pickItem(rows, 'incomes', index, length)
    if (hasNonZero(data)) specs.push({ name: incomeNames[index], data, oneOff: false })
  })
  expenses.forEach((item, index) => {
    const data = pickItem(rows, 'expenses', index, length)
    if (hasNonZero(data)) specs.push({ name: expenseNames[index], data, oneOff: item.cycle === 0 })
  })

  // 只在有数据时占一个色号，避免「被过滤掉的项」把调色板空耗掉
  const itemSeries: Array<LineSeriesOption | BarSeriesOption> = specs.map((spec, index) => {
    const color = ITEM_COLORS[index % ITEM_COLORS.length]
    if (spec.oneOff) {
      const series: BarSeriesOption = {
        name: spec.name,
        type: 'bar',
        data: spec.data,
        itemStyle: { color },
        yAxisIndex: 1,
        barMaxWidth: 12,
      }
      return series
    }
    const series: LineSeriesOption = {
      name: spec.name,
      type: 'line',
      data: spec.data,
      symbol: 'none',
      yAxisIndex: 1,
      lineStyle: { width: 1.5, type: 'dashed', color },
      itemStyle: { color },
    }
    return series
  })

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
      data: ['本金·乐观', '本金·普通', '本金·悲观', '耗尽点', ...specs.map((s) => s.name)],
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
      ...itemSeries,
    ],
  }
}
