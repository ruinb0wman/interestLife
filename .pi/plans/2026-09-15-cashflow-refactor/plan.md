# 计划：收支模型通用化重构（配置结构简化）

日期：2026-09-15 · 仓库：`/home/ruinb0w/Workspace/interestLife`

## 1. 目标

把当前「7 个写死的专用分类 + 7 个 enable 开关」的扁平配置，换成：

1. **基础信息**：开始年龄、结束年龄、初始本金。
2. **收入项列表 / 支出项列表**（用户可增删），每项可设：名称、金额、频率（每月/每年）、周期（每 N 年一次 / 仅一次）、涨幅、开始年龄、结束年龄、启用开关。
3. **投资收益率**：普通 / 乐观 / 悲观 三档。

并提供「+ 添加」预设模板（工资、零工、生活费、换车、医疗、大病），让老用户一键复现原来的配置。

## 2. 已确认的设计决策（来自用户答复）

| # | 问题 | 决定 |
|---|---|---|
| D1 | 「周期」语义 | **频率 + 每 N 年一次**：`frequency: 'month' \| 'year'` 决定金额换算，`cycle: N` 决定触发年，**首次触发在「开始年龄」**（触发年 = `startAge + k*cycle ≤ endAge`） |
| D2 | 老分类处置 | **全部合并为通用收支项 + 预设模板**；界面从「4 张卡 + 7 个开关」简化为「基础信息 + 收入项 + 支出项 + 投资收益率」 |
| D3 | 旧数据兼容 | **直接重置为 v2**：`STATE_VERSION = 2`，旧 localStorage / 分享链接失效回默认值，不写迁移代码 |
| D4 | 蒙特卡洛通胀游走 | 作用于**所有 `type=支出` 的项**：每项涨幅逐年 `~ N(该项涨幅, 通胀波动率)`；收益率仍 `~ N(普通收益率, 收益波动率)`；收入项涨幅固定 |

## 3. 派生决策（通用化的必然后果，如需调整请指出）

| # | 决策 | 理由 |
|---|---|---|
| P1 | `targetAge` → **`endAge`**（全仓库重命名） | 与「结束年龄」文案一致 |
| P2 | `cycle: 0` 表示**仅发生一次**（在 startAge 那年） | 「一次性大额支出（大病）」需要一个表达方式；比 `cycle=1e9` 干净 |
| P3 | **删除 7 个 `enableX` 开关**，改为每项自带 `enabled: boolean`；删除 `enableInvestment`（收益率填 0 等价于关闭投资） | 开关下沉到项上，配置结构才真正简化 |
| P4 | 涨幅统一按 `amount × (1+growth)^(age − item.startAge)` 复利 | 统一口径；与原工资/生活费/医疗/零工/车价的复利基准一致（各以自身起始年龄为基） |
| P5 | `YearRow` 去掉 `salary/living/medical/carNet/oneOff/extraIncome`，改为 `incomes[]`/`expenses[]`（与参数列表同序）+ `incomeTotal`/`expenseTotal` | 引擎不感知分类 |
| P6 | `Analysis` 去掉 `salaryStopAge/firstCarAge/afterFirstCar/afterSalaryStop`，新增 `peakBalance/peakBalanceAge/totalIncome/totalExpense` | 「停薪后」「第一次换车后」不再是模型概念 |
| P7 | `StatCards` 5 张卡改为：普通终值 / 悲观终值 / 最低本金 / **峰值本金** / **累计净收支** | 替代两张失效的「节点卡」 |
| P8 | 图表 series 改为：本金·乐观/中性/悲观 + 耗尽点 + **每个收支项一条动态曲线**（名称取 `item.name`，重名自动去重） | 保留「能看见工资/生活费曲线」的信息量，同时支持自定义项 |
| P9 | `DetailTable` 列改为：年龄 / 年初本金 / 投资收益 / 收入合计 / 支出合计 / 年末本金；备注行改为「N 个周期项 + 触发年份」 | 通用化 |
| P10 | 换车模板预折算：`amount = 100000 × 75% = 75000`、`growth 0.01`、`cycle 10`、`startAge = 开始年龄 + 10` | 保留 25% 残值语义，数值与旧版逐年等价 |

