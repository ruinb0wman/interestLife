<script setup lang="ts">
import type { Analysis } from '../lib'
import { formatWan, formatYuan } from '../format'

const props = defineProps<{ analysis: Analysis }>()

const cards = [
  { label: '92 岁总资产', value: () => props.analysis.age92, hint: '模拟结束时的全部身家' },
  { label: '42 岁（第一次换车后）', value: () => props.analysis.age42, hint: '首次换车节点' },
  { label: '52 岁（停薪 + 换车后）', value: () => props.analysis.age52, hint: '工资停发节点' },
  { label: '最低本金', value: () => props.analysis.minBalance, hint: `${props.analysis.minBalanceAge} 岁时为 60 年最低点` },
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
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.stat-card {
  background: #fff;
  border: 1px solid #e4e9f2;
  border-radius: 12px;
  padding: 16px 18px;
  box-shadow: 0 1px 3px rgba(30, 64, 175, 0.06);
}
.stat-card.positive {
  border-left: 4px solid #10b981;
}
.stat-card.negative {
  border-left: 4px solid #ef4444;
}
.stat-label {
  font-size: 13px;
  color: #64748b;
}
.stat-value {
  font-size: 22px;
  font-weight: 700;
  margin: 4px 0;
  font-variant-numeric: tabular-nums;
}
.positive .stat-value {
  color: #059669;
}
.negative .stat-value {
  color: #dc2626;
}
.stat-sub {
  font-size: 12px;
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
}
.stat-hint {
  color: #cbd5e1;
}
@media (max-width: 1000px) {
  .stats {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 520px) {
  .stats {
    grid-template-columns: 1fr;
  }
}
</style>
