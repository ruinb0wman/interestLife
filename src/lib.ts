// 躺平财务模拟器 · 核心计算公式
//
// 通用收支模型：从「开始年龄」递推到「结束年龄」，收入与支出都是一组通用项
// （CashFlowItem）。引擎不感知「工资 / 生活费 / 换车 / 医疗」这类专用分类——
// 它们只是 Dashboard 里的预设模板。
//
// 每年递推顺序（严格）：
//   1. 年初本金产生投资收益：investmentIncome = 年初本金 × 该情景年化收益率
//   2. 累加当年所有收入项的金额
//   3. 累减当年所有支出项的金额
//  → 年末本金 = 年初本金 + 投资收益 + 收入合计 − 支出合计
//
// 每个收支项由「单次金额 + 周期」描述：
//   amount       每次发生的金额（元/次）
//   period       'once' 仅一次 | 'month' 每 interval 个月 | 'year' 每 interval 年
//   interval     周期间隔，>= 1（period='once' 时无意义，固定 1）
//   例：period='month' interval=1  → 每月（每年 12 次）
//       period='month' interval=2  → 每两个月（每年 6 次）
//       period='year'  interval=10 → 每 10 年一次
//       period='once'              → 只在 startAge 那年一次
//
// 某年的金额 = 单次金额 × 当年发生次数：
//   单次金额(item, age) = amount × (1 + growth) ^ (age − startAge)
//   发生次数(item, age) = 区间内该年落下的第 k 次（自 startAge 起算）个数
// 涨幅按年复利、作用于「单次金额」，起始年系数为 1。
// 例：每月 3000 元、年涨 3% → 第 n 年每次 3000×1.03^n，当年合计 36000×1.03^n。
//
// 复利与周期触发的顺序均体现在下方 simulate() 中。
// monteCarlo() 为压力测试：收益率与「各支出项的涨幅」逐年随机游走（收入涨幅固定）。
//
// 截断规则：某一年年末本金首次为负（资不抵债）即终止模拟，当年缺口保留在结果里。
// 不再推演后续年份——现实中无法以自己组合的收益率无限透支，
// 否则负本金会跟着「复利」滚成雪球，把悲观情景的破产金额严重夸大。

export const DEFAULT_START_AGE = 30
export const DEFAULT_END_AGE = 90
/** 默认初始投资本金（元） */
export const DEFAULT_PRINCIPAL = 500_000
/** 换车模板的基准新车价（元） */
export const DEFAULT_CAR_PRICE = 100_000
/** 旧车残值 = 当前车价 × 25%；换车模板据此把「净支出」预折算成 75% 车价 */
export const CAR_RESIDUAL_RATIO = 0.25

/** 周期的计量单位 */
export type PeriodUnit = 'month' | 'year'
/** 发生方式：仅一次 / 每 interval 个月 / 每 interval 年 */
export type Period = 'once' | PeriodUnit

/** 通用收支项（收入与支出共用同一结构，由所在的列表决定方向） */
export interface CashFlowItem {
  /** 稳定标识：列表编辑的 key、图表 series 标识 */
  id: string
  /** 展示名称，如「工资」「换车」 */
  name: string
  /** 单次发生金额（元/次） */
  amount: number
  /** 周期：once = 仅一次；month = 每 interval 个月；year = 每 interval 年 */
  period: Period
  /** 周期间隔，每 interval 个 period 发生一次（period='once' 时固定为 1） */
  interval: number
  /** 单次金额的年涨幅（小数，如 3% 填 0.03） */
  growth: number
  /** 开始年龄（首次发生年龄） */
  startAge: number
  /** 结束年龄（含） */
  endAge: number
  /** 是否启用：关闭后该项当期计为 0 */
  enabled: boolean
}

/** 所有可调参数（涨幅/利率均以小数输入，如 3% 填 0.03） */
export interface SimParams {
  /** 初始年龄（岁，模拟起点） */
  startAge: number
  /** 结束年龄（岁，模拟终点） */
  endAge: number
  /** 初始投资本金（元） */
  initialPrincipal: number

  /** 普通（中性）年化收益率，用于主曲线 */
  annualReturn: number
  /** 乐观情景收益率 */
  optimisticReturn: number
  /** 悲观情景收益率 */
  pessimisticReturn: number