## 4. 目标数据模型

```ts
/** 通用收支项 */
export interface CashFlowItem {
  /** 稳定标识：列表编辑的 v-for key、图表 series 标识 */
  id: string
  /** 展示名称，如「工资」「换车」 */
  name: string
  /** 金额：frequency='month' 时为元/月，'year' 时为元/年 */
  amount: number
  /** 金额单位：每月 / 每年 */
  frequency: 'month' | 'year'
  /** 周期：>=1 = 每 N 年触发一次（1 = 每年）；0 = 仅发生一次（startAge 那年） */
  cycle: number
  /** 年涨幅（小数，如 3% = 0.03） */
  growth: number
  /** 开始年龄（首次触发年龄） */
  startAge: number
  /** 结束年龄（含） */
  endAge: number
  /** 是否启用；关闭则当期计为 0 */
  enabled: boolean
}

export interface SimParams {
  startAge: number
  endAge: number
  initialPrincipal: number
  /** 普通（中性）年化收益率，用于主曲线 */
  annualReturn: number
  optimisticReturn: number
  pessimisticReturn: number
  incomes: CashFlowItem[]
  expenses: CashFlowItem[]
}

export interface YearRow {
  age: number
  startPrincipal: number
  investmentIncome: number
  /** 各收入项当年金额，与 params.incomes 同序 */
  incomes: number[]
  /** 各支出项当年金额，与 params.expenses 同序 */
  expenses: number[]
  incomeTotal: number
  expenseTotal: number
  endPrincipal: number
}
```

### 计算口径（改写 `computeYear`）

```
amountAt(item, age)  = item.amount × (frequency === 'month' ? 12 : 1)
                                 × (1 + item.growth)^(age − item.startAge)
occursAt(item, age)  = item.enabled && age >= item.startAge && age <= item.endAge
                       && (item.cycle === 0 ? age === item.startAge
                                            : (age − item.startAge) % item.cycle === 0)

某年：incomeTotal  = Σ amountAt(收入项, age) where occursAt
      expenseTotal = Σ amountAt(支出项, age) where occursAt
      investmentIncome = 年初本金 × 该情景收益率
      endPrincipal = 年初本金 + investmentIncome + incomeTotal − expenseTotal
```

**保留**：资不抵债即截断（年末本金首次为负则终止，缺口留在最后一行）、`verdict()` 三档判定、`monteCarlo` 的截断与分位统计、`simulateScenario` 三情景对照。

### 默认参数（等价映射旧默认值）

| 项 | 名称 | 金额 | 单位 | 涨幅 | 周期 | 年龄 |
|---|---|---|---|---|---|---|
| 收入 | 工资 | 3000 | 每月 | 3% | 1 | 30 → 50 |
| 支出 | 生活费 | 3000 | 每月 | 3% | 1 | 30 → 90 |
| 支出 | 换车 | 75000 | 每年 | 1% | 10 | 40 → 90 |

普通 8% / 乐观 10% / 悲观 4%，本金 500000。（旧默认的医疗月支出为 0、零工收入为 0、一次性支出为空，故不生成默认项。）

## 5. 任务清单（顺序执行，单一工作区）

