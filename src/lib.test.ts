import { describe, expect, it } from 'vitest'
import {
  analyze,
  carYears,
  DEFAULT_MC_CONFIG,
  DEFAULT_PARAMS,
  monteCarlo,
  simulate,
  simulateScenario,
  verdict,
  type McResult,
  type SimParams,
} from './lib'

/** 只保留指定项的「干净」参数：其余收支全部关闭，便于逐项验证 */
function baseline(overrides: Partial<SimParams> = {}): SimParams {
  return {
    ...DEFAULT_PARAMS,
    enableSalary: false,
    enableInvestment: false,
    enableLiving: false,
    enableCar: false,
    enableMedical: false,
    enableExtraIncome: false,
    enableOneOff: false,
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

describe('carYears', () => {
  it('按周期生成换车年，含目标年龄', () => {
    expect(carYears(30, 90, 10)).toEqual([40, 50, 60, 70, 80, 90])
    expect(carYears(30, 39, 10)).toEqual([])
  })

  it('周期非法时返回空列表而不是死循环', () => {
    expect(carYears(30, 90, 0)).toEqual([])
    expect(carYears(30, 90, -5)).toEqual([])
    expect(carYears(30, 90, Number.NaN)).toEqual([])
    expect(carYears(30, 90, Number.POSITIVE_INFINITY)).toEqual([])
  })
})

describe('simulate：单年现金流勾稽', () => {
  it('投资收益 = 年初本金 × 收益率，年末本金 = 年初 + 收益', () => {
    const rows = simulate(
      baseline({
        startAge: 30,
        targetAge: 31,
        initialPrincipal: 100_000,
        annualReturn: 0.08,
        enableInvestment: true,
      }),
    )

    expect(rows).toHaveLength(2)
    expect(rows[0].investmentIncome).toBeCloseTo(8_000, 6)
    expect(rows[0].endPrincipal).toBeCloseTo(108_000, 6)
    // 复利：第二年的收益基于第一年年末本金
    expect(rows[1].startPrincipal).toBeCloseTo(108_000, 6)
    expect(rows[1].investmentIncome).toBeCloseTo(8_640, 6)
    expect(rows[1].endPrincipal).toBeCloseTo(116_640, 6)
  })

  it('全部收支停用时本金恒定', () => {
    const rows = simulate(
      baseline({ startAge: 30, targetAge: 90, initialPrincipal: 500_000 }),
    )
    for (const row of rows) {
      expect(row.investmentIncome).toBe(0)
      expect(row.endPrincipal).toBe(500_000)
    }
  })

  it('生活费按年复利增长，起始年为基准值', () => {
    const rows = simulate(
      baseline({
        startAge: 30,
        targetAge: 33,
        monthlyLiving: 3_000,
        livingGrowth: 0.03,
        enableLiving: true,
      }),
    )
    expect(rows[0].living).toBeCloseTo(36_000, 6)
    expect(rows[1].living).toBeCloseTo(36_000 * 1.03, 6)
    expect(rows[2].living).toBeCloseTo(36_000 * 1.03 ** 2, 6)
  })
})

describe('simulate：边界与开关', () => {
  it('startAge >= targetAge 时返回空数组', () => {
    expect(simulate(baseline({ startAge: 60, targetAge: 60 }))).toEqual([])
    expect(simulate(baseline({ startAge: 60, targetAge: 50 }))).toEqual([])
  })

  it('工资发到 salaryStopAge 为止，零工收入从次年开始', () => {
    const rows = simulate(
      baseline({
        startAge: 30,
        targetAge: 40,
        salaryStopAge: 35,
        monthlySalary: 1_000,
        salaryGrowth: 0,
        enableSalary: true,
        monthlyExtraIncome: 500,
        extraIncomeGrowth: 0,
        extraIncomeStopAge: 37,
        enableExtraIncome: true,
      }),
    )
    const byAge = new Map(rows.map((r) => [r.age, r]))

    expect(byAge.get(35)!.salary).toBeCloseTo(12_000, 6)
    expect(byAge.get(36)!.salary).toBe(0)
    expect(byAge.get(36)!.extraIncome).toBeCloseTo(6_000, 6)
    expect(byAge.get(37)!.extraIncome).toBeCloseTo(6_000, 6)
    expect(byAge.get(38)!.extraIncome).toBe(0)
  })

  it('同一年多年一次性支出累加，非触发年为 0', () => {
    const rows = simulate(
      baseline({
        startAge: 30,
        targetAge: 35,
        enableOneOff: true,
        oneOffExpenses: [
          { age: 32, amount: 100 },
          { age: 32, amount: 200 },
          { age: 33, amount: 50 },
        ],
      }),
    )
    const byAge = new Map(rows.map((r) => [r.age, r]))
    expect(byAge.get(30)!.oneOff).toBe(0)
    expect(byAge.get(32)!.oneOff).toBeCloseTo(300, 6)
    expect(byAge.get(33)!.oneOff).toBeCloseTo(50, 6)
  })

  it('老年医疗从 medicalStartAge 起按年增长', () => {
    const rows = simulate(
      baseline({
        startAge: 30,
        targetAge: 72,
        medicalStartAge: 70,
        monthlyMedical: 2_000,
        medicalGrowth: 0.03,
        enableMedical: true,
      }),
    )
    const byAge = new Map(rows.map((r) => [r.age, r]))
    expect(byAge.get(69)!.medical).toBe(0)
    expect(byAge.get(70)!.medical).toBeCloseTo(24_000, 6)
    expect(byAge.get(71)!.medical).toBeCloseTo(24_000 * 1.03, 6)
  })

  it('换车净支出 = 当年车价 × 75%（模型假设起始年龄已持有车辆）', () => {
    const rows = simulate(
      baseline({
        startAge: 30,
        targetAge: 41,
        initialCarPrice: 100_000,
        carPriceGrowth: 0,
        carReplaceInterval: 10,
        enableCar: true,
      }),
    )
    const byAge = new Map(rows.map((r) => [r.age, r]))
    expect(byAge.get(30)!.carNet).toBe(0)
    expect(byAge.get(40)!.carNet).toBeCloseTo(75_000, 6)
  })
})

describe('analyze', () => {
  it('空结果集不抛异常', () => {
    const params = baseline({ startAge: 60, targetAge: 60 })
    const a = analyze(simulate(params), params)
    expect(a.survives).toBe(false)
    expect(a.finalBalance).toBe(0)
    expect(a.minBalance).toBe(0)
  })

  it('全程未为负且终值为正 → survives = true', () => {
    const params = { ...DEFAULT_PARAMS }
    const a = analyze(simulate(params), params)
    expect(a.firstNegativeAge).toBe(-1)
    expect(a.finalBalance).toBeGreaterThan(0)
    expect(a.survives).toBe(true)
  })

  it('未耗尽时跑到目标年龄，节点均可取到', () => {
    const params = { ...DEFAULT_PARAMS }
    const rows = simulate(params)
    const a = analyze(rows, params)

    expect(rows).toHaveLength(params.targetAge - params.startAge + 1)
    expect(a.targetAge).toBe(params.targetAge)
    expect(a.simulatedThroughAge).toBe(params.targetAge)
    expect(a.afterFirstCar).not.toBeNull()
    expect(a.afterSalaryStop).not.toBeNull()
  })

  // 回归：旧实现不截断，负本金继续按组合收益率「复利」，
  // 33 岁就已资不抵债的路径会被推到 90 岁并显示成 +2.5 亿。
  it('资不抵债即截断，缺口保留在最后一行', () => {
    const params: SimParams = {
      ...DEFAULT_PARAMS,
      monthlySalary: 20_000,
      salaryGrowth: 0.05,
      monthlyLiving: 1_000,
      oneOffExpenses: [{ age: 33, amount: 2_000_000 }],
      annualReturn: 0.08,
    }
    const rows = simulate(params)
    const a = analyze(rows, params)

    expect(rows.map((r) => r.age)).toEqual([30, 31, 32, 33])
    expect(rows[rows.length - 1].endPrincipal).toBeLessThan(0)
    expect(a.firstNegativeAge).toBe(33)
    expect(a.simulatedThroughAge).toBe(33)
    expect(a.targetAge).toBe(90) // 计划终点不受截断影响
    expect(a.survives).toBe(false)
    expect(a.finalBalance).toBe(rows[rows.length - 1].endPrincipal)
    // 缺口只有当年的量级，而不是雪球式的千万负债
    expect(Math.abs(a.finalBalance)).toBeLessThan(1_000_000)
  })

  it('截断后未被模拟到的节点返回 null', () => {
    const params: SimParams = { ...DEFAULT_PARAMS, enableSalary: false, monthlyLiving: 9_000 }
    const a = analyze(simulate(params), params)

    expect(a.firstNegativeAge).toBe(35)
    expect(a.simulatedThroughAge).toBe(35)
    expect(a.firstCarAge).toBe(40)
    expect(a.afterFirstCar).toBeNull()
    expect(a.afterSalaryStop).toBeNull()
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
    expect(runMc(baseline({ startAge: 60, targetAge: 60 }), 100, 0.02, 0.01)).toEqual(zero)
  })

  // 回归：MC 曾把通胀在「起始年」就累乘一次，与 simulate() 的
  // pow(1 + livingGrowth, age - startAge) 差了一年，导致最终资产系统性偏低约 20%。
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
    const params: SimParams = { ...DEFAULT_PARAMS, monthlyLiving: 6_000 }
    const mc = runMc(params, 300, 0.12, 0.02)

    expect(mc.successRate).toBeLessThan(1)
    expect(mc.p50DepletedAge).not.toBeNull()
    expect(mc.p50DepletedAge!).toBeGreaterThan(params.startAge)
    expect(mc.p50DepletedAge!).toBeLessThanOrEqual(params.targetAge)
    // 缺口只可能是耗尽当年的量级（远小于生活费 × 60 年）
    expect(Math.abs(mc.worstFinal)).toBeLessThan(mc.p50DepletedAge! > 0 ? 5_000_000 : 0)
  })

  it('不破产时 p50DepletedAge 为 null', () => {
    const mc = runMc({ ...DEFAULT_PARAMS, monthlyLiving: 1_000 }, 200, 0.02, 0.01)
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
})

describe('verdict：三档结论', () => {
  /** 与 App.vue 一致：中性用 annualReturn，悲观用 pessimisticReturn */
  const analysisFor = (overrides: Partial<SimParams> = {}, rate?: number) => {
    const params: SimParams = { ...DEFAULT_PARAMS, ...overrides }
    return analyze(rate === undefined ? simulate(params) : simulateScenario(params, rate), params)
  }

  it('中性、悲观都能躺平 → safe', () => {
    const neutral = analysisFor({ monthlyLiving: 1_500 })
    const pessimistic = analysisFor({ monthlyLiving: 1_500 }, 0.04)
    expect(neutral.survives).toBe(true)
    expect(pessimistic.survives).toBe(true)
    expect(verdict(neutral, pessimistic)).toBe('safe')
  })

  it('中性可以、悲观破产 → risky', () => {
    const neutral = analysisFor()
    const pessimistic = analysisFor({}, DEFAULT_PARAMS.pessimisticReturn)
    expect(neutral.survives).toBe(true)
    expect(pessimistic.survives).toBe(false)
    expect(verdict(neutral, pessimistic)).toBe('risky')
  })

  // 资不抵债即截断，因此「中性情景会破产」只有一种形态：目标年龄前耗尽资产
  it('中性情景前耗尽资产 → bankrupt', () => {
    const neutral = analysisFor({
      monthlySalary: 20_000,
      salaryGrowth: 0.05,
      monthlyLiving: 1_000,
      oneOffExpenses: [{ age: 33, amount: 2_000_000 }],
      annualReturn: 0.08,
    })
    expect(neutral.firstNegativeAge).toBe(33)
    expect(neutral.simulatedThroughAge).toBe(33)
    expect(verdict(neutral, neutral)).toBe('bankrupt')
  })

  it('中性情景只要破产就一定不是 safe / risky', () => {
    const neutral = analysisFor({ monthlyLiving: 5_000 })
    expect(neutral.survives).toBe(false)
    expect(verdict(neutral, analysisFor())).toBe('bankrupt')
  })
})

describe('simulateScenario', () => {
  it('收益率越低，终值越低', () => {
    const params = { ...DEFAULT_PARAMS }
    const final = (rate: number) =>
      analyze(simulateScenario(params, rate), params).finalBalance
    expect(final(0.04)).toBeLessThan(final(0.08))
    expect(final(0.08)).toBeLessThan(final(0.1))
  })
})