  /** 收入项列表 */
  incomes: CashFlowItem[]
  /** 支出项列表 */
  expenses: CashFlowItem[]
}

/** 某一年度的现金流明细 */
export interface YearRow {
  age: number
  /** 年初本金 */
  startPrincipal: number
  /** 投资收益 = 年初本金 × 年化收益率 */
  investmentIncome: number
  /** 各收入项当年金额，与 params.incomes 同序（当年未发生为 0） */
  incomes: number[]
  /** 各支出项当年金额，与 params.expenses 同序（当年未发生为 0） */
  expenses: number[]
  /** 收入合计 */
  incomeTotal: number
  /** 支出合计 */
  expenseTotal: number
  /** 年末本金 */
  endPrincipal: number
}

/** 破产分析结果 */
export interface Analysis {
  /** 初始年龄 */
  startAge: number
  /** 用户设定的计划终点年龄（与实际模拟终点无关） */
  endAge: number
  /** 实际模拟到的最后一年：正常 = 结束年龄；资不抵债时 = 耗尽那年 */
  simulatedThroughAge: number
  /** 能否存活到结束年龄：全程任何一年年末本金都未为负，且结束年龄年末本金为正 */
  survives: boolean
  /** 全程最低本金（取各年年末本金最小值） */
  minBalance: number
  /** 出现最低本金的年龄 */
  minBalanceAge: number
  /** 全程最高本金（取各年年末本金最大值；破产时不小于 0 的年份里最高） */
  peakBalance: number
  /** 出现最高本金的年龄 */
  peakBalanceAge: number
  /** 本金首现负数的年龄（即资产耗尽年龄）；若从未为负则返回 -1 */
  firstNegativeAge: number
  /**
   * 模拟终点的年末本金：
   * 未耗尽时 = 结束年龄总资产；耗尽时 = 耗尽当年的缺口（负数）
   */
  finalBalance: number
  /** 被模拟到的年份的收入累计 */
  totalIncome: number
  /** 被模拟到的年份的支出累计 */
  totalExpense: number
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
  /** 各支出项涨幅（通胀）的波动率（σ） */
  inflationVolatility: number
}

export const DEFAULT_MC_CONFIG: McConfig = {
  iterations: 1000,
  returnVolatility: 0.02,
  inflationVolatility: 0.01,
}

/** 周期非法值归一到「每 1 个单位」，避免取模炸开或死循环 */
function toInterval(interval: number): number {
  if (!Number.isFinite(interval)) return 1
  return Math.max(1, Math.round(interval))
}

/** 该项在某年发生几次（已含 enabled 与区间判断） */
export function occurrencesInYear(item: CashFlowItem, age: number): number {
  if (!item.enabled) return 0
  if (age < item.startAge || age > item.endAge) return 0

  const elapsed = age - item.startAge
  if (item.period === 'once') return elapsed === 0 ? 1 : 0

  const interval = toInterval(item.interval)
  if (item.period === 'year') return elapsed % interval === 0 ? 1 : 0

  // 月周期：数一数本年这 12 个月里落了几次（第 k 次发生在自 startAge 起 k*interval 个月）
  const fromMonth = elapsed * 12
  const firstIndex = Math.ceil(fromMonth / interval)
  const lastIndex = Math.ceil((fromMonth + 12) / interval) - 1
  return Math.max(0, lastIndex - firstIndex + 1)
}

/** 项在某年是否会发生（至少一次） */
export function occursAt(item: CashFlowItem, age: number): boolean {
  return occurrencesInYear(item, age) > 0
}

/** 单次金额（已含从 startAge 起的年复利） */
export function perOccurrenceAmount(item: CashFlowItem, age: number): number {
  return item.amount * Math.pow(1 + item.growth, age - item.startAge)
}

/**
 * 该项摊到每年的平均金额（展示用，与 simulate 的逐年结果可能有微小差异：
 * 月周期且 interval 不整除 12 时，各年次数本来就不均匀）。
 * period='once' 时返回单次金额——一次性项没有「年额」概念，调用方需自行区分文案。
 */
export function averageAnnualAmount(item: CashFlowItem): number {
  if (item.period === 'once') return item.amount
  const interval = toInterval(item.interval)
  return item.period === 'month' ? (item.amount * 12) / interval : item.amount / interval
}