### T1 — 重写 `src/lib.ts`（计算引擎）
- 新增 `CashFlowItem`、`YearRow`、`Analysis` 新字段；`SimParams` 按 §4 重写；`targetAge` → `endAge`。
- 新增导出：`occurrenceYears(item, params)`（替代 `carYears`，供 UI 备注用）、`amountAt()`、`occursAt()`、`itemAnnualAmount()`。
- 导出 `DEFAULT_PARAMS` 与 **`CASHFLOW_PRESETS`**（工资/零工/生活费/换车/医疗/大病/空白 的模板工厂，入参为 `startAge`/`endAge` 以填合理默认年龄）。
- `computeYear` 按 §4 公式重写；`simulate` / `simulateScenario` / `analyze` / `monteCarlo` 同步（`monteCarlo` 按 D4 对每个支出项独立随机游走其涨幅；起始年系数仍为 1，保留原有「通胀次年生效」的口径与注释）。
- 保留 `verdict()`；`carYears`、`CAR_RESIDUAL_RATIO`、`OneOffExpense` 移除（残值语义移入换车模板）。
- **验收**：`bunx vue-tsc --noEmit` 无错；`grep -n "monthlySalary\|carNet\|oneOff\|enableSalary" src/lib.ts` 为空。

### T2 — 重写 `src/persist.ts`（持久化 + 安全边界）
- `STATE_VERSION = 2`，`STORAGE_KEY = 'interestlife.state.v2'`；删除 v1 迁移路径（旧值解析失败 → 返回 null → 回退默认）。
- 用 `sanitizeCashFlowItem(raw, index, prefix)` 取代 `sanitizeOneOff`：逐字段校验 + 夹紧（`amount [0, 1e12]`、`growth [-0.99, 10]`、`cycle [0, 200]` 取整、`startAge/endAge [0, 200]` 取整、`frequency ∈ {'month','year'}` 否则 `'year'`、`name` 非空字符串截断 24 字、`enabled` 布尔），`id` 非法则生成 `` `${prefix}-${index}` ``；**每列表上限 50 项**。
- 项内自洽修正：`startAge > endAge` 时令 `endAge = startAge`（不绑定全局 age，保持现有「不因 endAge 变化静默改写用户输入」的原则）。
- `sanitizeParams` 改写为新的字段表（只对 `startAge/endAge/initialPrincipal/3 个收益率` 做 `NUMBER_LIMITS` 夹紧），保留 `startAge >= endAge` 的整体修正逻辑。
- **验收**：`sanitizeParams` 对 `{}`、`null`、`[]`、含 1000 项的列表、非法 frequency/cycle 均返回合法 `SimParams`；`startAge >= endAge` 不会让 `simulate` 死循环。

### T3 — 重写 `src/components/ParameterPanel.vue`（表单项）
- 4 张卡：基础信息 / 收入项 / 支出项 / 投资收益率。
- 收支项行：每项一张子卡 ——
  - 行1：启用开关 + 名称输入 + 删除按钮
  - 行2：金额 + 单位下拉（每月/每年）+ 涨幅
  - 行3：周期（下拉：每年 / 每 N 年一次 / 仅一次 + N 输入）+ 开始年龄 + 结束年龄
- 每张卡底部 `el-dropdown`「+ 添加」，列出 `CASHFLOW_PRESETS`（收入：工资/零工/其他；支出：生活费/换车/医疗/大病/其他）。
- 年龄输入 `min`/`max` 跟随 `params.startAge`/`params.endAge`；变化时对列表项做夹紧（在 watch 或 add 时保证合法）。
- 删除旧的 `toggles` 卡片、`oneOffExpenses` 编辑块、`moneyFields`/`percentFields` 常量。
- **验收**：增删项后图表与统计同步更新；无 v-for key 复用导致的输入错位（按 `item.id` 作 key）。

### T4 — 下游组件改造（`App.vue`、`StatCards.vue`、`DetailTable.vue`、`chart-option.ts`、`StressTest.vue`）
- `App.vue`：`currentState()` 深拷贝 `incomes`/`expenses`；`resetAll()` 同步；三条横幅文案去掉「工资结束年龄 / 换车 / 医疗」字样，改为通用表述（如「建议提高本金或收益率，或压低支出项涨幅」）；`DetailTable`/`StatCards` 的 props 同步。
- `StatCards.vue`：按 P7 重做卡片。
- `DetailTable.vue`：按 P9 重做列与备注；`carYears` 引用改为新 helper。
- `chart-option.ts`：按 P8 生成动态 series（弃用 `SERIES_NAMES` 常量，改为按项构造 + 重名去重 + 调色板循环）；`耗尽点` 逻辑保留。
- `StressTest.vue`：仅改提示文案（「生活费涨幅」→「各支出项涨幅」）。
- **验收**：`bunx vue-tsc --noEmit` 无错；`grep -rn "carYears\|salaryStopAge\|carNet\|monthlyLiving" src/components src/App.vue src/chart-option.ts` 为空。

