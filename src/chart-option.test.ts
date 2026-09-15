import { describe, expect, it } from 'vitest'
import { buildChartOption, type ChartOptionInput } from './chart-option'
import {
  cloneParams,
  DEFAULT_PARAMS,
  createItem,
  simulate,
  simulateScenario,
  type SimParams,
  type YearRow,
} from './lib'

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

describe('buildChartOption：合并后的年度收支', () => {
  it('收支项合并为「收入合计 / 支出合计」两条线，不再逐项生成系列', () => {
    const opt = loose({
      rows: [
        row(30, 100, { incomes: [12_000], incomeTotal: 12_000, expenses: [36_000], expenseTotal: 36_000 }),
        row(31, 90, { expenses: [24_000], expenseTotal: 24_000 }),
      ],
    })

    expect(seriesNames(opt)).toEqual([
      '本金·乐观',
      '本金·普通',
      '本金·悲观',
      '耗尽点',
      '收入合计',
      '支出合计',
    ])
    expect(seriesOf(opt, '收入合计').data).toEqual([12_000, 0])
    expect(seriesOf(opt, '支出合计').data).toEqual([36_000, 24_000])
  })

  it('两条线都是折线并挂在右轴', () => {
    const opt = loose({
      rows: [row(30, 100, { incomes: [1], incomeTotal: 1, expenses: [2], expenseTotal: 2 })],
    })

    for (const name of ['收入合计', '支出合计']) {
      expect(seriesOf(opt, name).type).toBe('line')
      expect(seriesOf(opt, name).yAxisIndex).toBe(1)
    }
    for (const name of ['本金·乐观', '本金·普通', '本金·悲观', '耗尽点']) {
      expect(seriesOf(opt, name).yAxisIndex ?? 0).toBe(0)
    }
  })

  it('全为 0（无收支 / 全部停用）的合并系列不占用图例与色号', () => {
    const opt = loose({ rows: [row(30, 100)] })

    expect(seriesNames(opt)).not.toContain('收入合计')
    expect(seriesNames(opt)).not.toContain('支出合计')
    expect(opt.legend.data).toEqual(seriesNames(opt))
  })

  it('只有支出时会单独生成支出合计', () => {
    const opt = loose({ rows: [row(30, 100, { expenses: [5] })] })

    expect(seriesNames(opt)).toContain('支出合计')
    expect(seriesNames(opt)).not.toContain('收入合计')
  })

  it('被模拟年份之外的年份补 null（耗尽后断开）', () => {
    const opt = loose({
      rows: [row(30, 100, { expenses: [5] })],
      optimisticRows: [row(30, 100), row(31, 90), row(32, 80)],
    })

    expect(seriesOf(opt, '支出合计').data).toEqual([5, null, null])
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

  it('只有 line / scatter 两种系列（柱状随收支项合并一起移除）', () => {
    const opt = loose({ rows: [row(30, 100, { expenses: [1] })] })
    expect(new Set(opt.series.map((s) => s.type))).toEqual(new Set(['line', 'scatter']))
  })

  it('合并后的两条收支线也挂在右轴，本金与耗尽点挂在左轴', () => {
    const opt = loose({ rows: [row(30, 100, { incomes: [1], expenses: [2] })] })
    for (const name of ['收入合计', '支出合计']) {
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
      expenses: DEFAULT_PARAMS.expenses.map((e) =>
        e.name === '生活费' ? { ...e, amount: 4_000 } : e,
      ),
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
    // 收支项已合并：图例里只有两条合计线，不再出现具体项名
    expect(seriesNames(opt)).toEqual([
      '本金·乐观',
      '本金·普通',
      '本金·悲观',
      '耗尽点',
      '收入合计',
      '支出合计',
    ])
  })

  it('支出合计正好等于各支出项之和：换车在 40/50/…/90 形成尖峰', () => {
    const withCar = cloneParams(DEFAULT_PARAMS)
    const livingOnly = cloneParams(DEFAULT_PARAMS)
    livingOnly.expenses = [livingOnly.expenses[0]] // 只留「生活费」

    const rows = simulate(withCar)
    const total = seriesOf(loose({ rows }), '支出合计').data
    const livingTotal = seriesOf(loose({ rows: simulate(livingOnly) }), '支出合计').data

    // 差额即「换车」那一项，只应在触发年非零
    const carSpike = rows.map((_, i) => (total[i] as number) - (livingTotal[i] as number))
    expect(rows.filter((_, i) => carSpike[i] !== 0).map((r) => r.age)).toEqual([
      40, 50, 60, 70, 80, 90,
    ])
    expect(carSpike.every((v) => v >= 0)).toBe(true)
    // 每年都等于该年的 expenseTotal
    expect(total).toEqual(rows.map((r) => r.expenseTotal))
  })

  it('一次性支出并入支出合计（只在发生那年抬高曲线）', () => {
    const withOneOff = cloneParams(DEFAULT_PARAMS)
    withOneOff.expenses = [...withOneOff.expenses, createItem('oneoff', 30, 90)]

    const rows = simulate(withOneOff)
    const baseRows = simulate(DEFAULT_PARAMS)
    const withData = seriesOf(loose({ rows }), '支出合计').data
    const base = seriesOf(loose({ rows: baseRows }), '支出合计').data

    const at60 = rows.findIndex((r) => r.age === 60)
    const at61 = rows.findIndex((r) => r.age === 61)
    expect((withData[at60] as number) - (base[at60] as number)).toBe(200_000)
    expect(withData[at61]).toBe(base[at61])
    expect(withData[at61]).toBe(rows[at61].expenseTotal)
  })
})
