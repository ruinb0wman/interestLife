// 躺平财务模拟器 · 核心计算公式
//
// 模拟一位不交社保、不买房、不生子的人，依靠投资和零散工资收入，
// 从「初始年龄」到「目标年龄」的现金流。
//
// 每年递推顺序（严格）：
//   1. 年初本金产生投资收益：income = 年初本金 × 年化收益率
//   2. 加入当年工资（超过「工资结束年龄」后为 0）与零工收入
//   3. 扣除当年生活费，超过「医疗起始年龄」后加扣老年医疗/护理支出
//   4. 若当年为换车年，扣除换车净支出（新车价 − 旧车残值）
//   5. 最后扣除当年一次性大额支出（大病/意外）
//  → 年末本金 = 年初本金 + 投资收益 + 年工资 + 零工收入 − 年生活费
//              − 年医疗支出 − 换车净支出 − 一次性支出
//
// 复利、残值抵扣、换车年顺序均体现在下方 simulate() 中。
// monteCarlo() 为压力测试：收益率与生活费涨幅逐年随机游走。
//
// 截断规则：某一年年末本金首次为负（资不抵债）即终止模拟，当年缺口保留在结果里。
// 不再推演后续年份——现实中无法以自己组合的收益率无限透支，
// 否则负本金会跟着「复利」滚成雪球，把悲观情景的破产金额严重夸大。

export const DEFAULT_START_AGE = 30
export const DEFAULT_TARGET_AGE = 90
export const DEFAULT_SALARY_STOP_AGE = 50
export const DEFAULT_CAR_REPLACE_INTERVAL = 10
// 旧车残值 = 当前车价 × 25%
export const CAR_RESIDUAL_RATIO = 0.25

/** 一次性大额支出（大病 / 意外） */
export interface OneOffExpense {
  /** 触发年龄（岁） */
  age: number
  /** 支出金额（元） */
  amount: number
}

/** 所有可调参数（涨幅/利率均以小数输入，如 3% 填 0.03） */
export interface SimParams {
  /** 初始年龄（岁，模拟起点） */
  startAge: number
  /** 目标年龄（岁，模拟终点） */
  targetAge: number
  /** 工资结束年龄（岁，工资发到该年含；该年之后工资为 0） */
  salaryStopAge: number
  /** 买车周期（年，首次换车 = 初始年龄 + 周期，此后每周期一次） */
  carReplaceInterval: number

  /** 初始月薪（元），年工资 = 月薪 × 12 */
  monthlySalary: number
  /** 年薪涨幅（小数，默认 0.03） */
  salaryGrowth: number
  /** 初始月生活费（元），年生活费 = 月生活费 × 12 */
  monthlyLiving: number
  /** 生活费年涨幅（小数，默认 0.03） */
  livingGrowth: number
  /** 初始投资本金（元，默认 500000） */
  initialPrincipal: number
  /** 投资年化收益率（小数，默认 0.08，即“中性情景”） */
  annualReturn: number
  /** 乐观情景收益率（小数，默认 0.10） */
  optimisticReturn: number
  /** 悲观情景收益率（小数，默认 0.04） */
  pessimisticReturn: number
  /** 初始新车价格（元，默认 100000），购买价 = 车价 × (1+车价涨幅)^(年龄−初始年龄) */
  initialCarPrice: number
  /** 车价年涨幅（小数，默认 0.01） */
  carPriceGrowth: number

  /** 老年医疗/护理起始年龄（岁，默认 70；该年龄起额外支出） */
  medicalStartAge: number
  /** 老年医疗月支出（元/月，默认 0） */
  monthlyMedical: number
  /** 医疗支出年涨幅（小数，默认 0.03） */
  medicalGrowth: number

  /** 零工/其他收入月金额（元/月，默认 0；工资停发后发至结束年龄） */
  monthlyExtraIncome: number
  /** 零工收入年涨幅（小数，默认 0.03） */
  extraIncomeGrowth: number
  /** 零工收入结束年龄（岁，默认目标年龄） */
  extraIncomeStopAge: number

  /** 一次性大额支出列表（默认空） */
  oneOffExpenses: OneOffExpense[]

