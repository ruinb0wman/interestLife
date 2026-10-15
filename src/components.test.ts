// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import App from './App.vue'
import CashFlowItemRow from './components/CashFlowItemRow.vue'
import DetailTable from './components/DetailTable.vue'
import ParameterPanel from './components/ParameterPanel.vue'
import StatCards from './components/StatCards.vue'
import SnapshotPanel from './components/SnapshotPanel.vue'
import { formatWan } from './format'
import { DEFAULT_MC_CONFIG } from './lib'
import { readStateFromStorage, writeStateToStorage, STATE_VERSION } from './persist'
import { createSnapshot, writeSnapshots } from './snapshots'
import {
  analyze,
  cloneParams,
  createItem,
  DEFAULT_PARAMS,
  simulate,
  simulateScenario,
  type Analysis,
  type CashFlowItem,
  type SimParams,
} from './lib'

function analysisOf(overrides: Partial<SimParams> = {}): Analysis {
  const params: SimParams = { ...DEFAULT_PARAMS, ...overrides }
  return analyze(simulate(params), params)
}

/** 只留一项生活费的极简支出配置，便于制造「有钱 / 没钱」两档 */
function livingOnly(amount: number) {
  return [{ ...createItem('living', 30, 90), amount }]
}

describe('StatCards', () => {
  // 回归：cards 曾是 setup 阶段求值的普通数组，label / hint 里的模板字符串被永久固化，
  // 改参数后卡片标题（如「90 岁总资产」与「60 年内最低点」）不会更新。
  it('analysis 变化后卡片标题同步更新', async () => {
    const wrapper = mount(StatCards, {
      props: {
        analysis: analysisOf({ endAge: 90 }),
        pessimisticAnalysis: analysisOf(),
        pessimisticReturn: 0.04,
      },
    })
    expect(wrapper.text()).toContain('90 岁总资产（普通）')

    await wrapper.setProps({ analysis: analysisOf({ endAge: 100 }) })

    expect(wrapper.text()).toContain('100 岁总资产（普通）')
    expect(wrapper.text()).not.toContain('90 岁总资产（普通）')
  })

  it('最低本金卡片提示里的年龄与区间同步更新', async () => {
    const wrapper = mount(StatCards, {
      props: {
        analysis: analysisOf({ endAge: 90 }),
        pessimisticAnalysis: analysisOf(),
        pessimisticReturn: 0.04,
      },
    })
    expect(wrapper.text()).toContain('60 年内最低点')

    await wrapper.setProps({ analysis: analysisOf({ endAge: 100 }) })

    expect(wrapper.text()).toContain('70 年内最低点')
    expect(wrapper.text()).not.toContain('60 年内最低点')
  })

  it('累计净收支卡片随支出项变化同步更新', async () => {
    const wrapper = mount(StatCards, {
      props: {
        analysis: analysisOf({ expenses: livingOnly(1_000) }),
        pessimisticAnalysis: analysisOf(),
        pessimisticReturn: 0.04,
      },
    })

    const thrifty = wrapper.text()
    expect(thrifty).toContain('累计净收支')
    expect(thrifty).toContain('收入')

    await wrapper.setProps({ analysis: analysisOf({ expenses: livingOnly(9_000) }) })

    expect(wrapper.text()).not.toBe(thrifty)
  })

  it('资产耗尽时标题改为「资产耗尽」，并保留缺口金额', () => {
    const wrapper = mount(StatCards, {
      props: {
        analysis: analysisOf({
          incomes: [createItem('salary', 30, 90)],
          expenses: [
            createItem('living', 30, 90),
            { ...createItem('oneoff', 30, 90), startAge: 33, endAge: 90, amount: 2_000_000 },
          ],
        }),
        pessimisticAnalysis: analysisOf(),
        pessimisticReturn: 0.04,
      },
    })

    const text = wrapper.text()
    expect(text).toContain('33 岁资产耗尽（普通）')
    expect(text).not.toContain('90 岁总资产（普通）')
    expect(text).toContain('耗尽当年的资金缺口')
  })
})

