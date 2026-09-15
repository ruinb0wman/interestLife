import { describe, expect, it } from 'vitest'
import { buildChartOption, type ChartOptionInput } from './chart-option'
import {
  DEFAULT_PARAMS,
  createItem,
  simulate,
  simulateScenario,
  type CashFlowItem,
  type SimParams,
  type YearRow,
} from './lib'

/** 收支项工厂：默认全年 0 元，仅用于给图表提供名称与周期 */
function item(overrides: Partial<CashFlowItem> = {}): CashFlowItem {
  return {
    id: 'chart-item',
    name: '项',
    amount: 0,
    frequency: 'year',
    cycle: 1,
    growth: 0,
    startAge: 30,
    endAge: 90,
    enabled: true,
    ...overrides,
  }
}

/** 手写一行，便于精确构造边界（破产截断、长度不齐） */
function row(
  age: number,
  endPrincipal: number,
  extra: { incomes?: number[]; expenses?: number[]; incomeTotal?: number; expenseTotal?: number } = {},
): YearRow {
  const incomes = extra.incomes ?? []
  const expenses = extra.expenses ?? []
  return {
    age,
    startPrincipal: 0,
    investmentIncome: 0,
    incomes,
    expenses,
    incomeTotal: extra.incomeTotal ?? incomes.reduce((a, b) => a + b, 0),
    expenseTotal: extra.expenseTotal ?? expenses.reduce((a, b) => a + b, 0),
    endPrincipal,
  }
}

/** 展开成便于断言的松散结构，避免和 echarts 的联合类型搏斗 */
function loose(input: ChartOptionInput) {
  return buildChartOption(input) as unknown as {
    xAxis: { data: number[] }
    legend: { data: string[] }
    tooltip: { formatter: (params: unknown) => string }
    series: Array<{
      name: string
      type: string
      data: Array<number | null | [number, number]>
      yAxisIndex?: number
    }>
  }
}

const seriesOf = (opt: ReturnType<typeof loose>, name: string) => {
  const found = opt.series.find((s) => s.name === name)
  if (!found) throw new Error(`缺少系列 ${name}`)
  return found
}

const seriesNames = (opt: ReturnType<typeof loose>) => opt.series.map((s) => s.name)

describe('buildChartOption：时间轴对齐', () => {
  it('时间轴按最长情景铺开，短情景用 null 补齐', () => {
    const opt = loose({
      rows: [row(30, 100), row(31, -50)],
      optimisticRows: [row(30, 100), row(31, 200), row(32, 300), row(33, 400)],
      pessimisticRows: [row(30, 100), row(31, 110), row(32, 120)],
    })

    expect(opt.xAxis.data).toEqual([30, 31, 32, 33])
    expect(seriesOf(opt, '本金·普通').data).toEqual([100, -50, null, null])
    expect(seriesOf(opt, '本金·悲观').data).toEqual([100, 110, 120, null])
    expect(seriesOf(opt, '本金·乐观').data).toEqual([100, 200, 300, 400])
  })

  it('不传乐观/悲观时三条本金线退化为同一条', () => {
    const opt = loose({ rows: [row(30, 100), row(31, 50)] })
    expect(seriesOf(opt, '本金·乐观').data).toEqual([100, 50])
    expect(seriesOf(opt, '本金·普通').data).toEqual([100, 50])
    expect(seriesOf(opt, '本金·悲观').data).toEqual([100, 50])
  })

  it('rows 为空时不抛异常', () => {
    const opt = loose({ rows: [] })
    expect(opt.xAxis.data).toEqual([])
    expect(seriesOf(opt, '本金·普通').data).toEqual([])
  })
})