  /** 是否启用工资收入 */
  enableSalary: boolean
  /** 是否启用投资收益 */
  enableInvestment: boolean
  /** 是否启用生活费支出 */
  enableLiving: boolean
  /** 是否启用换车支出 */
  enableCar: boolean
  /** 是否启用老年医疗支出 */
  enableMedical: boolean
  /** 是否启用零工/其他收入 */
  enableExtraIncome: boolean
  /** 是否启用一次性大额支出 */
  enableOneOff: boolean
}

export const DEFAULT_PARAMS: SimParams = {
  startAge: DEFAULT_START_AGE,
  targetAge: DEFAULT_TARGET_AGE,
  salaryStopAge: DEFAULT_SALARY_STOP_AGE,
  carReplaceInterval: DEFAULT_CAR_REPLACE_INTERVAL,
  monthlySalary: 3000,
  salaryGrowth: 0.03,
  monthlyLiving: 3000,
  livingGrowth: 0.03,
  initialPrincipal: 500000,
  annualReturn: 0.08,
  optimisticReturn: 0.1,
  pessimisticReturn: 0.04,
  initialCarPrice: 100000,
  carPriceGrowth: 0.01,
  medicalStartAge: 70,
  monthlyMedical: 0,
  medicalGrowth: 0.03,
  monthlyExtraIncome: 0,
  extraIncomeGrowth: 0.03,
  extraIncomeStopAge: 90,
  oneOffExpenses: [],
  enableSalary: true,
  enableInvestment: true,
  enableLiving: true,
  enableCar: true,
  enableMedical: true,
  enableExtraIncome: true,
  enableOneOff: true,
}

/** 某一年度的现金流明细 */
export interface YearRow {
  age: number
  /** 年初本金 */
  startPrincipal: number
  /** 投资收益 = 年初本金 × 年化收益率 */
  investmentIncome: number
  /** 年工资（工资结束年龄之前），之后为 0 */
  salary: number
  /** 零工/其他年收入（工资停发后至结束年龄） */
  extraIncome: number
  /** 年生活费 */
  living: number
  /** 老年医疗/护理年支出（医疗起始年龄之后） */
  medical: number
  /** 换车净支出 = 新车价 − 旧车残值，非换车年为 0 */
  carNet: number
  /** 一次性大额支出合计，非触发年为 0 */
  oneOff: number
  /** 年末本金 */
  endPrincipal: number
}

/** 破产分析结果 */
export interface Analysis {
  /** 初始年龄 */
  startAge: number
  /** 用户设定的计划终点年龄（与实际模拟终点无关） */
  targetAge: number
  /** 实际模拟到的最后一年：正常 = 目标年龄；资不抵债时 = 耗尽那年 */
  simulatedThroughAge: number
  /** 工资结束年龄（最后发薪年） */
  salaryStopAge: number
  /** 第一次换车年龄 = 初始年龄 + 买车周期 */
  firstCarAge: number
  /** 能否存活到目标年龄：全程任何一年年末本金都未为负，且目标年龄年末本金为正 */
  survives: boolean
  /** 全程最低本金（取各年年末本金最小值） */
  minBalance: number
  /** 出现最低本金的年龄 */
  minBalanceAge: number
  /** 本金首现负数的年龄（即资产耗尽年龄）；若从未为负则返回 -1 */
  firstNegativeAge: number
  /**
   * 模拟终点的年末本金：
   * 未耗尽时 = 目标年龄总资产；耗尽时 = 耗尽当年的缺口（负数）
   */
  finalBalance: number
  /** 第一次换车后的年末本金；该年未被模拟到（已提前耗尽）则为 null */
  afterFirstCar: number | null
  /** 停薪后（工资结束年龄 + 1）的年末本金；该年未被模拟到则为 null */
  afterSalaryStop: number | null
}

/** 蒙特卡洛压力测试结果 */
export interface McResult {
  /** 全程本金从未为负的模拟占比（0~1） */
  successRate: number
  /** 最终资产的 5% 分位（破产样本按耗尽当年缺口计入） */
  p5Final: number
  /** 最终资产中位数（50% 分位） */
  p50Final: number
  /** 最终资产的 95% 分位 */
  p95Final: number
  /** 所有模拟中最差的最终资产 */
  worstFinal: number
  /** 破产样本「资产耗尽年龄」的中位数；无破产样本时为 null */
  p50DepletedAge: number | null
}

/** 蒙特卡洛压力测试的输入参数 */
export interface McConfig {
  /** 模拟次数 */
  iterations: number
  /** 年化收益率的波动率（σ） */
  returnVolatility: number
  /** 生活费涨幅（通胀）的波动率（σ） */
  inflationVolatility: number
}

