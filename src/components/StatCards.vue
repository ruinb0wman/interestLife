<script setup lang="ts">
import type { Analysis } from '../lib'
import { formatPercent, formatWan, formatYuan } from '../format'

const props = defineProps<{
  analysis: Analysis
  pessimisticBalance: number
  pessimisticReturn: number
}>()

const span = () => props.analysis.targetAge - props.analysis.startAge

const cards = [
  {
    label: `${props.analysis.targetAge} 岁总资产（中性）`,
    value: () => props.analysis.finalBalance,
    hint: '模拟结束时的全部身家',
  },
  {
    label: `悲观情景总资产（${formatPercent(props.pessimisticReturn)}）`,
    value: () => props.pessimisticBalance,
    hint: '最坏情景下的剩余身家',
  },
  {
    label: `${props.analysis.firstCarAge} 岁（第一次换车后）`,
    value: () => props.analysis.afterFirstCar,
    hint: '首次换车节点',
  },
  {
    label: `${props.analysis.salaryStopAge + 1} 岁（停薪后）`,
    value: () => props.analysis.afterSalaryStop,
    hint: '工资停发后的节点',
  },
  {
    label: '最低本金',
    value: () => props.analysis.minBalance,
    hint: `${props.analysis.minBalanceAge} 岁时为 ${span()} 年内最低点`,
  },
]
</script>

<template>
  <div class="stats">
    <div
      v-for="c in cards"
      :key="c.label"
      class="stat-card"
      :class="c.value() >= 0 ? 'positive' : 'negative'"
    >
      <div class="stat-label">{{ c.label }}</div>
      <div class="stat-value">{{ formatWan(c.value()) }}</div>
      <div class="stat-sub">
        {{ formatYuan(c.value()) }}
        <span class="stat-hint">· {{ c.hint }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}
.stat-card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px 18px;
  box-shadow: var(--shadow-md);
}
.stat-card.positive {
  border-left: 4px solid var(--green);
}
.stat-card.negative {
  border-left: 4px solid var(--red);
}
.stat-label {
  font-size: 13px;
  color: var(--text-2);
}
.stat-value {
  font-size: 22px;
  font-weight: 700;
  margin: 4px 0;
  font-variant-numeric: tabular-nums;
}
.positive .stat-value {
  color: var(--green);
}
.negative .stat-value {
  color: var(--red);
}
.stat-sub {
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.stat-hint {
  color: var(--text-3);
  opacity: 0.75;
}
</style>
