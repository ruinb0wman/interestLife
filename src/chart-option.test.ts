import { describe, expect, it } from 'vitest'
import { buildChartOption, type ChartOptionInput } from './chart-option'
import { DEFAULT_PARAMS, simulate, simulateScenario, type SimParams, type YearRow } from './lib'

/** 手写一行，便于精确构造边界（破产截断、长度不齐） */
function row(age: number, endPrincipal: number, extra: Partial<YearRow> = {}): YearRow {
  return {
    age,
    startPrincipal: 0,
    investmentIncome: 0,
    salary: 0,
    extraIncome: 0,
    living: 0,
    medical: 0,
    carNet: 0,
    oneOff: 0,
    endPrincipal,
    ...extra,
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

describe('buildChartOption：时间轴对齐', () => {
  it('时间轴按最长情景铺开，短情景用 null 补齐', () => {
    const opt = loose({
      rows: [row(30, 100), row(31, -50)],
      optimisticRows: [row(30, 100), row(31, 200), row(32, 300), row(33, 400)],
      pessimisticRows: [row(30, 100), row(31, 110), row(32, 120)],
    })

    expect(opt.xAxis.data).toEqual([30, 31, 32, 33])
    expect(seriesOf(opt, '本金·中性').data).toEqual([100, -50, null, null])
    expect(seriesOf(opt, '本金·悲观').data).toEqual([100, 110, 120, null])
    expect(seriesOf(opt, '本金·乐观').data).toEqual([100, 200, 300, 400])
  })

  it('年度收支系列跟随中性情景，超出部分为 null', () => {
    const opt = loose({
      rows: [
        row(30, 100, { salary: 1, living: 2, medical: 3, extraIncome: 4, oneOff: 5 }),
        row(31, 90),
      ],
      optimisticRows: [row(30, 100), row(31, 200), row(32, 300)],
    })

    for (const name of ['年度工资', '年度生活费', '年度医疗', '零工收入', '一次性支出']) {
      expect(seriesOf(opt, name).data).toEqual([expect.any(Number), 0, null])
    }
    expect(seriesOf(opt, '年度工资').data[0]).toBe(1)
    expect(seriesOf(opt, '一次性支出').data[0]).toBe(5)
  })

  it('不传乐观/悲观时三条本金线退化为同一条', () => {
    const opt = loose({ rows: [row(30, 100), row(31, 50)] })
    expect(seriesOf(opt, '本金·乐观').data).toEqual([100, 50])
    expect(seriesOf(opt, '本金·中性').data).toEqual([100, 50])
    expect(seriesOf(opt, '本金·悲观').data).toEqual([100, 50])
  })

  it('rows 为空时不抛异常', () => {
    const opt = loose({ rows: [] })
    expect(opt.xAxis.data).toEqual([])
    expect(seriesOf(opt, '本金·中性').data).toEqual([])
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
    expect(opt.legend.data).toEqual(opt.series.map((s) => s.name))
  })

  it('三种图表类型都被用到：line / scatter / bar', () => {
    const opt = loose({ rows: [row(30, 100)] })
    expect(new Set(opt.series.map((s) => s.type))).toEqual(new Set(['line', 'scatter', 'bar']))
  })

  it('年度收支系列挂在右轴，本金系列挂在左轴', () => {
    const opt = loose({ rows: [row(30, 100)] })
    for (const name of ['年度工资', '年度生活费', '年度医疗', '零工收入', '一次性支出']) {
      expect(seriesOf(opt, name).yAxisIndex).toBe(1)
    }
    for (const name of ['本金·乐观', '本金·中性', '本金·悲观', '耗尽点']) {
      expect(seriesOf(opt, name).yAxisIndex ?? 0).toBe(0)
    }
  })
})

describe('tooltip.formatter', () => {
  const format = (opt: ReturnType<typeof loose>, params: unknown) => opt.tooltip.formatter(params)

  it('跳过 0 值与非数值（散点的 value 是数组）', () => {
    const opt = loose({ rows: [row(30, 100)] })
    const text = format(opt, [
      { seriesName: '本金·中性', value: 1234567, axisValue: '45' },
      { seriesName: '本金·悲观', value: 0, axisValue: '45' },
      { seriesName: '耗尽点', value: [45, 0], axisValue: '45' },
      { seriesName: '年度工资', value: null, axisValue: '45' },
    ])

    expect(text).toContain('年龄 45 岁')
    expect(text).toContain('本金·中性')
    expect(text).not.toContain('本金·悲观')
    expect(text).not.toContain('耗尽点')
    expect(text).not.toContain('年度工资')
  })

  it('全部被过滤时只返回年龄标题', () => {
    const opt = loose({ rows: [row(30, 100)] })
    expect(format(opt, [{ seriesName: '本金·中性', value: 0, axisValue: '60' }])).toBe('年龄 60 岁')
  })
})

describe('buildChartOption：与真实模拟结果联通', () => {
  it('三个情景长度各不相同时，时间轴铺到目标年龄且各自在自己的耗尽年断开', () => {
    // 生活费 4000 时：悲观 4% 在 56 岁耗尽、中性 8% 在 83 岁耗尽、乐观 10% 撑到 90 岁
    const params: SimParams = { ...DEFAULT_PARAMS, monthlyLiving: 4_000 }
    const neutral = simulate(params)
    const optimistic = simulateScenario(params, params.optimisticReturn)
    const pessimistic = simulateScenario(params, params.pessimisticReturn)

    expect(neutral[neutral.length - 1].age).toBeLessThan(params.targetAge)
    expect(neutral[neutral.length - 1].endPrincipal).toBeLessThan(0)
    expect(optimistic[optimistic.length - 1].age).toBe(params.targetAge)
    expect(pessimistic.length).toBeLessThan(neutral.length)

    const opt = loose({ rows: neutral, optimisticRows: optimistic, pessimisticRows: pessimistic })

    // 时间轴铺到 90 岁，长度取最长情景
    expect(opt.xAxis.data).toHaveLength(optimistic.length)
    expect(opt.xAxis.data[opt.xAxis.data.length - 1]).toBe(params.targetAge)

    // 每条线都在自己的耗尽年之后变为 null
    for (const [name, list] of [
      ['本金·中性', neutral],
      ['本金·悲观', pessimistic],
    ] as const) {
      const data = seriesOf(opt, name).data
      expect(data).toHaveLength(opt.xAxis.data.length)
      expect(data[list.length - 1]).toBeLessThan(0)
      expect(data.slice(list.length).every((v) => v === null)).toBe(true)
    }

    // 乐观线全程有值
    expect(seriesOf(opt, '本金·乐观').data.every((v) => typeof v === 'number')).toBe(true)
    // 耗尽点：悲观 + 中性各一个
    expect(seriesOf(opt, '耗尽点').data).toEqual([
      [neutral[neutral.length - 1].age, 0],
      [pessimistic[pessimistic.length - 1].age, 0],
    ])
  })
})