export const DEFAULT_MC_CONFIG: McConfig = {
  iterations: 1000,
  returnVolatility: 0.02,
  inflationVolatility: 0.01,
}

/** 换车年份列表：初始年龄 + 周期，每周期一次，直到目标年龄 */
export function carYears(startAge: number, targetAge: number, interval: number): number[] {
  // 周期非法时返回空列表：本函数对外导出、可被复用，
  // 若 interval <= 0 则 for 循环无法推进（死循环）
  if (!Number.isFinite(interval) || interval <= 0) return []

  const years: number[] = []
  for (let age = startAge + interval; age <= targetAge; age += interval) {
    years.push(age)
  }
  return years
}

/** 计算单个年度（供 simulate / simulateScenario / monteCarlo 复用） */
function computeYear(
  params: SimParams,
  age: number,
  principal: number,
  annualReturn: number,
  livingFactor: number,
  cars: number[],
): YearRow {
  const yearsSince = age - params.startAge

  const investmentIncome = params.enableInvestment ? principal * annualReturn : 0

  const salary =
    params.enableSalary && age <= params.salaryStopAge
      ? params.monthlySalary * 12 * Math.pow(1 + params.salaryGrowth, yearsSince)
      : 0

  const extraIncome =
    params.enableExtraIncome && age > params.salaryStopAge && age <= params.extraIncomeStopAge
      ? params.monthlyExtraIncome *
        12 *
        Math.pow(1 + params.extraIncomeGrowth, age - params.salaryStopAge - 1)
      : 0

  const living = params.enableLiving ? params.monthlyLiving * 12 * livingFactor : 0

  const medical =
    params.enableMedical && age >= params.medicalStartAge
      ? params.monthlyMedical *
        12 *
        Math.pow(1 + params.medicalGrowth, age - params.medicalStartAge)
      : 0

  let carNet = 0
  if (params.enableCar && cars.includes(age)) {
    const newCarPrice = params.initialCarPrice * Math.pow(1 + params.carPriceGrowth, yearsSince)
    carNet = newCarPrice * (1 - CAR_RESIDUAL_RATIO)
  }

  const oneOff = params.enableOneOff
    ? params.oneOffExpenses.reduce((sum, e) => (e.age === age ? sum + e.amount : sum), 0)
    : 0

  const endPrincipal =
    principal + investmentIncome + salary + extraIncome - living - medical - carNet - oneOff

  return {
    age,
    startPrincipal: principal,
    investmentIncome,
    salary,
    extraIncome,
    living,
    medical,
    carNet,
    oneOff,
    endPrincipal,
  }
}

/** 按年递推「初始年龄」到「目标年龄」，使用中性收益率（默认参数下运行） */
export function simulate(params: SimParams): YearRow[] {
  return simulateScenario(params, params.annualReturn)
}

/** 按年递推，使用指定的年化收益率（三情景对照用） */
export function simulateScenario(params: SimParams, annualReturn: number): YearRow[] {
  if (params.startAge >= params.targetAge) return []

  const rows: YearRow[] = []
  const cars = carYears(params.startAge, params.targetAge, params.carReplaceInterval)
  let principal = params.initialPrincipal

  for (let age = params.startAge; age <= params.targetAge; age++) {
    const livingFactor = Math.pow(1 + params.livingGrowth, age - params.startAge)
    const row = computeYear(params, age, principal, annualReturn, livingFactor, cars)
    rows.push(row)

    // 资不抵债即截断：记录当年缺口后终止，不再推演负债雪球
    if (row.endPrincipal < 0) break

    principal = row.endPrincipal
  }

  return rows
}

