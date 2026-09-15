<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { buildChartOption } from '../chart-option'
import { echarts } from '../chart-setup'
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
