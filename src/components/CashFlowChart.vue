<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { buildChartOption } from '../chart-option'
import { echarts } from '../chart-setup'
import { EXPORT_PIXEL_RATIO } from '../export-image'
import type { YearRow } from '../lib'

const props = defineProps<{
  rows: YearRow[]
  optimisticRows?: YearRow[]
  pessimisticRows?: YearRow[]
}>()

const el = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null

function render() {
  if (!chart) return
  chart.setOption(buildChartOption(props))
}

function handleResize() {
  chart?.resize()
}

/**
 * 导出用：给 App 的「导出图片」按钮拿一张 2x PNG。
 * 显式给底色——图表 canvas 默认透明，深色曲线贴到白底聊天窗口里就看不清了。
 */
function toPngDataUrl(): string | null {
  return (
    chart?.getDataURL({
      type: 'png',
      pixelRatio: EXPORT_PIXEL_RATIO,
      // 与页面里图表卡片同一个 --panel 底色：canvas 默认透明，深色曲线贴到白底
      // 聊天窗口里就看不清了；也别用页面背景色，否则和导出的页脚差一档、接缝可见
      backgroundColor: '#202127',
    }) ?? null
  )
}

defineExpose({ toPngDataUrl })

// ResizeObserver 比 window.resize 可靠：容器自身尺寸变化（侧栏折叠、
// 响应式布局切换）也会触发，而 window.resize 只有窗口尺寸变化才触发。
let observer: ResizeObserver | null = null

onMounted(() => {
  chart = echarts.init(el.value!)
  render()

  if (typeof ResizeObserver !== 'undefined' && el.value) {
    observer = new ResizeObserver(handleResize)
    observer.observe(el.value)
  } else {
    window.addEventListener('resize', handleResize)
  }
})

watch(
  () => [props.rows, props.optimisticRows, props.pessimisticRows],
  render,
)

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chart = null
})
</script>

<template>
  <div class="chart-wrap">
    <div ref="el" class="chart" />
  </div>
</template>

<style scoped>
.chart-wrap {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: 16px;
}
.chart {
  width: 100%;
  height: 420px;
}
</style>