/** 从模拟结果提取关键节点 + 破产分析 */
export function analyze(rows: YearRow[], params: SimParams): Analysis {
  const startAge = rows[0]?.age ?? params.startAge
  const simulatedThroughAge = rows.length > 0 ? rows[rows.length - 1].age : startAge
  const finalBalance = rows.length > 0 ? rows[rows.length - 1].endPrincipal : 0

  const byAge = new Map<number, number>()
  let minBalance = Infinity
  let minBalanceAge = startAge
  let firstNegativeAge = -1
  for (const row of rows) {
    byAge.set(row.age, row.endPrincipal)
    if (row.endPrincipal < minBalance) {
      minBalance = row.endPrincipal
      minBalanceAge = row.age
    }
    if (firstNegativeAge === -1 && row.endPrincipal < 0) {
      firstNegativeAge = row.age
    }
  }
  if (rows.length === 0) {
    minBalance = 0
  }

  const firstCarAge = params.startAge + params.carReplaceInterval
  // 提前耗尽时这些年份根本没被模拟到，返回 null 而不是拿终值顶替（否则卡片会
  // 张冠李戴地显示「91 岁停薪后」却给出 90 岁的余额）
  const afterFirstCar = byAge.get(firstCarAge) ?? null
  const afterSalaryStop = byAge.get(params.salaryStopAge + 1) ?? null

  return {
    startAge,
    targetAge: params.targetAge,
    simulatedThroughAge,
    salaryStopAge: params.salaryStopAge,
    firstCarAge,
    survives: firstNegativeAge === -1 && finalBalance > 0,
    minBalance,
    minBalanceAge,
    firstNegativeAge,
    finalBalance,
    afterFirstCar,
    afterSalaryStop,
  }
}

/** 结论判定：把「中性 / 悲观」两组分析归纳成三档结论，供 UI 渲染横幅 */
export type Verdict = 'safe' | 'risky' | 'bankrupt'

/**
 * safe     = 中性、悲观情景都能躺平到目标年龄（全程都未破产）
 * risky    = 中性可以，但悲观情景会破产
 * bankrupt = 中性情景本身就会破产
 *
 * 判定依据是「全程任何一年都未为负」（Analysis.survives），而不是只看目标年龄的终值。
 */
export function verdict(neutral: Analysis, pessimistic: Analysis): Verdict {
  if (!neutral.survives) return 'bankrupt'
  return pessimistic.survives ? 'safe' : 'risky'
}

function gaussian(): number {
  // Box-Muller
  let u = 0
  let v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x))
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))
  return sorted[idx]
}

/**
 * 蒙特卡洛压力测试：每年收益率 ~ N(annualReturn, returnVolatility)、
 * 生活费涨幅 ~ N(livingGrowth, inflationVolatility) 随机游走，
 * 共 iterations 次模拟，统计全程本金从未为负的成功率与最终资产分位。
 *
 * 与 simulateScenario 一致，资不抵债即截断该次模拟，以耗尽当年的缺口计入最终资产，
 * 并记录耗尽年龄。
 */
export function monteCarlo(params: SimParams, config: McConfig): McResult {
  const { iterations, returnVolatility, inflationVolatility } = config
  const empty: McResult = {
    successRate: 0,
    p5Final: 0,
    p50Final: 0,
    p95Final: 0,
    worstFinal: 0,
    p50DepletedAge: null,
  }
  if (params.startAge >= params.targetAge || iterations <= 0) return empty

  const cars = carYears(params.startAge, params.targetAge, params.carReplaceInterval)
  const finals: number[] = []
  const depletedAges: number[] = []
  let successes = 0

  for (let iter = 0; iter < iterations; iter++) {
    let principal = params.initialPrincipal
    let livingFactor = 1
    let ok = true

    for (let age = params.startAge; age <= params.targetAge; age++) {
      const ret = clamp(params.annualReturn + returnVolatility * gaussian(), -0.3, 0.6)
      const row = computeYear(params, age, principal, ret, livingFactor, cars)

      if (row.endPrincipal < 0) {
        ok = false
        principal = row.endPrincipal
        depletedAges.push(age)
        break
      }

      principal = row.endPrincipal

      // 通胀在「下一年」生效：起始年的生活费系数必须是 1，否则 MC 首年就多涨一轮，
      // 与 simulate() 的 pow(1 + livingGrowth, age - startAge) 口径不一致
      // （实测该偏差会让 MC 中位数比确定性结果低约 20%）。
      const infl = clamp(params.livingGrowth + inflationVolatility * gaussian(), -0.05, 0.2)
      livingFactor *= 1 + infl
    }

    finals.push(principal)
    if (ok) successes++
  }

  finals.sort((a, b) => a - b)
  depletedAges.sort((a, b) => a - b)
  return {
    successRate: successes / iterations,
    p5Final: percentile(finals, 0.05),
    p50Final: percentile(finals, 0.5),
    p95Final: percentile(finals, 0.95),
    worstFinal: finals[0] ?? 0,
    p50DepletedAge: depletedAges.length > 0 ? percentile(depletedAges, 0.5) : null,
  }
}
