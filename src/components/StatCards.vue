<script setup lang="ts">
import { computed } from 'vue'
import type { Analysis } from '../lib'
import { formatPercent, formatWan, formatYuan } from '../format'

const props = defineProps<{
  analysis: Analysis
  pessimisticBalance: number
  pessimisticReturn: number
}>()

// 必须用 computed：label / hint 依赖 props，写成普通常量只会在 setup 时求值一次，
// 之后参数变化不会更新（例如「停薪后」卡片的年龄与最低本金年龄会一直是旧值）。
const cards = computed(() => {
  const a = props.analysis
  const span = a.targetAge - a.startAge
  return [
    {
      label: `${a.targetAge} 岁总资产（中性）`,
      amount: a.finalBalance,
      hint: '模拟结束时的全部身家',
    },
    {
      label: `悲观情景总资产（${formatPercent(props.pessimisticReturn)}）`,
      amount: props.pessimisticBalance,
      hint: '最坏情景下的剩余身家',
    },
    {
      label: `${a.firstCarAge} 岁（第一次换车后）`,
      amount: a.afterFirstCar,
      hint: '首次换车节点',
    },
    {
      label: `${a.salaryStopAge + 1} 岁（停薪后）`,
      amount: a.afterSalaryStop,
      hint: '工资停发后的节点',
    },
    {
      label: '最低本金',
      amount: a.minBalance,
      hint: `${a.minBalanceAge} 岁时为 ${span} 年内最低点`,
    },
  ]
})
</script>

<template>
  <div class="stats">
    <div
      v-for="c in cards"
      :key="c.label"
      class="stat-card"
      :class="c.amount >= 0 ? 'positive' : 'negative'"
    >
      <div class="stat-label">{{ c.label }}</div>
      <div class="stat-value">{{ formatWan(c.amount) }}</div>
      <div class="stat-sub">
        {{ formatYuan(c.amount) }}
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
