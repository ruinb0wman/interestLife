<script setup lang="ts">
import { computed } from 'vue'
import type { Analysis } from '../lib'
import { formatPercent, formatWan, formatYuan } from '../format'

const props = defineProps<{
  analysis: Analysis
  pessimisticAnalysis: Analysis
  pessimisticReturn: number
}>()

interface StatCard {
  label: string
  /** null = 该年份未被模拟到（资产已提前耗尽） */
  amount: number | null
  hint: string
}

function balanceCard(name: string, a: Analysis, hint: string): StatCard {
  return a.survives
    ? { label: `${a.targetAge} 岁总资产（${name}）`, amount: a.finalBalance, hint }
    : { label: `${a.firstNegativeAge} 岁资产耗尽（${name}）`, amount: a.finalBalance, hint }
}

function nodeCard(label: string, amount: number | null, hint: string): StatCard {
  return { label, amount, hint }
}

// 必须用 computed：label / hint 依赖 props，写成普通常量只会在 setup 时求值一次，
// 之后参数变化不会更新（例如「停薪后」卡片的年龄与最低本金年龄会一直是旧值）。
const cards = computed<StatCard[]>(() => {
  const a = props.analysis
  const p = props.pessimisticAnalysis
  const span = a.targetAge - a.startAge

  return [
    balanceCard('中性', a, a.survives ? '模拟结束时的全部身家' : '耗尽当年的资金缺口'),
    balanceCard(
      `悲观 ${formatPercent(props.pessimisticReturn)}`,
      p,
      p.survives ? '最坏情景下的剩余身家' : '耗尽当年的资金缺口',
    ),
    nodeCard(
      `${a.firstCarAge} 岁（第一次换车后）`,
      a.afterFirstCar,
      a.afterFirstCar === null ? `未模拟到，${a.simulatedThroughAge} 岁已耗尽` : '首次换车节点',
    ),
    nodeCard(
      `${a.salaryStopAge + 1} 岁（停薪后）`,
      a.afterSalaryStop,
      a.afterSalaryStop === null ? `未模拟到，${a.simulatedThroughAge} 岁已耗尽` : '工资停发后的节点',
    ),
    nodeCard(
      '最低本金',
      a.minBalance,
      `${a.minBalanceAge} 岁时为 ${span} 年内最低点`,
    ),
  ]
})

function toneClass(card: StatCard): string {
  if (card.amount === null) return 'muted'
  return card.amount >= 0 ? 'positive' : 'negative'
}
</script>

<template>
  <div class="stats">
    <div v-for="c in cards" :key="c.label" class="stat-card" :class="toneClass(c)">
      <div class="stat-label">{{ c.label }}</div>
      <div class="stat-value">{{ c.amount === null ? '—' : formatWan(c.amount) }}</div>
      <div class="stat-sub">
        <template v-if="c.amount === null">未模拟到（已提前耗尽）</template>
        <template v-else>{{ formatYuan(c.amount) }}</template>
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
.stat-card.muted {
  border-left: 4px solid var(--text-3);
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
.muted .stat-value {
  color: var(--text-3);
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
