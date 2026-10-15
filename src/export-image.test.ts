import { describe, expect, it } from 'vitest'
import { buildFooterLines, exportFileName, FOOTER_MAX_ITEMS } from './export-image'
import { cloneParams, DEFAULT_PARAMS, type CashFlowItem, type SimParams } from './lib'

function item(overrides: Partial<CashFlowItem>): CashFlowItem {
  return {
    id: 'x',
    name: '项',
    amount: 1000,
    period: 'month',
    interval: 1,
    growth: 0,
    startAge: 30,
    endAge: 85,
    enabled: true,
    ...overrides,
  }
}

function params(overrides: Partial<SimParams> = {}): SimParams {
  return {
    ...cloneParams(DEFAULT_PARAMS),
    startAge: 30,
    endAge: 85,
    initialPrincipal: 1_000_000,
    annualReturn: 0.06,
    optimisticReturn: 0.09,
    pessimisticReturn: 0.03,
    incomes: [],
    expenses: [],
    ...overrides,
  }
}

describe('buildFooterLines', () => {
  it('表头两行是起止年龄 / 本金 / 三档收益率', () => {
    expect(buildFooterLines(params())).toEqual([
      '30 → 85 岁 · 初始本金 100 万',
      '年化收益 普通 6% / 乐观 9% / 悲观 3%',
      '（没有收支项）',
    ])
  })

  it('月周期项给年额均值与间隔；间隔不整除 12 也照均值展示', () => {
    const lines = buildFooterLines(
      params({
        incomes: [item({ name: '兼职', amount: 2500, interval: 5, growth: 0.03, endAge: 60 })],
      }),
    )
    expect(lines[2]).toBe('收入 兼职 年额约 6,000 元 · 每 5 个月 · 涨 3% · 30→60 岁')
  })

  it('年周期项用「每 N 年」，起点即终点时只写一次年龄', () => {
    const lines = buildFooterLines(
      params({ incomes: [item({ name: '稿费', period: 'year', interval: 1, endAge: 30 })] }),
    )
    // 涨幅为 0 时不留「涨 0%」；startAge === endAge 时不写「30→30 岁」
    expect(lines[2]).toBe('收入 稿费 年额约 1,000 元 · 每年 · 30 岁')
  })

  it('一次性项写单次金额与发生年龄，不带涨幅和年龄区间', () => {
    const lines = buildFooterLines(
      params({
        expenses: [item({ name: '换车', period: 'once', amount: 100_000, growth: 0.02, startAge: 40 })],
      }),
    )
    expect(lines[2]).toBe('支出 换车 100,000 元/次 · 40 岁一次')
  })

  it('收入排在支出前面，关闭的项标注', () => {
    const lines = buildFooterLines(
      params({
        incomes: [item({ name: '工资' })],
        expenses: [item({ name: '生活费', amount: 8000, enabled: false })],
      }),
    )
    expect(lines[2]).toBe('收入 工资 年额约 12,000 元 · 每月 · 30→85 岁')
    expect(lines[3]).toBe('支出 生活费 年额约 96,000 元 · 每月 · 30→85 岁（已关闭）')
  })

  it('超过上限的项折叠成一行，不列具体名字', () => {
    const expenses = Array.from({ length: FOOTER_MAX_ITEMS + 1 }, (_, i) =>
      item({ name: `支出${i}`, id: `e${i}` }),
    )
    const lines = buildFooterLines(params({ expenses }))

    // 表头 2 行 + 12 项 + 折叠 1 行
    expect(lines).toHaveLength(2 + FOOTER_MAX_ITEMS + 1)
    expect(lines.at(-1)).toBe('…另外 1 项（见参数面板）')
    expect(lines).not.toContain('支出 支出12 年额约 12,000 元 · 每月 · 30→85 岁')
  })
})

describe('exportFileName', () => {
  it('带上起止年龄与本地日期', () => {
    expect(exportFileName(params({ startAge: 25, endAge: 88 }), new Date(2026, 9, 15))).toBe(
      '躺平模拟器_25-88岁_2026-10-15.png',
    )
  })
})