### T5 — 重写测试（`lib.test.ts`、`persist.test.ts`、`components.test.ts`、`chart-option.test.ts`）
- `lib.test.ts`：
  - `occursAt`/`occurrenceYears`：每年、每 N 年、仅一次、边界（startAge/endAge 含端点）、`cycle<=0` 不死循环。
  - 逐年勾稽：投资收益 = 年初本金 × 收益率；`endPrincipal = 年初 + 收益 + 收入合计 − 支出合计`。
  - 涨幅复利基准 = `item.startAge`；`frequency='month'` 年额 = 金额 × 12。
  - **等价性回归**（关键）：用旧公式的闭式解硬编码期望值，验证通用引擎能复现旧的工资/生活费/换车（含 75% 残值与 1% 车价涨幅、每 10 年一次）逐年数值。
  - `enabled=false` 的项当期计 0；全部项停用时本金只在收益下增长（收益率为 0 时恒定）。
  - `analyze` 新字段（peak/totalIncome/totalExpense）+ 截断行为不变。
  - `monteCarlo`：波动率为 0 收敛到确定性结果；支出项涨幅随机化生效（同种子/统计断言）；截断与分位不变。
  - `verdict` 三档不变。
- `persist.test.ts`：新的往返、夹紧、非法项过滤、50 项上限、`frequency`/`cycle` 归一化、v1 旧 payload 视为无效、分享链接里垃圾项不会污染模拟。
- `components.test.ts` / `chart-option.test.ts`：适配新 props 与动态 series（数量 = 3 本金 + 1 耗尽点 + 项数）。
- **验收**：`bun run test` 全绿。

### T6 — 文档与文案
- `README.md` 重写「计算口径」「模型假设与局限」两节，给出新的收支项公式、周期语义、`cycle=0` 含义、三情景与 MC 口径、换车 75% 残值的模板折算说明。
- `App.vue` 顶部描述文案同步。
- **验收**：README 中不再出现旧字段名（`grep -n "monthlySalary\|salaryStopAge\|initialCarPrice\|oneOffExpenses" README.md` 为空）。

## 6. 最终验证

```bash
bun run test          # vitest：全部用例
bun run build         # vue-tsc -b && vite build：类型检查 + 产物构建
bun run dev           # 手动核对：默认参数、增删项、三情景横幅、图表 legend、压力测试
```

手动核对清单：
- 默认参数下三情景横幅结论与重构前**一致**（旧默认 = 新默认映射）。
- 添加「大病」模板（仅一次）后当年支出尖峰出现在图表。
- 删除全部收入项后结论变为破产。
- 复制分享链接 → 新标签页打开 → 参数完整还原（v2 链接）。
- 压力测试结果在改参数后显示「参数已变更」失效提示。

## 7. 风险与对策

| 风险 | 对策 |
|---|---|
| 通用化后默认结论与旧版不一致（用户会立刻察觉「算法变了」） | T5 强制做等价性回归测试，用旧闭式公式硬编码期望值 |
| 项数变多后图表 legend / tooltip 拥挤 | 动态 series + 既有 `legend.type: 'scroll'`；预算色板循环 |
| 项内年龄与全局年龄冲突 | 项内只做 `startAge <= endAge` 自洽修正，全局只做安全夹紧（沿用现有注释中的设计原则） |
| 列表项 `id` 缺失导致 v-for 错位 | sanitize 生成确定性 fallback id；UI 新增项时生成 id |
| 旧分享链接静默变默认值（D3 的已知代价） | 已由用户确认接受；UI 已有「已恢复上次编辑的参数」提示机制 |
