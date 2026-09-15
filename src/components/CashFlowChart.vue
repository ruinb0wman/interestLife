<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import type { YearRow } from '../lib'
import { formatWanShort } from '../format'

const props = defineProps<{
  rows: YearRow[]
  optimisticRows?: YearRow[]
  pessimisticRows?: YearRow[]
}>()

const el = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null

function buildOption(rows: YearRow[]): echarts.EChartsOption {
  const optimisticRows = props.optimisticRows ?? rows
  const pessimisticRows = props.pessimisticRows ?? rows
  const startAge = rows[0]?.age ?? 0

  // 破产截断后三个情景的年份长度不再相同：统一按最长情景铺时间轴，
  // 较短的情景用 null 补齐，这样每条曲线在各自耗尽的那一年自然断开。
  const length = Math.max(rows.length, optimisticRows.length, pessimisticRows.length)
  const ages = Array.from({ length }, (_, i) => startAge + i)
  const pick = (list: YearRow[], key: keyof YearRow) =>
    Array.from({ length }, (_, i) => (list[i] ? (list[i][key] as number) : null))

  const main = pick(rows, 'endPrincipal')
  const optimistic = pick(optimisticRows, 'endPrincipal')
  const pessimistic = pick(pessimisticRows, 'endPrincipal')
  const salaries = pick(rows, 'salary')
  const extraIncomes = pick(rows, 'extraIncome')
  const livings = pick(rows, 'living')
  const medicals = pick(rows, 'medical')
  const oneOffs = pick(rows, 'oneOff')

  // 耗尽点：每个情景最后一个被模拟到的年份（年末本金为负即已耗尽）
  const depletedPoints: Array<[number, number]> = []
  for (const list of [rows, optimisticRows, pessimisticRows]) {
    const last = list[list.length - 1]
    if (last && last.endPrincipal < 0) depletedPoints.push([last.age, 0])
  }

  return {
    color: ['#a8b1ff', '#3dd68c', '#f9b44e'],
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      backgroundColor: 'rgba(32,33,39,0.96)',
      borderColor: '#3c3f44',
      textStyle: { color: '#dfdfd6' },
      formatter(params: unknown) {
        const list = params as Array<{
          seriesName: string
          value: number | number[] | null
          axisValue: string
        }>
        const lines = list
          .filter((p) => typeof p.value === 'number' && p.value !== 0)
          .map((p) => `${p.seriesName}：${formatWanShort(p.value as number)} 元`)
        const head = `年龄 ${list[0]?.axisValue} 岁`
        return lines.length === 0 ? head : `${head}<br/>${lines.join('<br/>')}`
      },
    },
    legend: {
      top: 0,
      type: 'scroll',
      textStyle: { color: '#98989f' },
      data: [
        '本金·乐观',
        '本金·中性',
        '本金·悲观',
        '耗尽点',
        '年度工资',
        '年度生活费',
        '年度医疗',
        '零工收入',
        '一次性支出',
      ],
    },
    grid: { left: 80, right: 80, top: 46, bottom: 30 },
    xAxis: {
      type: 'category',
      data: ages,
      name: '年龄（岁）',
      nameLocation: 'middle',
      nameGap: 28,
      nameTextStyle: { color: '#98989f' },
      axisLine: { lineStyle: { color: '#3c3f44' } },
      axisLabel: {
        color: '#98989f',
        interval: Math.max(1, Math.round(ages.length / 15)),
      },
    },
    yAxis: [
      {
        type: 'value',
        name: '本金（元）',
        nameTextStyle: { color: '#98989f' },
        axisLabel: { color: '#98989f', formatter: (v: number) => formatWanShort(v) },
        axisLine: { lineStyle: { color: '#3c3f44' } },
        splitLine: { lineStyle: { color: '#2e2e32' } },
      },
      {
        type: 'value',
        name: '年度收支（元）',
        nameTextStyle: { color: '#98989f' },
        axisLabel: { color: '#98989f', formatter: (v: number) => formatWanShort(v) },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: '本金·乐观',
        type: 'line',
        data: optimistic,
        symbol: 'none',
        lineStyle: { width: 1.5, type: 'dashed', color: '#3dd68c' },
      },
      {
        name: '本金·中性',
        type: 'line',
        data: main,
        symbol: 'none',
        lineStyle: { width: 2.5, color: '#a8b1ff' },
        areaStyle: { color: 'rgba(168, 177, 255, 0.10)' },
        markLine: {
          symbol: 'none',
          silent: true,
          label: { show: false },
          lineStyle: { color: '#f66f81', type: 'dashed', width: 1 },
          data: [{ yAxis: 0 }],
        },
      },
      {
        name: '本金·悲观',
        type: 'line',
        data: pessimistic,
        symbol: 'none',
        lineStyle: { width: 1.5, type: 'dashed', color: '#f9b44e' },
      },
      {
        name: '耗尽点',
        type: 'scatter',
        data: depletedPoints,
        symbolSize: 9,
        itemStyle: { color: '#f66f81', borderColor: '#1b1b1f', borderWidth: 2 },
        yAxisIndex: 0,
        z: 5,
      },
      {
        name: '年度工资',
        type: 'line',
        data: salaries,
        symbol: 'none',
        lineStyle: { width: 1.5, type: 'dashed', color: '#38bdf8' },
        yAxisIndex: 1,
      },
      {
        name: '年度生活费',
        type: 'line',
        data: livings,
        symbol: 'none',
        lineStyle: { width: 1.5, type: 'dashed', color: '#c8abfa' },
        yAxisIndex: 1,
      },
      {
        name: '年度医疗',
        type: 'line',
        data: medicals,
        symbol: 'none',
        lineStyle: { width: 1.5, type: 'dashed', color: '#fb923c' },
        yAxisIndex: 1,
      },
      {
        name: '零工收入',
        type: 'line',
        data: extraIncomes,
        symbol: 'none',
        lineStyle: { width: 1.5, type: 'dashed', color: '#f0abfc' },
        yAxisIndex: 1,
      },
      {
        name: '一次性支出',
        type: 'bar',
        data: oneOffs,
        itemStyle: { color: '#6a6a71' },
        yAxisIndex: 1,
        barMaxWidth: 12,
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

watch(
  () => [props.rows, props.optimisticRows, props.pessimisticRows],
  render,
)

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