/** 月周期在 interval 确定时「每年大约发生几次」 */
export function monthlyOccurrencesPerYear(interval: number): number {
  return 12 / toInterval(interval)
}

/** 区间上限：本函数是导出 API，防御未夹紧的荒谬区间导致长循环 */
const MAX_OCCURRENCE_SPAN = 1000

/**
 * 项在 [rangeStart, rangeEnd] 区间内「至少发生一次」的年龄列表（不看 enabled，供 UI 备注用）。
 * 月周期通常每年都会返回；年周期只返回触发年。
 */
export function occurrenceYears(
  item: CashFlowItem,
  rangeStart: number,
  rangeEnd: number,
): number[] {
  const years: number[] = []
  const from = Math.max(item.startAge, rangeStart)
  const to = Math.min(item.endAge, rangeEnd)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return years
  if (to < from || to - from > MAX_OCCURRENCE_SPAN) return years

  for (let age = from; age <= to; age++) {
    if (occurrencesInYear(item, age) > 0) years.push(age)
  }
  return years
}

/** 深拷贝收支项列表（避免默认值与 UI 状态共享同一份对象） */
export function cloneItems(items: CashFlowItem[]): CashFlowItem[] {
  return items.map((item) => ({ ...item }))
}

/** 深拷贝参数 */
export function cloneParams(params: SimParams): SimParams {
  return {
    ...params,
    incomes: cloneItems(params.incomes),
    expenses: cloneItems(params.expenses),
  }
}

/** 生成收支项 id；优先用 crypto.randomUUID，非安全上下文退化为随机串 */
export function createItemId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** 预设模板：Dashboard 的「+ 添加」下拉用，让老配置一键复现 */
export interface CashFlowPreset {
  key: string
  label: string
  type: 'income' | 'expense'
  hint: string
}

export const CASHFLOW_PRESETS: CashFlowPreset[] = [
  { key: 'salary', label: '工资', type: 'income', hint: '每月 3000 元，年涨 3%，发到 50 岁' },
  { key: 'gig', label: '零工', type: 'income', hint: '每月 2000 元，年涨 3%，50 岁起' },
  { key: 'blank-income', label: '空白项', type: 'income', hint: '从零自己填写' },
  { key: 'living', label: '生活费', type: 'expense', hint: '每月 3000 元，年涨 3%' },
  { key: 'car', label: '换车', type: 'expense', hint: '每 10 年一次，单次净支出含 25% 残值' },
  { key: 'medical', label: '老年医疗', type: 'expense', hint: '70 岁起每月 2000 元，年涨 3%' },
  { key: 'oneoff', label: '大病/意外', type: 'expense', hint: '仅一次：60 岁支出 20 万' },
  { key: 'blank-expense', label: '空白项', type: 'expense', hint: '从零自己填写' },
]

/** 按模板生成收支项；年龄夹紧到 [startAge, endAge] 且保证 startAge <= endAge */
export function createItem(presetKey: string, startAge: number, endAge: number): CashFlowItem {
  const lo = Math.min(startAge, endAge)
  const hi = Math.max(startAge, endAge)
  const at = (age: number) => Math.min(hi, Math.max(lo, Math.round(age)))

  const base = {
    id: createItemId(),
    amount: 0,
    period: 'month' as Period,
    interval: 1,
    growth: 0,
    startAge: lo,
    endAge: hi,
    enabled: true,
  }

  switch (presetKey) {
    case 'salary':
      return { ...base, name: '工资', amount: 3000, growth: 0.03, endAge: at(lo + 20) }
    case 'gig':
      return { ...base, name: '零工', amount: 2000, growth: 0.03, startAge: at(lo + 20), endAge: hi }
    case 'living':
      return { ...base, name: '生活费', amount: 3000, growth: 0.03 }
    case 'car': {
      // 与旧模型等价：车价从「全局开始年龄」起按 1% 复利，首次换车在 lo + 10。
      // 单次金额是「首次换车那年」的净支出，之后每 10 年再按 growth 复利一次：
      //   amount = 车价 × (1 − 残值率) × (1 + 涨幅)^(首次换车年龄 − 全局开始年龄)
      // 于是触发年的净支出与旧的 initialCarPrice × (1 + g)^(age − startAge) × 75% 逐年一致
      // （差一位小数以内：金额按「分」四舍五入，否则输入框里会显示 82846.65940584034 这种值）。
      const carGrowth = 0.01
      const firstCarAge = at(lo + 10)
      const netCost =
        DEFAULT_CAR_PRICE *
        (1 - CAR_RESIDUAL_RATIO) *
        Math.pow(1 + carGrowth, firstCarAge - lo)
      return {
        ...base,
        name: '换车',
        amount: Math.round(netCost * 100) / 100,
        period: 'year',
        interval: 10,
        growth: carGrowth,
        startAge: firstCarAge,
        endAge: hi,
      }
    }
    case 'medical':
      return {
        ...base,
        name: '老年医疗',
        amount: 2000,
        growth: 0.03,
        startAge: at(70),
        endAge: hi,
      }
    case 'oneoff':
      return {
        ...base,
        name: '大病/意外',
        amount: 200_000,
        period: 'once',
        interval: 1,
        growth: 0,
        startAge: at(60),
        endAge: hi,
      }
    case 'blank-income':
      return { ...base, name: '新收入' }
    default:
      return { ...base, name: '新支出' }
  }
}

