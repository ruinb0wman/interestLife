<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import type { YearRow } from '../lib'
import { formatWanShort } from '../format'

const props = defineProps<{ rows: YearRow[] }>()

const el = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null

function buildOption(rows: YearRow[]): echarts.EChartsOption {
  const ages = rows.map((r) => r.age)
  const principals = rows.map((r) => r.endPrincipal)
  const negative = rows.map((r) => (r.endPrincipal < 0 ? r.endPrincipal : null))
  const salaries = rows.map((r) => r.salary)
  const livings = rows.map((r) => r.living)

  return {
    color: ['#2563eb', '#10b981', '#f59e0b'],
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      formatter(params: unknown) {
        const list = params as Array<{
          seriesName: string
          value: number | null
          axisValue: string
        }>
        const lines = list
          .filter((p) => p.value !== null && p.value !== undefined)
          .map((p) => `${p.seriesName}：${formatWanShort(p.value as number)} 元`)
        return `年龄 ${list[0]?.axisValue} 岁<br/>${lines.join('<br/>')}`
      },
    },
    legend: {
      top: 0,
      data: ['年末本金', '破产区间', '年度工资', '年度生活费'],
    },
    grid: { left: 80, right: 80, top: 40, bottom: 30 },
    xAxis: {
      type: 'category',
      data: ages,
      name: '年龄（岁）',
      nameLocation: 'middle',
      nameGap: 28,
      axisLabel: { interval: Math.max(1, Math.round(ages.length / 15)) },
    },
    yAxis: [
      {
        type: 'value',
        name: '本金（元）',
        axisLabel: { formatter: (v: number) => formatWanShort(v) },
        splitLine: { lineStyle: { color: '#eef2f7' } },
      },
      {
        type: 'value',
        name: '年度收支（元）',
        axisLabel: { formatter: (v: number) => formatWanShort(v) },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: '年末本金',
        type: 'line',
        data: principals,
        symbol: 'none',
        lineStyle: { width: 2.5 },
        areaStyle: { color: 'rgba(37, 99, 235, 0.08)' },
        markLine: {
          symbol: 'none',
          silent: true,
          label: { show: false },
          lineStyle: { color: '#ef4444', type: 'dashed', width: 1 },
          data: [{ yAxis: 0 }],
        },
      },
      {
        name: '破产区间',
        type: 'line',
        data: negative,
        symbol: 'none',
        lineStyle: { width: 2, color: '#ef4444' },
        areaStyle: { color: 'rgba(239, 68, 68, 0.35)' },
        yAxisIndex: 0,
      },
      {
        name: '年度工资',
        type: 'line',
        data: salaries,
        symbol: 'none',
        lineStyle: { width: 1.5, type: 'dashed' },
        yAxisIndex: 1,
      },
      {
        name: '年度生活费',
        type: 'line',
        data: livings,
        symbol: 'none',
        lineStyle: { width: 1.5, type: 'dashed' },
        yAxisIndex: 1,
      },
    ],
  }
}

function render() {
  if (!chart) return
  chart.setOption(buildOption(props.rows))
}

function handleResize() {
  chart?.resize()
}

onMounted(() => {
  chart = echarts.init(el.value!)
  render()
  window.addEventListener('resize', handleResize)
})

watch(() => props.rows, render)

onBeforeUnmount(() => {
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
  background: #fff;
  border: 1px solid #e4e9f2;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(30, 64, 175, 0.06);
  padding: 16px;
}
.chart {
  width: 100%;
  height: 420px;
}
</style>
