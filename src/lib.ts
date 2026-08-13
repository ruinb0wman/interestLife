// 躺平财务模拟器 · 核心计算公式
//
// 模拟一位 32 岁、不交社保、不买房、不生子的人，
// 依靠投资和零散工资收入度过 32 ~ 92 岁共 60 年的现金流。
//
// 每年递推顺序（严格）：
//   1. 年初本金产生投资收益：income = 年初本金 × 年化收益率
//   2. 加入当年工资（52 岁起为 0）
//   3. 扣除当年生活费
//   4. 若当年为换车年，最后扣除换车净支出（新车价 − 旧车残值）
//  → 年末本金 = 年初本金 + 投资收益 + 年工资 − 年生活费 − 换车净支出
//
// 复利、残值抵扣、换车年顺序均体现在下方 simulate() 中。

export const START_AGE = 32
export const END_AGE = 92
// 工资停发年龄（32 ~ 51 岁共 20 年有工资，52 岁起为 0）
export const SALARY_STOP_AGE = 51
// 换车年龄：42、52、62、72、82、92 各换一次
export const CAR_YEARS = [42, 52, 62, 72, 82, 92]
// 旧车残值 = 当前车价 × 25%
export const CAR_RESIDUAL_RATIO = 0.25

/** 所有可调参数（涨幅/利率均以小数输入，如 3% 填 0.03） */
export interface SimParams {
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
  /** 初始新车价格（元，默认 100000），购买价 = 车价 × (1+车价涨幅)^(年龄−32) */
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
  /** 年工资（32~51 岁），52 岁起为 0 */
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
  /** 能否存活到 92 岁（92 岁年末本金 > 0） */
  survives: boolean
  /** 60 年内的最低本金（取各年年末本金最小值） */
  minBalance: number
  /** 出现最低本金的年龄 */
  minBalanceAge: number
  /** 本金首现负数的年龄；若从未为负则返回 -1 */
  firstNegativeAge: number
  /** 42 岁（第一次换车后）年末本金 */
  age42: number
  /** 52 岁（停薪 + 第二次换车后）年末本金 */
  age52: number
  /** 92 岁（最后一次换车后）年末本金，即 60 年后的总资产 */
  age92: number
}

/** 按年递推 32 ~ 92 岁，共 61 个年度（END_AGE − START_AGE + 1） */
export function simulate(params: SimParams): YearRow[] {
  const rows: YearRow[] = []
  let principal = params.initialPrincipal

  for (let age = START_AGE; age <= END_AGE; age++) {
    const yearsSince = age - START_AGE

    // 1. 投资收益（基于年初本金）
    const investmentIncome = params.enableInvestment ? principal * params.annualReturn : 0

    // 2. 工资（52 岁起停发）
    const salary =
      params.enableSalary && age <= SALARY_STOP_AGE
        ? params.monthlySalary * 12 * Math.pow(1 + params.salaryGrowth, yearsSince)
        : 0

    // 3. 生活费（每年按涨幅上涨）
    const living = params.enableLiving
      ? params.monthlyLiving * 12 * Math.pow(1 + params.livingGrowth, yearsSince)
      : 0

    // 4. 换车（最后一步）：新车价 = 车价 × (1+涨幅)^(年龄−32)，残值 = 当前车价 × 25%
    let carNet = 0
    if (params.enableCar && CAR_YEARS.includes(age)) {
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
export function analyze(rows: YearRow[]): Analysis {
  let minBalance = Infinity
  let minBalanceAge = START_AGE
  let firstNegativeAge = -1
  let age42 = 0
  let age52 = 0
  let age92 = 0

  for (const row of rows) {
    if (row.endPrincipal < minBalance) {
      minBalance = row.endPrincipal
      minBalanceAge = row.age
    }
    if (firstNegativeAge === -1 && row.endPrincipal < 0) {
      firstNegativeAge = row.age
    }
    if (row.age === 42) age42 = row.endPrincipal
    if (row.age === 52) age52 = row.endPrincipal
    if (row.age === 92) age92 = row.endPrincipal
  }

  return {
    survives: age92 > 0,
    minBalance,
    minBalanceAge,
    firstNegativeAge,
    age42,
    age52,
    age92,
  }
}
