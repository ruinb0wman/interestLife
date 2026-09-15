// @vitest-environment happy-dom
//
// 回归守卫：ECharts 漏注册图表类型或组件时**不会抛错**，只会打印
// “Component xxx is used but not imported.” / “Series xxx is used but not imported.”
// 然后静默不渲染。这个测试用真实注册表（src/chart-setup.ts）＋真实配置
// （src/chart-option.ts）渲染一次，把这些告警变成失败。
//
// 用 SVGRenderer 而非 CanvasRenderer：happy-dom 没有 canvas 2D 上下文，
// 渲染器差异不影响「系列/组件是否注册」这一被验证的性质。
import { describe, expect, it, vi } from 'vitest'
import { SVGRenderer } from 'echarts/renderers'
import { buildChartOption } from './chart-option'
import { echarts } from './chart-setup'
import { DEFAULT_PARAMS, simulate, simulateScenario } from './lib'

echarts.use([SVGRenderer])

function renderAndCollectMessages(): string[] {
  const messages: string[] = []
  const capture = (...args: unknown[]) => {
    messages.push(args.map((a) => String(a)).join(' '))
  }
  const warn = vi.spyOn(console, 'warn').mockImplementation(capture)
  const error = vi.spyOn(console, 'error').mockImplementation(capture)

  const host = document.createElement('div')
  document.body.appendChild(host)

  try {
    const params = { ...DEFAULT_PARAMS }
    const chart = echarts.init(host, null, { renderer: 'svg', width: 900, height: 420 })
    chart.setOption(
      buildChartOption({
        rows: simulate(params),
        optimisticRows: simulateScenario(params, params.optimisticReturn),
        pessimisticRows: simulateScenario(params, params.pessimisticReturn),
      }),
    )
    chart.dispose()
  } finally {
    warn.mockRestore()
    error.mockRestore()
    host.remove()
  }

  return messages
}

describe('图表渲染所需的 echarts 注册', () => {
  it('没有 “used but not imported” 告警', () => {
    const messages = renderAndCollectMessages()
    const missing = messages.filter((m) => /used but not imported/.test(m))
    expect(missing).toEqual([])
  })

  it('能成功建出系列：line / bar / scatter 都被真正渲染', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const params = { ...DEFAULT_PARAMS }

    const chart = echarts.init(host, null, { renderer: 'svg', width: 900, height: 420 })
    chart.setOption(
      buildChartOption({
        rows: simulate(params),
        optimisticRows: simulateScenario(params, params.optimisticReturn),
        pessimisticRows: simulateScenario(params, params.pessimisticReturn),
      }),
    )

    const option = chart.getOption() as { series?: Array<{ type?: string }> }
    expect(option.series?.length).toBeGreaterThan(0)
    expect(new Set(option.series?.map((s) => s.type))).toEqual(
      new Set(['line', 'bar', 'scatter']),
    )

    chart.dispose()
    host.remove()
  })
})
