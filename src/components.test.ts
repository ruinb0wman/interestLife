// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import App from './App.vue'
import CashFlowItemRow from './components/CashFlowItemRow.vue'
import ParameterPanel from './components/ParameterPanel.vue'
import StatCards from './components/StatCards.vue'
import {
  analyze,
  createItem,
  DEFAULT_PARAMS,
  simulate,
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