describe('buildChartOption：动态收支项系列', () => {
  it('每个有数据的收支项各生成一条系列，名称取项名', () => {
    const opt = loose({
      rows: [row(30, 100, { incomes: [12_000, 0], expenses: [36_000, 0] })],
      incomes: [item({ name: '工资' }), item({ name: '从不触发的收入' })],
      expenses: [item({ name: '生活费' }), item({ name: '从未触发' })],
    })

    expect(seriesNames(opt)).toEqual([
      '本金·乐观',
      '本金·普通',
      '本金·悲观',
      '耗尽点',
      '工资',
      '生活费',
    ])
  })

  it('全为 0（未触发 / 已停用）的项不占用图例与色号', () => {
    const opt = loose({
      rows: [row(30, 100, { expenses: [0, 500] })],
      expenses: [item({ name: '停用项', enabled: false }), item({ name: '仅一次', cycle: 0 })],
    })

    expect(seriesNames(opt)).not.toContain('停用项')
    expect(seriesNames(opt)).toContain('仅一次')
  })

  it('「仅一次」的支出用柱状，其余收支项用虚线', () => {
    const opt = loose({
      rows: [row(30, 100, { incomes: [1], expenses: [2, 3] })],
      incomes: [item({ name: '工资' })],
      expenses: [item({ name: '生活费' }), item({ name: '大病', cycle: 0 })],
    })

    expect(seriesOf(opt, '工资').type).toBe('line')
    expect(seriesOf(opt, '生活费').type).toBe('line')
    expect(seriesOf(opt, '大病').type).toBe('bar')
  })

  it('跨收入/支出重名的项自动去重，避免图例联动串名', () => {
    const opt = loose({
      rows: [row(30, 100, { incomes: [1, 2], expenses: [3] })],
      incomes: [item({ name: '同名' }), item({ name: '同名' })],
      expenses: [item({ name: '同名' })],
    })

    expect(seriesNames(opt)).toEqual([
      '本金·乐观',
      '本金·普通',
      '本金·悲观',
      '耗尽点',
      '同名',
      '同名(2)',
      '同名(3)',
    ])
    // 图例与系列一一对应
    expect(opt.legend.data).toEqual(seriesNames(opt))
  })

  it('名称为空的项回退为「收入N / 支出N」', () => {
    const opt = loose({
      rows: [row(30, 100, { incomes: [1], expenses: [2] })],
      incomes: [item({ name: '   ' })],
      expenses: [item({ name: '' })],
    })

    expect(seriesNames(opt)).toContain('收入1')
    expect(seriesNames(opt)).toContain('支出1')
  })

  it('收支项超出普通情景被模拟到的年份时补 null', () => {
    const opt = loose({
      rows: [row(30, 100, { expenses: [5] })],
      optimisticRows: [row(30, 100), row(31, 90), row(32, 80)],
      expenses: [item({ name: '生活费' })],
    })

    expect(seriesOf(opt, '生活费').data).toEqual([5, null, null])
  })
})

describe('buildChartOption：耗尽点', () => {
  it('每个已耗尽的情景各打一个点，未耗尽则不打', () => {
    const exhausted = loose({
      rows: [row(30, 100), row(31, -50)],
      optimisticRows: [row(30, 100), row(31, 200)],
      pessimisticRows: [row(30, 100), row(31, -1)],
    })
    expect(seriesOf(exhausted, '耗尽点').data).toEqual([
      [31, 0],
      [31, 0],
    ])
  })

  it('三个情景都未耗尽时耗尽点为空', () => {
    const healthy = loose({
      rows: [row(30, 100), row(31, 90)],
      optimisticRows: [row(30, 100)],
      pessimisticRows: [row(30, 100)],
    })
    expect(seriesOf(healthy, '耗尽点').data).toEqual([])
  })
})

describe('buildChartOption：图例与系列保持一致', () => {
  it('legend.data 与 series 名称完全对应（顺序也一致）', () => {
    const opt = loose({ rows: [row(30, 100)] })
    expect(opt.legend.data).toEqual(seriesNames(opt))
  })

  it('三种图表类型都被用到：line / scatter / bar', () => {
    const opt = loose({
      rows: [row(30, 100, { expenses: [1] })],
      expenses: [item({ name: '大病', cycle: 0 })],
    })
    expect(new Set(opt.series.map((s) => s.type))).toEqual(new Set(['line', 'scatter', 'bar']))
  })

  it('收支项系列挂在右轴，本金与耗尽点挂在左轴', () => {
    const opt = loose({
      rows: [row(30, 100, { incomes: [1], expenses: [2] })],
      incomes: [item({ name: '工资' })],
      expenses: [item({ name: '生活费' })],
    })
    for (const name of ['工资', '生活费']) {
      expect(seriesOf(opt, name).yAxisIndex).toBe(1)
    }
    for (const name of ['本金·乐观', '本金·普通', '本金·悲观', '耗尽点']) {
      expect(seriesOf(opt, name).yAxisIndex ?? 0).toBe(0)
    }
  })
})