export const DEFAULT_PARAMS: SimParams = {
  startAge: DEFAULT_START_AGE,
  endAge: DEFAULT_END_AGE,
  initialPrincipal: DEFAULT_PRINCIPAL,
  annualReturn: 0.08,
  optimisticReturn: 0.1,
  pessimisticReturn: 0.04,
  incomes: [createItem('salary', DEFAULT_START_AGE, DEFAULT_END_AGE)],
  expenses: [
    createItem('living', DEFAULT_START_AGE, DEFAULT_END_AGE),
    createItem('car', DEFAULT_START_AGE, DEFAULT_END_AGE),
  ],
}

function sum(values: number[]): number {
  let total = 0
  for (const value of values) total += value
  return total
}

/** 计算单个年度的收支明细（纯函数，供 simulate / simulateScenario / monteCarlo 复用） */
function computeYear(
  age: number,
  principal: number,
  annualReturn: number,
  incomeAmounts: number[],
  expenseAmounts: number[],
): YearRow {
  const investmentIncome = principal * annualReturn
  const incomeTotal = sum(incomeAmounts)
  const expenseTotal = sum(expenseAmounts)
  const endPrincipal = principal + investmentIncome + incomeTotal - expenseTotal

  return {
    age,
    startPrincipal: principal,
    investmentIncome,
    incomes: incomeAmounts,
    expenses: expenseAmounts,
    incomeTotal,
    expenseTotal,
    endPrincipal,
  }
}

/**
 * 计算某年各项的金额（当年未发生为 0）。
 * 传入 factors 时用累计系数替换「单次金额」的复利（MC 通胀随机游走用）。
 */
function yearAmounts(items: CashFlowItem[], age: number, factors?: number[]): number[] {
  const out: number[] = new Array(items.length)
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const count = occurrencesInYear(item, age)
    if (count === 0) {
      out[i] = 0
      continue
    }
    const per = factors
      ? item.amount * factors[i]
      : item.amount * Math.pow(1 + item.growth, age - item.startAge)
    out[i] = count * per
  }
  return out
}

/** 按年递推「开始年龄」到「结束年龄」，使用普通（中性）收益率 */
export function simulate(params: SimParams): YearRow[] {
  return simulateScenario(params, params.annualReturn)
}

