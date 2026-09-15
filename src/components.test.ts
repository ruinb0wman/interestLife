// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import App from './App.vue'
import StatCards from './components/StatCards.vue'
import { analyze, DEFAULT_PARAMS, simulate, type Analysis, type SimParams } from './lib'

function analysisOf(overrides: Partial<SimParams> = {}): Analysis {
  const params: SimParams = { ...DEFAULT_PARAMS, ...overrides }
  return analyze(simulate(params), params)
}

describe('StatCards', () => {
  // 回归：cards 曾是 setup 阶段求值的普通数组，label / hint 里的模板字符串被永久固化，
  // 改参数后卡片标题（如「51 岁（停薪后）」）不会更新。
  it('analysis 变化后卡片标题同步更新', async () => {
    const wrapper = mount(StatCards, {
      props: {
        analysis: analysisOf({ salaryStopAge: 50 }),
        pessimisticBalance: 1,
        pessimisticReturn: 0.04,
      },
    })
    expect(wrapper.text()).toContain('51 岁（停薪后）')

    await wrapper.setProps({ analysis: analysisOf({ salaryStopAge: 45 }) })

    expect(wrapper.text()).toContain('46 岁（停薪后）')
    expect(wrapper.text()).not.toContain('51 岁（停薪后）')
  })

  it('最低本金卡片提示里的年龄与区间同步更新', async () => {
    const wrapper = mount(StatCards, {
      props: {
        analysis: analysisOf({ targetAge: 90 }),
        pessimisticBalance: 1,
        pessimisticReturn: 0.04,
      },
    })
    expect(wrapper.text()).toContain('60 年内最低点')

    await wrapper.setProps({ analysis: analysisOf({ targetAge: 100 }) })
    expect(wrapper.text()).toContain('70 年内最低点')
    expect(wrapper.text()).not.toContain('60 年内最低点')
  })
})

describe('App 结论横幅', () => {
  // 默认参数下，中性情景（8%）能躺平、悲观情景（4%）会破产 → 黄色风险横幅
  it('默认参数下渲染黄色风险横幅', () => {
    const wrapper = mount(App, {
      global: {
        stubs: {
          ParameterPanel: true,
          StressTest: true,
          CashFlowChart: true,
          StatCards: true,
          DetailTable: true,
        },
      },
    })

    const html = wrapper.html()
    expect(html).toContain('中性可躺平')
    expect(html).toContain('type="warning"')
  })
})