describe('tooltip.formatter', () => {
  const format = (opt: ReturnType<typeof loose>, params: unknown) => opt.tooltip.formatter(params)

  it('跳过 0 值与非数值（散点的 value 是数组）', () => {
    const opt = loose({ rows: [row(30, 100)] })
    const text = format(opt, [
      { seriesName: '本金·普通', value: 1234567, axisValue: '45' },
      { seriesName: '本金·悲观', value: 0, axisValue: '45' },
      { seriesName: '耗尽点', value: [45, 0], axisValue: '45' },
      { seriesName: '年度工资', value: null, axisValue: '45' },
    ])

    expect(text).toContain('年龄 45 岁')
    expect(text).toContain('本金·普通')
    expect(text).not.toContain('本金·悲观')
    expect(text).not.toContain('耗尽点')
    expect(text).not.toContain('年度工资')
  })

  it('全部被过滤时只返回年龄标题', () => {
    const opt = loose({ rows: [row(30, 100)] })
    expect(format(opt, [{ seriesName: '本金·普通', value: 0, axisValue: '60' }])).toBe('年龄 60 岁')
  })
})

describe('buildChartOption：与真实模拟结果联通', () => {
  it('三个情景长度各不相同时，时间轴铺到结束年龄且各自在自己的耗尽年断开', () => {
    // 把生活费抬到 4000 元/月：悲观 4% 先耗尽、普通 8% 随后耗尽、乐观 10% 撑到 90 岁
    const params: SimParams = {
      ...DEFAULT_PARAMS,
      expenses: DEFAULT_PARAMS.expenses.map((e) => (e.name === '生活费' ? { ...e, amount: 4_000 } : e)),
    }
    const neutral = simulate(params)
    const optimistic = simulateScenario(params, params.optimisticReturn)
    const pessimistic = simulateScenario(params, params.pessimisticReturn)

    expect(neutral[neutral.length - 1].age).toBeLessThan(params.endAge)
    expect(neutral[neutral.length - 1].endPrincipal).toBeLessThan(0)
    expect(optimistic[optimistic.length - 1].age).toBe(params.endAge)
    expect(pessimistic.length).toBeLessThan(neutral.length)

    const opt = loose({
      rows: neutral,
      optimisticRows: optimistic,
      pessimisticRows: pessimistic,
      incomes: params.incomes,
      expenses: params.expenses,
    })

    // 时间轴铺到 90 岁，长度取最长情景
    expect(opt.xAxis.data).toHaveLength(optimistic.length)
    expect(opt.xAxis.data[opt.xAxis.data.length - 1]).toBe(params.endAge)

    // 每条线都在自己的耗尽年之后变为 null
    for (const [name, list] of [
      ['本金·普通', neutral],
      ['本金·悲观', pessimistic],
    ] as const) {
      const data = seriesOf(opt, name).data
      expect(data).toHaveLength(opt.xAxis.data.length)
      expect(data[list.length - 1]).toBeLessThan(0)
      expect(data.slice(list.length).every((v) => v === null)).toBe(true)
    }

    // 乐观线全程有值
    expect(seriesOf(opt, '本金·乐观').data.every((v) => typeof v === 'number')).toBe(true)
    // 耗尽点：悲观 + 普通各一个
    expect(seriesOf(opt, '耗尽点').data).toEqual([
      [neutral[neutral.length - 1].age, 0],
      [pessimistic[pessimistic.length - 1].age, 0],
    ])
    // 默认支出项（生活费、换车）都出现在图例里
    expect(seriesNames(opt)).toEqual(expect.arrayContaining(['生活费', '换车']))
  })

  it('默认参数的换车项在各触发年形成尖峰（每 10 年一次）', () => {
    const params = { ...DEFAULT_PARAMS }
    const rows = simulate(params)
    const opt = loose({ rows, expenses: params.expenses })

    const data = seriesOf(opt, '换车').data
    const spikeAges = rows.filter((_, i) => typeof data[i] === 'number' && data[i] !== 0).map((r) => r.age)
    expect(spikeAges).toEqual([40, 50, 60, 70, 80, 90])
  })

  it('createItem 的一次性支出能渲染为柱状系列', () => {
    const params: SimParams = {
      ...DEFAULT_PARAMS,
      expenses: [...DEFAULT_PARAMS.expenses, createItem('oneoff', 30, 90)],
    }
    const opt = loose({ rows: simulate(params), expenses: params.expenses })
    expect(seriesOf(opt, '大病/意外').type).toBe('bar')
  })
})
