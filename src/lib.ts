// 躺平财务模拟器 · 核心计算公式
//
// 模拟一位不交社保、不买房、不生子的人，依靠投资和零散工资收入，
// 从「初始年龄」到「目标年龄」的现金流。
//
// 每年递推顺序（严格）：
//   1. 年初本金产生投资收益：income = 年初本金 × 年化收益率
//   2. 加入当年工资（超过「工资结束年龄」后为 0）
//   3. 扣除当年生活费
//   4. 若当年为换车年，最后扣除换车净支出（新车价 − 旧车残值）
//  → 年末本金 = 年初本金 + 投资收益 + 年工资 − 年生活费 − 换车净支出
//
// 复利、残值抵扣、换车年顺序均体现在下方 simulate() 中。

export const DEFAULT_START_AGE = 30
export const DEFAULT_TARGET_AGE = 90
export const DEFAULT_SALARY_STOP_AGE = 50
export const DEFAULT_CAR_REPLACE_INTERVAL = 10
// 旧车残值 = 当前车价 × 25%
export const CAR_RESIDUAL_RATIO = 0.25

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
  /** 投资年化收益率（小数，默认 0.08） */
  annualReturn: number
  /** 初始新车价格（元，默认 100000），购买价 = 车价 × (1+车价涨幅)^(年龄−初始年龄) */
  initialCarPrice: number
  /** 车价年涨幅（小数，默认 0.01） */
  carPriceGrowth: number
  /** 是否启用工资收入 */
  enableSalary: boolean
  /** 是否启用投资收益 */
  enableInvestment: boolean
  /** 是否启用生活费支出 */
  enableLiving: boolean
  /** 是否启用换车支出 */
  enableCar: boolean
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
  initialCarPrice: 100000,
  carPriceGrowth: 0.01,
  enableSalary: true,
  enableInvestment: true,
  enableLiving: true,
  enableCar: true,
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
  /** 年生活费 */
  living: number
  /** 换车净支出 = 新车价 − 旧车残值，非换车年为 0 */
  carNet: number
  /** 年末本金 */
  endPrincipal: number
}

/** 破产分析结果 */
export interface Analysis {
  /** 初始年龄 */
  startAge: number
  /** 目标年龄 */
  targetAge: number
  /** 工资结束年龄（最后发薪年） */
  salaryStopAge: number
  /** 第一次换车年龄 = 初始年龄 + 买车周期 */
  firstCarAge: number
  /** 能否存活到目标年龄（目标年龄年末本金 > 0） */
  survives: boolean
  /** 全程最低本金（取各年年末本金最小值） */
  minBalance: number
  /** 出现最低本金的年龄 */
  minBalanceAge: number
  /** 本金首现负数的年龄；若从未为负则返回 -1 */
  firstNegativeAge: number
  /** 目标年龄年末本金，即全程总资产 */
  finalBalance: number
  /** 第一次换车后的年末本金 */
  afterFirstCar: number
  /** 停薪后（工资结束年龄 + 1）的年末本金 */
  afterSalaryStop: number
}

/** 换车年份列表：初始年龄 + 周期，每周期一次，直到目标年龄 */
export function carYears(startAge: number, targetAge: number, interval: number): number[] {
  const years: number[] = []
  for (let age = startAge + interval; age <= targetAge; age += interval) {
    years.push(age)
  }
  return years
}

/** 按年递推「初始年龄」到「目标年龄」，每年一行 */
export function simulate(params: SimParams): YearRow[] {
  if (params.startAge >= params.targetAge) return []

  const rows: YearRow[] = []
  const cars = carYears(params.startAge, params.targetAge, params.carReplaceInterval)
  let principal = params.initialPrincipal

  for (let age = params.startAge; age <= params.targetAge; age++) {
    const yearsSince = age - params.startAge

    // 1. 投资收益（基于年初本金）
    const investmentIncome = params.enableInvestment ? principal * params.annualReturn : 0

    // 2. 工资（超过工资结束年龄后为 0）
    const salary =
      params.enableSalary && age <= params.salaryStopAge
        ? params.monthlySalary * 12 * Math.pow(1 + params.salaryGrowth, yearsSince)
        : 0

    // 3. 生活费（每年按涨幅上涨）
    const living = params.enableLiving
      ? params.monthlyLiving * 12 * Math.pow(1 + params.livingGrowth, yearsSince)
      : 0

    // 4. 换车（最后一步）：新车价 = 车价 × (1+涨幅)^(年龄−初始年龄)，残值 = 当前车价 × 25%
    let carNet = 0
    if (params.enableCar && cars.includes(age)) {
      const newCarPrice = params.initialCarPrice * Math.pow(1 + params.carPriceGrowth, yearsSince)
      const residual = newCarPrice * CAR_RESIDUAL_RATIO
      carNet = newCarPrice - residual
    }

    // 年末本金
    const endPrincipal = principal + investmentIncome + salary - living - carNet

    rows.push({
      age,
      startPrincipal: principal,
      investmentIncome,
      salary,
      living,
      carNet,
      endPrincipal,
    })

    principal = endPrincipal
  }

  return rows
}

/** 从模拟结果提取关键节点 + 破产分析 */
export function analyze(rows: YearRow[], params: SimParams): Analysis {
  const startAge = rows[0]?.age ?? params.startAge
  const targetAge = rows.length > 0 ? rows[rows.length - 1].age : params.targetAge
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
  const afterFirstCar = byAge.get(firstCarAge) ?? finalBalance
  const afterSalaryStop = byAge.get(params.salaryStopAge + 1) ?? finalBalance

  return {
    startAge,
    targetAge,
    salaryStopAge: params.salaryStopAge,
    firstCarAge,
    survives: finalBalance > 0,
    minBalance,
    minBalanceAge,
    firstNegativeAge,
    finalBalance,
    afterFirstCar,
    afterSalaryStop,
  }
}