describe('CashFlowItemRow', () => {
  function makeItem(overrides: Partial<CashFlowItem> = {}): CashFlowItem {
    return {
      id: 'row-item',
      name: '项',
      amount: 3_000,
      period: 'month',
      interval: 1,
      growth: 0.03,
      startAge: 30,
      endAge: 35,
      enabled: true,
      ...overrides,
    }
  }

  const mountRow = (overrides: Partial<CashFlowItem> = {}) =>
    mount(CashFlowItemRow, {
      props: {
        modelValue: makeItem(overrides),
        rangeStart: 30,
        rangeEnd: 90,
        type: 'expense' as const,
      },
    })

  it('每月发生的项显示发生频率与总次数', () => {
    // 默认 startAge 30 / endAge 35，每月 → 每年 12 次
    const text = mountRow({ period: 'month', interval: 1 }).text()
    expect(text).toContain('每 1 个月发生一次')
    expect(text).toContain('每年 12 次')
    expect(text).toContain('共约 72 次')
  })

  it('每 N 个月发生的项显示间隔与折合次数', () => {
    const text = mountRow({ period: 'month', interval: 2, startAge: 30, endAge: 35 }).text()
    expect(text).toContain('每 2 个月发生一次')
    expect(text).toContain('每年 6 次')
    expect(text).toContain('共约 36 次')
  })

  it('年周期项列出具体发生年份', () => {
    const text = mountRow({ period: 'year', interval: 10, startAge: 40, endAge: 90 }).text()
    expect(text).toContain('每 10 年发生一次：40 / 50 / 60 / 70 / 80 / 90')
    expect(text).toContain('共 6 次')
  })

  it('每 1 年的项列出全部年份', () => {
    expect(mountRow({ period: 'year', interval: 1 }).text()).toContain(
      '每 1 年发生一次：30 / 31 / 32 / 33 / 34 / 35',
    )
  })

  it('仅一次的项显示单点发生', () => {
    expect(mountRow({ period: 'once', startAge: 60, endAge: 90 }).text()).toContain(
      '仅在 60 岁发生一次',
    )
  })

  it('停用的项提示当期计为 0', () => {
    expect(mountRow({ enabled: false }).text()).toContain('已停用，当期计为 0')
  })

  // 不静默改写用户填的年龄（避免调大再调小全局年龄后原值丢失），而是把风险说出来
  it('超出模拟区间的项给出警告而不是静默改写', async () => {
    const wrapper = mountRow({ startAge: 91, endAge: 100 })
    expect(wrapper.text()).toContain('超出模拟区间（30~90 岁），不会发生')
    expect(wrapper.text()).not.toContain('每 1 个月发生一次')

    // 改回区间内后警告消失且发生提示恢复
    await wrapper.setProps({
      modelValue: makeItem({ startAge: 30, endAge: 90 }),
    })
    expect(wrapper.text()).not.toContain('超出模拟区间')
    expect(wrapper.text()).toContain('每 1 个月发生一次')
  })

  // 周期是 element-plus 的 el-select 直连模型（不是派生值 + change 回写）
  it('周期用 el-select 直连模型，仅一次时不显示间隔输入', async () => {
    const wrapper = mountRow({ period: 'year', interval: 10 })
    const select = wrapper.findComponent({ name: 'ElSelect' })
    expect(select.exists()).toBe(true)
    expect(select.props('modelValue')).toBe('year')
    expect(wrapper.findAll('.interval-num')).toHaveLength(1)

    await wrapper.setProps({ modelValue: makeItem({ period: 'once' }) })
    expect(wrapper.findComponent({ name: 'ElSelect' }).props('modelValue')).toBe('once')
    expect(wrapper.findAll('.interval-num')).toHaveLength(0)

    await wrapper.setProps({ modelValue: makeItem({ period: 'month', interval: 2 }) })
    expect(wrapper.findComponent({ name: 'ElSelect' }).props('modelValue')).toBe('month')
    expect(wrapper.findAll('.interval-num')).toHaveLength(1)
  })

  // 阅读顺序应为「每 [2] 个月」：间隔输入框在下拉框之前
  it('间隔输入框排在月/年下拉框前面', () => {
    const wrapper = mountRow({ period: 'month', interval: 2 })
    const interval = wrapper.find('.interval-num').element
    const select = wrapper.find('.period-select').element

    expect(
      interval.compareDocumentPosition(select) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(wrapper.text()).toContain('每')
  })
  // 曾出现「下拉框是裸的 / 显示空白」的反馈，这里把「显示当前周期」也钉住
  it('下拉框显示当前周期：月 / 年 / 仅一次', async () => {
    const wrapper = mountRow({ period: 'month', interval: 2 })
    await nextTick()
    expect(wrapper.find('.period-select').text()).toBe('月')

    await wrapper.setProps({ modelValue: makeItem({ period: 'year', interval: 10 }) })
    await nextTick()
    expect(wrapper.find('.period-select').text()).toBe('年')

    await wrapper.setProps({ modelValue: makeItem({ period: 'once' }) })
    await nextTick()
    expect(wrapper.find('.period-select').text()).toBe('仅一次')
    expect(wrapper.find('.period-select').exists()).toBe(true)
  })

  // 曾出现「周期下拉框在页面上看不到」的反馈：当时是固定宽度被 .field .el-input-number
  // 的 width:100% 覆盖，把下拉框顶出格子、被右侧字段的输入框盖住。
  // 宽度现在挂在普通 wrapper span 上，这里断言 wrapper 确实存在且里面就是那个控件。
  it('周期下拉框与间隔输入框各有自己的定宽 wrapper', async () => {
    const wrapper = mountRow({ period: 'month', interval: 2 })
    const intervalBox = wrapper.find('.interval-box')
    const periodBox = wrapper.find('.period-box')

    expect(intervalBox.exists()).toBe(true)
    expect(periodBox.exists()).toBe(true)
    expect(intervalBox.find('.el-input-number').exists()).toBe(true)
    expect(periodBox.find('.el-select').exists()).toBe(true)
    // 「每」在 wrapper 外面，避免被一起框成定宽
    expect(intervalBox.text()).not.toContain('每')

    await wrapper.setProps({ modelValue: makeItem({ period: 'once' }) })
    expect(wrapper.find('.interval-box').exists()).toBe(false)
    expect(wrapper.find('.period-box').exists()).toBe(true)
  })

  it('点开周期下拉框后月/年/仅一次三个选项都可见可选', async () => {
    const wrapper = mountRow({ period: 'month', interval: 2 })
    await nextTick()

    const trigger = wrapper.find('.period-select .el-select__wrapper')
    expect(trigger.exists()).toBe(true)
    await trigger.trigger('click')
    await nextTick()

    const input = wrapper.find('.period-select input[role="combobox"]')
    expect(input.attributes('aria-expanded')).toBe('true')

    // 选项是 teleport 到 body 的，只能从 document 上取
    const labels = [...document.querySelectorAll('.el-select-dropdown__item')].map((el) =>
      el.textContent?.trim(),
    )
    expect(labels).toContain('仅一次')
    expect(labels).toContain('月')
    expect(labels).toContain('年')
  })

  it('金额提示：周期项摊成年额，仅一次项看单次金额', () => {
    expect(mountRow({ amount: 3_000, period: 'month', interval: 1 }).text()).toContain(
      '年额约 36,000 元',
    )
    expect(mountRow({ amount: 3_000, period: 'month', interval: 2 }).text()).toContain(
      '年额约 18,000 元',
    )
    expect(mountRow({ amount: 75_000, period: 'year', interval: 10 }).text()).toContain(
      '年额约 7,500 元',
    )
    expect(mountRow({ amount: 200_000, period: 'once' }).text()).toContain('单次 200,000 元')
  })
})

describe('ParameterPanel', () => {
  /** el-input 把值放在 DOM value 属性上，wrapper.text() 看不到，只能读 element.value */
  const inputValues = (wrapper: ReturnType<typeof mount>, selector: string) =>
    wrapper.findAll(`${selector} input`).map((w) => (w.element as HTMLInputElement).value)

  it('渲染默认收支项与四张卡片', () => {
    const wrapper = mount(ParameterPanel, {
      props: { modelValue: { ...DEFAULT_PARAMS } },
    })
    const text = wrapper.text()

    expect(text).toContain('基础信息')
    expect(text).toContain('收入项')
    expect(text).toContain('支出项')
    expect(text).toContain('投资收益')
    // 默认项：工资 / 生活费 / 换车
    expect(inputValues(wrapper, '.name-input')).toEqual(['工资', '生活费', '换车'])
    // 发生口径在提示行里可见（工资 每月、生活费 每月、换车 每 10 年）
    expect(text).toContain('每年 12 次')
    expect(text).toContain('每 10 年发生一次：40 / 50 / 60 / 70 / 80 / 90')
    // 三档收益率
    expect(text).toContain('普通收益率')
    expect(text).toContain('乐观收益率')
    expect(text).toContain('悲观收益率')
    // 旧的「启用开关」卡片已被每项自带开关取代
    expect(text).not.toContain('盈亏项启用 / 停用')
  })

  it('收入与支出项各自渲染在对应列表里', async () => {
    const wrapper = mount(ParameterPanel, {
      props: {
        modelValue: {
          ...DEFAULT_PARAMS,
          incomes: [createItem('salary', 30, 90)],
          expenses: [createItem('living', 30, 90), createItem('oneoff', 30, 90)],
        },
      },
    })

    expect(inputValues(wrapper, '.name-input')).toEqual(['工资', '生活费', '大病/意外'])

    // 删除中间一项后，名称与提示都不再错位（v-for 以 item.id 为 key）
    const newExpenses = [{ ...createItem('living', 30, 90), name: '只剩生活费' }]
    await wrapper.setProps({ modelValue: { ...DEFAULT_PARAMS, expenses: newExpenses } })
    expect(inputValues(wrapper, '.name-input')).toEqual(['工资', '只剩生活费'])
  })

  it('空列表给出提示', () => {
    const wrapper = mount(ParameterPanel, {
      props: { modelValue: { ...DEFAULT_PARAMS, incomes: [], expenses: [] } },
    })
    expect(wrapper.text()).toContain('未设置任何收入')
    expect(wrapper.text()).toContain('未设置任何支出')
  })
})

describe('DetailTable 情景切换', () => {
  /**
   * 「悬崖」配置：普通 6% 能躺平，悲观 4% 在 78 岁耗尽，且 78 不在
   * 「从 30 岁起每 5 年」的抽样网格上（30/35/…/75/80）。
   *
   * 这正是用户报过的观感矛盾：普通情景 77 岁还有几百万，悲观情景 78 岁就耗尽。
   * 两个数字属于不同收益率情景，不是「一年花掉几百万」。
   */
  function cliffParams(): SimParams {
    const params = cloneParams(DEFAULT_PARAMS)
    params.initialPrincipal = 600_000
    params.annualReturn = 0.06
    params.pessimisticReturn = 0.04
    params.incomes = [{ ...createItem('salary', 30, 90), amount: 2500, endAge: 55 }]
    params.expenses = [
      { ...createItem('living', 30, 90), amount: 2500 },
      createItem('car', 30, 90),
    ]
    return params
  }

  function mountTable(params: SimParams) {
    return mount(DetailTable, {
      props: {
        rows: simulate(params),
        optimisticRows: simulateScenario(params, params.optimisticReturn),
        pessimisticRows: simulateScenario(params, params.pessimisticReturn),
        params,
      },
    })
  }

  it('默认显示普通情景，并把收益率写进标签与汇总', () => {
    const params = cliffParams()
    const wrapper = mountTable(params)

    expect(wrapper.text()).toContain('乐观 10%')
    expect(wrapper.text()).toContain('普通 6%')
    expect(wrapper.text()).toContain('悲观 4%')
    expect(wrapper.text()).toContain('普通情景：90 岁年末本金')
    // 普通情景不破产，所以不该出现耗尽文案
    expect(wrapper.text()).not.toContain('资产耗尽')
  })

  it('切到悲观情景：汇总、耗尽提示与该行同步更新（断点年份不在 5 年网格上也要显示）', async () => {
    const params = cliffParams()
    const wrapper = mountTable(params)

    // 悲观情景确实在 78 岁耗尽（前提校验，避免测试因参数漂移而失效）
    const pessimistic = simulateScenario(params, params.pessimisticReturn)
    expect(pessimistic[pessimistic.length - 1].age).toBe(78)
    expect(pessimistic[pessimistic.length - 1].endPrincipal).toBeLessThan(0)

    const radios = wrapper.findAll('input[type="radio"]')
    expect(radios).toHaveLength(3)
    await radios[2].setValue()

    expect(wrapper.text()).toContain('悲观情景：78 岁资产耗尽')
    expect(wrapper.text()).toContain('在 78 岁耗尽')
    // 78 不在抽样网格上，但作为耗尽年必须补进表里
    expect(wrapper.text()).toContain('耗尽年')
    expect(wrapper.text()).toContain('78')
  })

  it('切回普通情景后耗尽提示消失', async () => {
    const wrapper = mountTable(cliffParams())

    const radios = wrapper.findAll('input[type="radio"]')
    await radios[2].setValue()
    expect(wrapper.text()).toContain('资产耗尽')

    await radios[1].setValue()
    expect(wrapper.text()).not.toContain('资产耗尽')
    expect(wrapper.text()).toContain('普通情景：90 岁年末本金')
  })

  it('未传三情景数据时退化为单情景（向后兼容）', () => {
    const params = cliffParams()
    const wrapper = mount(DetailTable, { props: { rows: simulate(params), params } })

    expect(wrapper.text()).toContain('普通情景')
    expect(wrapper.findAll('input[type="radio"]')).toHaveLength(0)
  })
})

describe('App 结论横幅', () => {
  // 默认参数下，普通情景（8%）能躺平、悲观情景（4%）会破产 → 黄色风险横幅
  it('默认参数下渲染黄色风险横幅', () => {
    const wrapper = mount(App, {
      global: {
        stubs: {
          ElAlert: true,
          ParameterPanel: true,
          StressTest: true,
          CashFlowChart: true,
          StatCards: true,
          DetailTable: true,
        },
      },
    })

    const html = wrapper.html()
    expect(html).toContain('普通情景可躺平')
    expect(html).toContain('type="warning"')

    // 卸载以取消 App 里去抖的持久化计时器，避免测试结束后才触发副作用
    wrapper.unmount()
  })
})

describe('SnapshotPanel', () => {
  // el-drawer 默认 teleport 到 body，直接把插槽摊平到原地更好断言
  const drawerStub = { template: '<div><slot /></div>' }

  function mountPanel(overrides: Partial<SimParams> = {}) {
    return mount(SnapshotPanel, {
      props: {
        open: true,
        params: { ...cloneParams(DEFAULT_PARAMS), ...overrides },
        mc: { ...DEFAULT_MC_CONFIG },
      },
      global: { stubs: { ElDrawer: drawerStub } },
    })
  }

  afterEach(() => {
    localStorage.clear()
  })

  it('没有快照时显示空态提示', () => {
    const wrapper = mountPanel()
    expect(wrapper.text()).toContain('还没有快照')
    expect(wrapper.findAll('button').some((b) => b.text() === '载入')).toBe(false)
  })

  it('列表里的结论是按快照参数实时算出来的，不是存下来的', () => {
    writeSnapshots([
      createSnapshot(DEFAULT_PARAMS, DEFAULT_MC_CONFIG, '默认方案'), // 悲观 4% → 65 岁耗尽
      createSnapshot(
        { ...cloneParams(DEFAULT_PARAMS), pessimisticReturn: 0.1 },
        DEFAULT_MC_CONFIG,
        '悲观也乐观',
      ),
    ])

    const wrapper = mountPanel()
    const text = wrapper.text()

    expect(text).toContain('默认方案')
    expect(text).toContain('悲观情景 65 岁耗尽')
    expect(text).toContain('悲观也乐观')
    expect(text).toContain('悲观情景也能躺平')
    // 普通情景终值取自 analyze(simulate(params))，与别处口径一致
    const expected = analyze(simulate(DEFAULT_PARAMS), DEFAULT_PARAMS).finalBalance
    expect(text).toContain(formatWan(expected))
  })

  it('点「载入」把整条快照 emit 给父层，并关闭抽屉', async () => {
    writeSnapshots([createSnapshot(DEFAULT_PARAMS, DEFAULT_MC_CONFIG, '待载入')])
    const wrapper = mountPanel()

    const loadButton = wrapper.findAll('button').find((b) => b.text() === '载入')!
    await loadButton.trigger('click')

    expect(wrapper.emitted('load')?.[0]?.[0]).toMatchObject({ name: '待载入' })
    expect(wrapper.emitted('update:open')?.[0]).toEqual([false])
  })

  // 需求：快照创建后即只读。删掉「重命名」后，行内不应该再有任何可写控件，
  // 也不应该有第二个能改到快照的入口。
  it('每行只有「载入 / 删除」，没有任何可编辑控件，并写明只读', () => {
    writeSnapshots([createSnapshot(DEFAULT_PARAMS, DEFAULT_MC_CONFIG, '只读记录')])
    const wrapper = mountPanel()

    const row = wrapper.find('.snap-item')
    expect(row.findAll('input')).toHaveLength(0)
    expect(row.findAll('button').map((b) => b.text())).toEqual(['载入', '删除'])
    expect(wrapper.text()).toContain('只读记录')
  })

  // 行内的数字必须来自快照里那一套参数，而不是当前正在编辑的 props.params，
  // 否则「只看不动」的语义就不成立（当前参数一改，历史记录的结论也跟着变）。
  it('行内结论取自快照记录，不随当前编辑参数变化', () => {
    writeSnapshots([createSnapshot(DEFAULT_PARAMS, DEFAULT_MC_CONFIG, '存档')]) // 悲观 4% → 65 岁耗尽
    const wrapper = mountPanel({ pessimisticReturn: 0.1 }) // 当前在编辑的这套：悲观 10% 能躺平

    expect(wrapper.text()).toContain('悲观情景 65 岁耗尽')
    expect(wrapper.text()).not.toContain('悲观情景也能躺平')
    expect(wrapper.text()).toContain(formatWan(analyze(simulate(DEFAULT_PARAMS), DEFAULT_PARAMS).finalBalance))
  })
})

describe('App 快照', () => {
  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
  })

  beforeEach(() => {
    // 地址栏优先级高于本地存储：前面用例里的 App 可能已经把参数写进 hash，
    // 不清掉会盖住下面的种子数据。
    window.history.replaceState(null, '', '/')
  })

  function mountApp() {
    return mount(App, {
      global: {
        stubs: {
          ElAlert: true,
          ElDrawer: { template: '<div><slot /></div>' },
          ParameterPanel: true,
          StressTest: true,
          CashFlowChart: true,
          StatCards: true,
          DetailTable: true,
        },
      },
    })
  }

  type AppWrapper = ReturnType<typeof mountApp>

  /** 表头那个固定文案的「管理快照」按钮 */
  function snapshotButton(wrapper: AppWrapper) {
    return wrapper.findAll('button').find((b) => b.text() === '管理快照')
  }

  /** 表头快照名标签；未命中任何快照时不渲染 */
  function snapshotTag(wrapper: AppWrapper) {
    return wrapper.find('.snap-tag')
  }

  // 快照只存参数，所以「载入」必须真的把参数换成快照里的那一套，
  // 并走原有的持久化链路写回本地（否则刷新就回到旧参数了）。
  it('载入快照会覆盖当前参数，并写回本地', async () => {
    const params = cloneParams(DEFAULT_PARAMS)
    params.initialPrincipal = 4_000_000
    params.annualReturn = 0.1
    writeSnapshots([createSnapshot(params, DEFAULT_MC_CONFIG, '高收益高本金')])

    vi.useFakeTimers()
    const wrapper = mountApp()

    expect(readStateFromStorage()?.params.initialPrincipal).not.toBe(4_000_000)
    // 当前是默认参数，没命中任何快照
    expect(snapshotTag(wrapper).exists()).toBe(false)
    expect(snapshotButton(wrapper)?.text()).toBe('管理快照')

    const loadButton = wrapper.findAll('button').find((b) => b.text() === '载入')!
    await loadButton.trigger('click')
    await nextTick()

    // 参数已换成快照里的那套；去抖 200ms 后才落盘
    await vi.advanceTimersByTimeAsync(300)
    const persisted = readStateFromStorage()
    expect(persisted?.params.initialPrincipal).toBe(4_000_000)
    expect(persisted?.params.annualReturn).toBe(0.1)
    // 载入之后表头就该写出「现在就是这条快照」
    expect(snapshotTag(wrapper).text()).toBe('高收益高本金')

    wrapper.unmount()
  })

  // 回归：真实浏览器上踩到过——项 id 是每次页面加载新生成的随机值，
  // 只要 id 混进指纹，刷新一下（参数从本地存储读回、id 与快照里那套不同）
  // 名字就没了。
  it('刷新后（参数来自本地存储）依然认得出当前属于哪条快照', () => {
    const params = cloneParams(DEFAULT_PARAMS)
    params.initialPrincipal = 4_000_000
    writeSnapshots([createSnapshot(params, DEFAULT_MC_CONFIG, '高本金')])
    // 模拟下次页面加载：同样的参数，另一套项 id
    const reloaded = cloneParams(params)
    reloaded.incomes = reloaded.incomes.map((item) => ({ ...item, id: 'reload-income-1' }))
    writeStateToStorage({
      version: STATE_VERSION,
      params: reloaded,
      mc: { ...DEFAULT_MC_CONFIG },
    })

    const wrapper = mountApp()
    expect(snapshotTag(wrapper).text()).toBe('高本金')

    wrapper.unmount()
  })

  // 参数一旦偏离快照，名字就该消失（按钮文案始终不变）
  it('当前参数与任何快照都不同时不显示名字', () => {
    const params = cloneParams(DEFAULT_PARAMS)
    writeSnapshots([createSnapshot(params, DEFAULT_MC_CONFIG, '存档')])
    const drifted = cloneParams(params)
    drifted.annualReturn = 0.09
    writeStateToStorage({
      version: STATE_VERSION,
      params: drifted,
      mc: { ...DEFAULT_MC_CONFIG },
    })

    const wrapper = mountApp()
    expect(snapshotTag(wrapper).exists()).toBe(false)
    expect(snapshotButton(wrapper)?.text()).toBe('管理快照')

    wrapper.unmount()
  })
})