/** 按年递推，使用指定的年化收益率（三情景对照用） */
export function simulateScenario(params: SimParams, annualReturn: number): YearRow[] {
  if (params.startAge >= params.endAge) return []

  const rows: YearRow[] = []
  let principal = params.initialPrincipal

  for (let age = params.startAge; age <= params.endAge; age++) {
    const row = computeYear(
      age,
      principal,
      annualReturn,
      yearAmounts(params.incomes, age),
      yearAmounts(params.expenses, age),
    )
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

  let minBalance = Infinity
  let minBalanceAge = startAge
  let peakBalance = -Infinity
  let peakBalanceAge = startAge
  let firstNegativeAge = -1
  let totalIncome = 0
  let totalExpense = 0

  for (const row of rows) {
    totalIncome += row.incomeTotal
    totalExpense += row.expenseTotal
    if (row.endPrincipal < minBalance) {
      minBalance = row.endPrincipal
      minBalanceAge = row.age
    }
    if (row.endPrincipal > peakBalance) {
      peakBalance = row.endPrincipal
      peakBalanceAge = row.age
    }
    if (firstNegativeAge === -1 && row.endPrincipal < 0) {
      firstNegativeAge = row.age
    }
  }

  // 空结果集（startAge >= endAge）时不留下 ±Infinity
  if (rows.length === 0) {
    minBalance = 0
    peakBalance = 0
  }

  return {
    startAge,
    endAge: params.endAge,
    simulatedThroughAge,
    survives: firstNegativeAge === -1 && finalBalance > 0,
    minBalance,
    minBalanceAge,
    peakBalance,
    peakBalanceAge,
    firstNegativeAge,
    finalBalance,
    totalIncome,
    totalExpense,
  }
}

/** 结论判定：把「普通 / 悲观」两组分析归纳成三档结论，供 UI 渲染横幅 */
export type Verdict = 'safe' | 'risky' | 'bankrupt'

/**
 * safe     = 普通、悲观情景都能躺平到结束年龄（全程都未破产）
 * risky    = 普通可以，但悲观情景会破产
 * bankrupt = 普通情景本身就会破产
 *
 * 判定依据是「全程任何一年都未为负」（Analysis.survives），而不是只看结束年龄的终值。
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
 * 蒙特卡洛压力测试：每年收益率 ~ N(普通收益率, 收益波动率)，
 * 注意：漂移刻意取「普通收益率」而非悲观收益率——它测的是围绕普通情景的**波动**风险，
 * 不覆盖「实际长期收益率比普通情景更低」这类假设风险（那种情况由 simulateScenario(悲观) 回答）。
 * 收益为 iid 抽样、无序列相关/regime switching，因此持久性低收益情景抽不出来：
 * 即使把 σ 拉到 0.12，也不等价于「均值掉到悲观收益率」。UI 必须写明这一口径。
 * 每个「支出项」的单次金额涨幅 ~ N(该项涨幅, 通胀波动率) 逐年随机游走
 * （收入项涨幅固定），共 iterations 次模拟，
 * 统计全程本金从未为负的成功率与最终资产分位。
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
  if (params.startAge >= params.endAge || iterations <= 0) return empty

  const expenseCount = params.expenses.length
  const finals: number[] = []
  const depletedAges: number[] = []
  let successes = 0

  for (let iter = 0; iter < iterations; iter++) {
    let principal = params.initialPrincipal
    // 每个支出项一个累计涨幅系数。基准必须与确定性路径的
    // pow(1 + growth, age − startAge) 对齐：起始年系数为 1，且只从该项 startAge 起才推进，
    // 否则「每 10 年一次的换车」会从全局开始年龄就滚动涨幅，比确定性结果多涨 10 年。
    const expenseFactors: number[] = params.expenses.map((expense) =>
      expense.startAge < params.startAge
        ? Math.pow(1 + expense.growth, params.startAge - expense.startAge)
        : 1,
    )
    let ok = true

    for (let age = params.startAge; age <= params.endAge; age++) {
      const ret = clamp(params.annualReturn + returnVolatility * gaussian(), -0.3, 0.6)
      const row = computeYear(
        age,
        principal,
        ret,
        yearAmounts(params.incomes, age),
        yearAmounts(params.expenses, age, expenseFactors),
      )

      if (row.endPrincipal < 0) {
        ok = false
        principal = row.endPrincipal
        depletedAges.push(age)
        break
      }

      principal = row.endPrincipal

      // 通胀在「下一年」生效：起始年的系数必须是 1，否则 MC 首年就多涨一轮，
      // 与 simulate() 的 pow(1 + growth, age - startAge) 口径不一致。
      for (let i = 0; i < expenseCount; i++) {
        if (age < params.expenses[i].startAge) continue
        const infl = clamp(params.expenses[i].growth + inflationVolatility * gaussian(), -0.05, 0.2)
        expenseFactors[i] *= 1 + infl
      }
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
