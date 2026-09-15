import { describe, expect, it } from 'vitest'
import {
  amountAt,
  analyze,
  annualAmount,
  createItem,
  DEFAULT_MC_CONFIG,
  DEFAULT_PARAMS,
  monteCarlo,
  occurrenceYears,
  occursAt,
  simulate,
  simulateScenario,
  verdict,
  type CashFlowItem,
  type McResult,
  type SimParams,
} from './lib'

/** 收支项工厂：默认「全年 0 元、不产生任何影响」，逐个字段覆盖后用于定点验证 */
function item(overrides: Partial<CashFlowItem> = {}): CashFlowItem {
  return {
    id: 'test-item',
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

/**
 * 「干净」参数：本金 0、收益率 0、无任何收支。
 * 每个测试只往 incomes/expenses 里塞它关心的项，断言直接落在 endPrincipal 上。
 */
function baseline(overrides: Partial<SimParams> = {}): SimParams {
  return {
    startAge: 30,
    endAge: 90,
    initialPrincipal: 0,
    annualReturn: 0,
    optimisticReturn: 0.1,
    pessimisticReturn: 0.04,
    incomes: [],
    expenses: [],
    ...overrides,
  }
}

/** 测试便捷封装：runMc(params, 模拟次数, 收益波动率, 通胀波动率) */
function runMc(
  params: SimParams,
  iterations: number = DEFAULT_MC_CONFIG.iterations,
  returnVolatility: number = DEFAULT_MC_CONFIG.returnVolatility,
  inflationVolatility: number = DEFAULT_MC_CONFIG.inflationVolatility,
): McResult {
  return monteCarlo(params, { iterations, returnVolatility, inflationVolatility })
}

describe('annualAmount / occursAt / occurrenceYears', () => {
  it('每月金额按 12 个月折算为年额', () => {
    expect(annualAmount(item({ amount: 3_000, frequency: 'month' }))).toBe(36_000)
    expect(annualAmount(item({ amount: 3_000, frequency: 'year' }))).toBe(3_000)
  })

  it('停用项一律不触发', () => {
    const off = item({ enabled: false, startAge: 30, endAge: 90 })
    for (let age = 30; age <= 90; age++) expect(occursAt(off, age)).toBe(false)
  })

  it('区间端点含 startAge 与 endAge', () => {
    const it0 = item({ startAge: 35, endAge: 37 })
    expect(occursAt(it0, 34)).toBe(false)
    expect(occursAt(it0, 35)).toBe(true)
    expect(occursAt(it0, 37)).toBe(true)
    expect(occursAt(it0, 38)).toBe(false)
  })

  it('cycle = 1 每年触发，cycle = N 每 N 年从 startAge 起触发', () => {
    const yearly = item({ cycle: 1 })
    expect(occursAt(yearly, 30)).toBe(true)
    expect(occursAt(yearly, 31)).toBe(true)

    const decadal = item({ startAge: 40, cycle: 10, endAge: 90 })
    expect(occursAt(decadal, 39)).toBe(false)
    expect(occursAt(decadal, 40)).toBe(true)
    expect(occursAt(decadal, 41)).toBe(false)
    expect(occursAt(decadal, 50)).toBe(true)
  })

  it('cycle = 0 表示仅发生一次（startAge 那年）', () => {
    const once = item({ startAge: 60, cycle: 0, endAge: 90 })
    expect(occursAt(once, 59)).toBe(false)
    expect(occursAt(once, 60)).toBe(true)
    expect(occursAt(once, 61)).toBe(false)
    expect(occursAt(once, 70)).toBe(false)
  })

  it('occurrenceYears 与旧 carYears(30, 90, 10) 口径一致', () => {
    const car = item({ startAge: 40, cycle: 10, endAge: 90 })
    expect(occurrenceYears(car, 30, 90)).toEqual([40, 50, 60, 70, 80, 90])
    expect(occurrenceYears(car, 30, 39)).toEqual([])
    // 区间起点晚于首次触发时，只返回落在区间内的年份
    expect(occurrenceYears(car, 55, 90)).toEqual([60, 70, 80, 90])
  })

  it('cycle = 0 时 occurrenceYears 最多返回一个年龄', () => {
    expect(occurrenceYears(item({ startAge: 60, cycle: 0 }), 30, 90)).toEqual([60])
    expect(occurrenceYears(item({ startAge: 60, cycle: 0 }), 30, 59)).toEqual([])
  })

  it('周期非法（NaN / Infinity / 负数）归一为每年，不死循环', () => {
    for (const cycle of [Number.NaN, Number.POSITIVE_INFINITY, -5, 0.4]) {
      const bad = item({ cycle, endAge: 32 })
      expect(occurrenceYears(bad, 30, 32)).toEqual([30, 31, 32])
    }
  })
})

describe('simulate：单年现金流勾稽', () => {
  it('投资收益 = 年初本金 × 收益率，年末本金 = 年初 + 收益', () => {
    const rows = simulate(
      baseline({ startAge: 30, endAge: 31, initialPrincipal: 100_000, annualReturn: 0.08 }),
    )

    expect(rows).toHaveLength(2)
    expect(rows[0].investmentIncome).toBeCloseTo(8_000, 6)
    expect(rows[0].endPrincipal).toBeCloseTo(108_000, 6)
    // 复利：第二年的收益基于第一年年末本金
    expect(rows[1].startPrincipal).toBeCloseTo(108_000, 6)
    expect(rows[1].investmentIncome).toBeCloseTo(8_640, 6)
    expect(rows[1].endPrincipal).toBeCloseTo(116_640, 6)
  })

  it('无收支且收益率为 0 时本金恒定', () => {
    const rows = simulate(baseline({ startAge: 30, endAge: 90, initialPrincipal: 500_000 }))
    expect(rows).toHaveLength(61)
    for (const row of rows) {
      expect(row.investmentIncome).toBe(0)
      expect(row.incomeTotal).toBe(0)
      expect(row.expenseTotal).toBe(0)
      expect(row.endPrincipal).toBe(500_000)
    }
  })

  it('支出按自身起始年龄复利，起始年为基准值', () => {
    const rows = simulate(
      baseline({
        startAge: 30,
        endAge: 33,
        initialPrincipal: 1_000_000,
        expenses: [item({ amount: 3_000, frequency: 'month', growth: 0.03 })],
      }),
    )
    expect(rows[0].expenseTotal).toBeCloseTo(36_000, 6)
    expect(rows[1].expenseTotal).toBeCloseTo(36_000 * 1.03, 6)
    expect(rows[2].expenseTotal).toBeCloseTo(36_000 * 1.03 ** 2, 6)
    // 分项明细与合计一致，且与参数列表同序
    expect(rows[2].expenses).toEqual([rows[2].expenseTotal])
  })

  it('年末本金 = 年初 + 投资收益 + 收入合计 − 支出合计', () => {
    const rows = simulate(
      baseline({
        startAge: 30,
        endAge: 40,
        initialPrincipal: 200_000,
        annualReturn: 0.05,
        incomes: [item({ name: '工资', amount: 5_000, frequency: 'month' })],
        expenses: [item({ name: '生活费', amount: 3_000, frequency: 'month', growth: 0.03 })],
      }),
    )
    for (const row of rows) {
      expect(row.endPrincipal).toBeCloseTo(
        row.startPrincipal + row.investmentIncome + row.incomeTotal - row.expenseTotal,
        6,
      )
      expect(row.incomeTotal).toBeCloseTo(60_000, 6)
    }
  })
})

describe('simulate：边界与开关', () => {
  it('startAge >= endAge 时返回空数组', () => {
    expect(simulate(baseline({ startAge: 60, endAge: 60 }))).toEqual([])
    expect(simulate(baseline({ startAge: 60, endAge: 50 }))).toEqual([])
  })

  it('收入项在 endAge 含端点停发，另一项可以从次年起接续', () => {
    const rows = simulate(
      baseline({
        startAge: 30,
        endAge: 40,
        incomes: [
          item({ name: '工资', amount: 1_000, frequency: 'month', startAge: 30, endAge: 35 }),
          item({ name: '零工', amount: 500, frequency: 'month', startAge: 36, endAge: 37 }),
        ],
      }),
    )
    const byAge = new Map(rows.map((r) => [r.age, r]))

    expect(byAge.get(35)!.incomes[0]).toBeCloseTo(12_000, 6)
    expect(byAge.get(36)!.incomes[0]).toBe(0)
    expect(byAge.get(36)!.incomes[1]).toBeCloseTo(6_000, 6)
    expect(byAge.get(37)!.incomes[1]).toBeCloseTo(6_000, 6)
    expect(byAge.get(38)!.incomes[1]).toBe(0)
  })

  it('同一年多个「仅一次」支出累加，非触发年为 0', () => {
    const rows = simulate(
      baseline({
        startAge: 30,
        endAge: 35,
        // 留足缓冲，否则第一次支出就会直接资不抵债而截断
        initialPrincipal: 1_000,
        expenses: [
          item({ name: '大病', amount: 100, cycle: 0, startAge: 32 }),
          item({ name: '意外', amount: 200, cycle: 0, startAge: 32 }),
          item({ name: '修房', amount: 50, cycle: 0, startAge: 33 }),
        ],
      }),
    )
    const byAge = new Map(rows.map((r) => [r.age, r]))
    expect(byAge.get(30)!.expenseTotal).toBe(0)
    expect(byAge.get(32)!.expenseTotal).toBeCloseTo(300, 6)
    expect(byAge.get(33)!.expenseTotal).toBeCloseTo(50, 6)
    expect(byAge.get(34)!.expenseTotal).toBe(0)
  })

  it('停用的项当期计为 0，紧邻的启用项不受影响', () => {
    const rows = simulate(
      baseline({
        startAge: 30,
        endAge: 32,
        expenses: [
          item({ name: '启用', amount: 1_000, enabled: true }),
          item({ name: '停用', amount: 999_999, enabled: false }),
        ],
      }),
    )
    for (const row of rows) {
      expect(row.expenses[0]).toBe(1_000)
      expect(row.expenses[1]).toBe(0)
      expect(row.expenseTotal).toBe(1_000)
    }
  })

  it('老年医疗从自身 startAge 起按年增长', () => {
    const rows = simulate(
      baseline({
        startAge: 30,
        endAge: 72,
        initialPrincipal: 1_000_000,
        expenses: [
          item({ name: '老年医疗', amount: 2_000, frequency: 'month', growth: 0.03, startAge: 70 }),
        ],
      }),
    )
    const byAge = new Map(rows.map((r) => [r.age, r]))
    expect(byAge.get(69)!.expenseTotal).toBe(0)
    expect(byAge.get(70)!.expenseTotal).toBeCloseTo(24_000, 6)
    expect(byAge.get(71)!.expenseTotal).toBeCloseTo(24_000 * 1.03, 6)
  })

  it('周期支出只在触发年发生，金额按间隔年数复利', () => {
    const rows = simulate(
      baseline({
        startAge: 30,
        endAge: 61,
        initialPrincipal: 10_000_000,
        expenses: [item({ name: '换车', amount: 75_000, growth: 0.01, cycle: 10, startAge: 40 })],
      }),
    )
    const byAge = new Map(rows.map((r) => [r.age, r]))
    expect(byAge.get(39)!.expenseTotal).toBe(0)
    expect(byAge.get(40)!.expenseTotal).toBeCloseTo(75_000, 6)
    expect(byAge.get(41)!.expenseTotal).toBe(0)
    // 每 10 年一次 → 累计 10 年涨幅
    expect(byAge.get(50)!.expenseTotal).toBeCloseTo(75_000 * 1.01 ** 10, 6)
    expect(byAge.get(60)!.expenseTotal).toBeCloseTo(75_000 * 1.01 ** 20, 6)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 核心回归：通用收支项引擎必须能逐字复现旧模型的默认参数现金流。
// 下面的 expectedRow 是旧 lib.ts 里 computeYear 的公式原样抄写（硬编码），
// 用它守住「通用化不改变默认结论」这条底线。
// ─────────────────────────────────────────────────────────────────────────────
describe('回归：默认参数与旧专用模型逐年等价', () => {
  const OLD_START_AGE = 30
  const OLD_END_AGE = 90
  const OLD_PRINCIPAL = 500_000
  const OLD_RETURN = 0.08
  const OLD_SALARY = 3_000
  const OLD_SALARY_GROWTH = 0.03
  const OLD_SALARY_STOP_AGE = 50
  const OLD_LIVING = 3_000
  const OLD_LIVING_GROWTH = 0.03
  const OLD_CAR_PRICE = 100_000
  const OLD_CAR_GROWTH = 0.01
  const OLD_CAR_INTERVAL = 10
  const OLD_CAR_RESIDUAL = 0.25

  /** 旧模型（v1）单年递推：工资 / 生活费 / 换车三件套 */
  function expectedRow(age: number, principal: number) {
    const yearsSince = age - OLD_START_AGE
    const investmentIncome = principal * OLD_RETURN
    const salary =
      age <= OLD_SALARY_STOP_AGE ? OLD_SALARY * 12 * (1 + OLD_SALARY_GROWTH) ** yearsSince : 0
    const living = OLD_LIVING * 12 * (1 + OLD_LIVING_GROWTH) ** yearsSince
    const isCarYear =
      age >= OLD_START_AGE + OLD_CAR_INTERVAL &&
      (age - (OLD_START_AGE + OLD_CAR_INTERVAL)) % OLD_CAR_INTERVAL === 0
    const carNet = isCarYear
      ? OLD_CAR_PRICE * (1 + OLD_CAR_GROWTH) ** yearsSince * (1 - OLD_CAR_RESIDUAL)
      : 0
    return {
      investmentIncome,
      salary,
      living,
      carNet,
      endPrincipal: principal + investmentIncome + salary - living - carNet,
    }
  }

  it('61 年的投资收益 / 工资 / 生活费 / 换车 / 年末本金逐年一致', () => {
    const params: SimParams = { ...DEFAULT_PARAMS }
    const rows = simulate(params)

    expect(rows).toHaveLength(OLD_END_AGE - OLD_START_AGE + 1)

    let principal = OLD_PRINCIPAL
    for (const row of rows) {
      const expected = expectedRow(row.age, principal)

      expect(row.investmentIncome).toBeCloseTo(expected.investmentIncome, 6)
      expect(row.incomes[0]).toBeCloseTo(expected.salary, 6)
      expect(row.expenses[0]).toBeCloseTo(expected.living, 6)
      expect(row.expenses[1]).toBeCloseTo(expected.carNet, 6)
      expect(row.incomeTotal).toBeCloseTo(expected.salary, 6)
      expect(row.expenseTotal).toBeCloseTo(expected.living + expected.carNet, 6)
      expect(row.endPrincipal).toBeCloseTo(expected.endPrincipal, 6)

      principal = expected.endPrincipal
    }
  })

  it('换车模板在触发年的净支出等于旧口径「车价 × 1.01^n × 75%」', () => {
    const car = DEFAULT_PARAMS.expenses.find((e) => e.name === '换车')!
    // 首次换车在 40 岁：车价已在模板里按 1.01^10 预先折算过
    expect(amountAt(car, 40)).toBeCloseTo(OLD_CAR_PRICE * 1.01 ** 10 * 0.75, 6)
    expect(amountAt(car, 90)).toBeCloseTo(OLD_CAR_PRICE * 1.01 ** 60 * 0.75, 6)
    expect(occurrenceYears(car, 30, 90)).toEqual([40, 50, 60, 70, 80, 90])
  })

  it('默认参数下普通可躺平、悲观破产 → risky（与旧版结论一致）', () => {
    const params = { ...DEFAULT_PARAMS }
    const neutral = analyze(simulate(params), params)
    const pessimistic = analyze(simulateScenario(params, params.pessimisticReturn), params)
    expect(neutral.survives).toBe(true)
    expect(pessimistic.survives).toBe(false)
    expect(verdict(neutral, pessimistic)).toBe('risky')
  })

  it('createItem 的模板年龄夹紧到全局区间内', () => {
    for (const preset of ['salary', 'gig', 'living', 'car', 'medical', 'oneoff']) {
      const created = createItem(preset, 40, 45)
      expect(created.startAge).toBeGreaterThanOrEqual(40)
      expect(created.startAge).toBeLessThanOrEqual(45)
      expect(created.endAge).toBeGreaterThanOrEqual(created.startAge)
      expect(created.endAge).toBeLessThanOrEqual(45)
    }
  })
})

describe('analyze', () => {
  it('空结果集不抛异常', () => {
    const params = baseline({ startAge: 60, endAge: 60 })
    const a = analyze(simulate(params), params)
    expect(a.survives).toBe(false)
    expect(a.finalBalance).toBe(0)
    expect(a.minBalance).toBe(0)
    expect(a.peakBalance).toBe(0)
    expect(a.totalIncome).toBe(0)
    expect(a.totalExpense).toBe(0)
  })

  it('全程未为负且终值为正 → survives = true', () => {
    const params = { ...DEFAULT_PARAMS }
    const a = analyze(simulate(params), params)
    expect(a.firstNegativeAge).toBe(-1)
    expect(a.finalBalance).toBeGreaterThan(0)
    expect(a.survives).toBe(true)
  })

  it('未耗尽时跑到结束年龄，最低/最高点与累计收支均可取到', () => {
    const params = { ...DEFAULT_PARAMS }
    const rows = simulate(params)
    const a = analyze(rows, params)

    expect(rows).toHaveLength(params.endAge - params.startAge + 1)
    expect(a.endAge).toBe(params.endAge)
    expect(a.simulatedThroughAge).toBe(params.endAge)
    expect(a.minBalance).toBeLessThanOrEqual(a.finalBalance)
    expect(a.peakBalance).toBeGreaterThanOrEqual(a.finalBalance)
    expect(a.totalIncome).toBeGreaterThan(0)
    expect(a.totalExpense).toBeGreaterThan(0)
    expect(a.totalIncome).toBeCloseTo(
      rows.reduce((sum, r) => sum + r.incomeTotal, 0),
      6,
    )
    expect(a.totalExpense).toBeCloseTo(
      rows.reduce((sum, r) => sum + r.expenseTotal, 0),
      6,
    )
  })

  // 回归：旧实现不截断，负本金继续按组合收益率「复利」，
  // 33 岁就已资不抵债的路径会被推到 90 岁并显示成 +2.5 亿。
  it('资不抵债即截断，缺口保留在最后一行', () => {
    const params = baseline({
      startAge: 30,
      endAge: 90,
      initialPrincipal: 500_000,
      annualReturn: 0.08,
      incomes: [item({ name: '工资', amount: 20_000, frequency: 'month', growth: 0.05, endAge: 50 })],
      expenses: [
        item({ name: '生活费', amount: 1_000, frequency: 'month' }),
        item({ name: '大病', amount: 2_000_000, cycle: 0, startAge: 33 }),
      ],
    })
    const rows = simulate(params)
    const a = analyze(rows, params)

    expect(rows.map((r) => r.age)).toEqual([30, 31, 32, 33])
    expect(rows[rows.length - 1].endPrincipal).toBeLessThan(0)
    expect(a.firstNegativeAge).toBe(33)
    expect(a.simulatedThroughAge).toBe(33)
    expect(a.endAge).toBe(90) // 计划终点不受截断影响
    expect(a.survives).toBe(false)
    expect(a.finalBalance).toBe(rows[rows.length - 1].endPrincipal)
    // 缺口只有当年的量级，而不是雪球式的千万负债
    expect(Math.abs(a.finalBalance)).toBeLessThan(1_000_000)
  })

  it('截断后累计收支只统计到耗尽那年', () => {
    const params = baseline({
      startAge: 30,
      endAge: 90,
      initialPrincipal: 100,
      expenses: [item({ name: '生活费', amount: 60, frequency: 'year' })],
    })
    const rows = simulate(params)
    const a = analyze(rows, params)

    expect(rows.map((r) => r.age)).toEqual([30, 31])
    expect(a.simulatedThroughAge).toBe(31)
    expect(a.totalExpense).toBeCloseTo(120, 6)
    // 峰值本金出现在第一年（此后一路走低并耗尽）
    expect(a.peakBalanceAge).toBe(30)
  })
})

describe('monteCarlo', () => {
  it('参数非法时返回全 0 且不抛异常', () => {
    const zero = {
      successRate: 0,
      p5Final: 0,
      p50Final: 0,
      p95Final: 0,
      worstFinal: 0,
      p50DepletedAge: null,
    }
    expect(runMc(DEFAULT_PARAMS, 0, 0.02, 0.01)).toEqual(zero)
    expect(runMc(baseline({ startAge: 60, endAge: 60 }), 100, 0.02, 0.01)).toEqual(zero)
  })

  // 回归：MC 曾把通胀在「起始年」就累乘一次，与 simulate() 的
  // pow(1 + growth, age - startAge) 差了一年，导致最终资产系统性偏低约 20%。
  it('波动率为 0 时收敛到确定性结果', () => {
    const params: SimParams = { ...DEFAULT_PARAMS }
    const deterministic = analyze(simulate(params), params).finalBalance
    const mc = runMc(params, 200, 0, 0)

    expect(mc.p50Final).toBeCloseTo(deterministic, -3)
    expect(mc.p5Final).toBeCloseTo(deterministic, -3)
    expect(mc.p95Final).toBeCloseTo(deterministic, -3)
    expect(mc.worstFinal).toBeCloseTo(deterministic, -3)
    expect(mc.successRate).toBe(1)
  })

  it('分位数有序，且成功率与「全程未为负」一致', () => {
    const mc = runMc({ ...DEFAULT_PARAMS }, 300, 0.12, 0.02)
    expect(mc.p5Final).toBeLessThanOrEqual(mc.p50Final)
    expect(mc.p50Final).toBeLessThanOrEqual(mc.p95Final)
    expect(mc.worstFinal).toBeLessThanOrEqual(mc.p5Final)
    expect(mc.successRate).toBeGreaterThanOrEqual(0)
    expect(mc.successRate).toBeLessThanOrEqual(1)
  })

  // 回归：MC 旧实现不截断，破产样本的「最终资产」是雪球式负债，分位数严重失真
  it('破产样本按耗尽当年截断，并给出破产中位年龄', () => {
    const params = baseline({
      startAge: 30,
      endAge: 90,
      initialPrincipal: 500_000,
      annualReturn: 0.08,
      incomes: [item({ name: '工资', amount: 3_000, frequency: 'month', growth: 0.03, endAge: 50 })],
      expenses: [item({ name: '生活费', amount: 6_000, frequency: 'month', growth: 0.03 })],
    })
    const mc = runMc(params, 300, 0.12, 0.02)

    expect(mc.successRate).toBeLessThan(1)
    expect(mc.p50DepletedAge).not.toBeNull()
    expect(mc.p50DepletedAge!).toBeGreaterThan(params.startAge)
    expect(mc.p50DepletedAge!).toBeLessThanOrEqual(params.endAge)
    // 缺口只可能是耗尽当年的量级（远小于生活费 × 60 年）
    expect(Math.abs(mc.worstFinal)).toBeLessThan(5_000_000)
  })

  it('不破产时 p50DepletedAge 为 null', () => {
    const params = baseline({
      startAge: 30,
      endAge: 90,
      initialPrincipal: 5_000_000,
      annualReturn: 0.08,
      expenses: [item({ name: '生活费', amount: 1_000, frequency: 'month', growth: 0.03 })],
    })
    const mc = runMc(params, 200, 0.02, 0.01)
    expect(mc.successRate).toBe(1)
    expect(mc.p50DepletedAge).toBeNull()
  })

  it('收益率为负时结果差于正收益率', () => {
    const base = { ...DEFAULT_PARAMS }
    const good = runMc({ ...base, annualReturn: 0.08 }, 200, 0, 0)
    const bad = runMc({ ...base, annualReturn: -0.02 }, 200, 0, 0)
    expect(bad.successRate).toBeLessThan(good.successRate)
    expect(bad.p50Final).toBeLessThan(good.p50Final)
  })

  // D4：通胀随机游走只作用于「支出项」，收入项涨幅固定
  it('只有收入项时，通胀波动率不影响结果', () => {
    const params = baseline({
      startAge: 30,
      endAge: 90,
      initialPrincipal: 0,
      annualReturn: 0.05,
      incomes: [item({ name: '工资', amount: 5_000, frequency: 'month', growth: 0.03 })],
    })
    const deterministic = analyze(simulate(params), params).finalBalance
    const mc = runMc(params, 100, 0, 0.05)

    expect(mc.p5Final).toBeCloseTo(deterministic, 6)
    expect(mc.p95Final).toBeCloseTo(deterministic, 6)
  })

  it('支出项涨幅的波动率越大，最终资产的分布越宽', () => {
    const params = baseline({
      startAge: 30,
      endAge: 90,
      initialPrincipal: 8_000_000,
      annualReturn: 0.05,
      expenses: [item({ name: '生活费', amount: 6_000, frequency: 'month', growth: 0.03 })],
    })
    const tight = runMc(params, 400, 0, 0.005)
    const wide = runMc(params, 400, 0, 0.05)

    expect(wide.p95Final - wide.p5Final).toBeGreaterThan(tight.p95Final - tight.p5Final)
  })
})

describe('verdict：三档结论', () => {
  /** 与 App.vue 一致：普通用 annualReturn，悲观用 pessimisticReturn */
  const analysisFor = (overrides: Partial<SimParams> = {}, rate?: number) => {
    const params: SimParams = { ...DEFAULT_PARAMS, ...overrides }
    return analyze(rate === undefined ? simulate(params) : simulateScenario(params, rate), params)
  }

  /** 生活费压到 1500 元/月：普通与悲观都能躺平 */
  const thrifty: Partial<SimParams> = {
    expenses: [
      item({ name: '生活费', amount: 1_500, frequency: 'month', growth: 0.03 }),
      ...DEFAULT_PARAMS.expenses.filter((e) => e.name === '换车'),
    ],
  }

  it('普通、悲观都能躺平 → safe', () => {
    const neutral = analysisFor(thrifty)
    const pessimistic = analysisFor(thrifty, 0.04)
    expect(neutral.survives).toBe(true)
    expect(pessimistic.survives).toBe(true)
    expect(verdict(neutral, pessimistic)).toBe('safe')
  })

  it('普通可以、悲观破产 → risky', () => {
    const neutral = analysisFor()
    const pessimistic = analysisFor({}, DEFAULT_PARAMS.pessimisticReturn)
    expect(neutral.survives).toBe(true)
    expect(pessimistic.survives).toBe(false)
    expect(verdict(neutral, pessimistic)).toBe('risky')
  })

  // 资不抵债即截断，因此「普通情景会破产」只有一种形态：结束年龄前耗尽资产
  it('普通情景前耗尽资产 → bankrupt', () => {
    const neutral = analysisFor({
      incomes: [item({ name: '工资', amount: 20_000, frequency: 'month', growth: 0.05, endAge: 50 })],
      expenses: [
        item({ name: '生活费', amount: 1_000, frequency: 'month' }),
        item({ name: '大病', amount: 2_000_000, cycle: 0, startAge: 33 }),
      ],
    })
    expect(neutral.firstNegativeAge).toBe(33)
    expect(neutral.simulatedThroughAge).toBe(33)
    expect(verdict(neutral, neutral)).toBe('bankrupt')
  })

  it('普通情景只要破产就一定不是 safe / risky', () => {
    const neutral = analysisFor({
      expenses: [item({ name: '生活费', amount: 5_000, frequency: 'month', growth: 0.03 })],
    })
    expect(neutral.survives).toBe(false)
    expect(verdict(neutral, analysisFor())).toBe('bankrupt')
  })
})

describe('simulateScenario', () => {
  it('收益率越低，终值越低', () => {
    const params = { ...DEFAULT_PARAMS }
    const final = (rate: number) => analyze(simulateScenario(params, rate), params).finalBalance
    expect(final(0.04)).toBeLessThan(final(0.08))
    expect(final(0.08)).toBeLessThan(final(0.1))
  })
})

describe('occurrenceYears：迭代边界', () => {
  it('startAge 远早于区间起点时只返回区间内的触发年', () => {
    const early = item({ startAge: 0, cycle: 7, endAge: 90 })
    expect(occurrenceYears(early, 60, 75)).toEqual([63, 70])
  })

  it('startAge 晚于区间终点时返回空列表', () => {
    expect(occurrenceYears(item({ startAge: 80, cycle: 5 }), 30, 50)).toEqual([])
  })

  it('项内 startAge > endAge 时返回空列表', () => {
    expect(occurrenceYears(item({ startAge: 80, endAge: 40, cycle: 5 }), 30, 90)).toEqual([])
  })
})
