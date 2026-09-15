// ECharts 按需注册：只引入用到的图表与组件，避免整个 echarts 进 bundle
// （全量引入约 1MB，按需后只剩零头）。
//
// ⚠️ 漏注册不会报错，只会在运行时静默不渲染，因此：
//   1. 新增图表类型 / 组件时必须在这里补注册；
//   2. src/chart-render.test.ts 会用真实注册表渲染一次并断言没有
//      “used but not imported” 告警，作为回归守卫。
//
// 当前的传递依赖（已用真实渲染逐项实测，echarts 6.1）：
//   TooltipComponent  → use(installAxisPointer)
//   图表 install       → 自带 cartesian2d / xAxis / yAxis / grid（实测：仅注册
//                        Line/Bar/Scatter 而不注册 GridComponent，grid 与 xAxis 依然存在）
//   因此下面的 GridComponent 对当前配置而言是冗余的，列出来是为了显式表意、
//   并在以后只用纯图表类型/只改系列组合时提供保护，不要以为它没用而删掉。
//   CanvasRenderer    → 画布渲染器（测试环境用 SVGRenderer 替代，见 chart-render.test.ts）
import * as echarts from 'echarts/core'
import { BarChart, LineChart, ScatterChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { BarSeriesOption, LineSeriesOption, ScatterSeriesOption } from 'echarts/charts'
import type {
  GridComponentOption,
  LegendComponentOption,
  MarkLineComponentOption,
  TooltipComponentOption,
} from 'echarts/components'

echarts.use([
  LineChart,
  BarChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  CanvasRenderer,
])

export { echarts }

/** 现金流图用到的全部图表/组件选项类型 */
export type ChartOption = echarts.ComposeOption<
  | LineSeriesOption
  | BarSeriesOption
  | ScatterSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | LegendComponentOption
  | MarkLineComponentOption
>

export type { BarSeriesOption, LineSeriesOption, ScatterSeriesOption }
