<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  monthlyOccurrencesPerYear,
  occurrenceYears,
  type CashFlowItem,
  type SimParams,
  type YearRow,
} from '../lib'
import { formatPercent, formatWan, formatYuan } from '../format'

const props = defineProps<{
  rows: YearRow[]
  params: SimParams
  /** 乐观 / 悲观情景的逐年结果；缺省时只显示普通情景（保持向后兼容） */
  optimisticRows?: YearRow[]
  pessimisticRows?: YearRow[]
}>()

interface Scenario {
  key: 'optimistic' | 'neutral' | 'pessimistic'
  /** 「乐观 / 普通 / 悲观」 */
  name: string
  /** 该情景的年化收益率 */
  rate: number
  rows: YearRow[]
}

/**
 * 三情景的逐年结果。**必须显式标注收益率**：三个情景的收支项完全相同，
 * 只有年化收益率不同，而它们的本金曲线会在「悬崖」附近拉开几十倍差距
 * （悲观情景耗尽那年，普通情景往往还有几百万），不标注就极易被读成
 * 「一年之内花掉几百万」的 bug。
 */
const scenarios = computed<Scenario[]>(() => {
  const list: Scenario[] = []
  if (props.optimisticRows) {
    list.push({ key: 'optimistic', name: '乐观', rate: props.params.optimisticReturn, rows: props.optimisticRows })
  }
  list.push({ key: 'neutral', name: '普通', rate: props.params.annualReturn, rows: props.rows })
  if (props.pessimisticRows) {
    list.push({ key: 'pessimistic', name: '悲观', rate: props.params.pessimisticReturn, rows: props.pessimisticRows })
  }
  return list
})

const selectedKey = ref<Scenario['key']>('neutral')

const active = computed<Scenario>(() => {
  return scenarios.value.find((s) => s.key === selectedKey.value) ?? scenarios.value[0]
})

/** 当前情景在结束年龄的年末本金（耗尽时为负的缺口） */
const activeFinal = computed(() => {
  const rows = active.value.rows
  return rows.length > 0 ? rows[rows.length - 1].endPrincipal : 0
})

/** 资产耗尽的年龄；该情景全程未耗尽则为 null（最后一行年末本金为负即已耗尽） */
const depletedAt = computed(() => {
  const rows = active.value.rows
  const last = rows[rows.length - 1]
  return last && last.endPrincipal < 0 ? last.age : null
})

const startAge = computed(() => active.value.rows[0]?.age ?? props.params.startAge)

/**
 * 每 5 年一个节点；耗尽的当年**必定**补上（否则「78 岁耗尽」时表里只有 75 / 80，
 * 断点那一行反而看不见，正是最容易引起误读的地方）。
 */
const tableRows = computed(() => {
  const rows = active.value.rows
  const sampled = rows.filter((r) => (r.age - startAge.value) % 5 === 0)
  const last = rows[rows.length - 1]
  if (last && last.endPrincipal < 0 && sampled[sampled.length - 1] !== last) {
    return [...sampled, last]
  }
  return sampled
})

const isDepletedRow = (row: YearRow) => row.endPrincipal < 0

/** el-table 把行数据当成 Record<PropertyKey, any> 传给插槽，这里收回类型 */
function cell(row: unknown): YearRow {
  return row as YearRow
}

interface CyclicNote {
  name: string
  text: string
}

/** 非「每月」的项：把周期摊开说明，方便核对发生口径 */
const cyclicNotes = computed<CyclicNote[]>(() => {
  const all: CashFlowItem[] = [...props.params.incomes, ...props.params.expenses]
  const notes: CyclicNote[] = []

  for (const item of all) {
    // 每月发生的项无需赘述
    if (item.period === 'month' && item.interval === 1) continue

    const years = occurrenceYears(item, props.params.startAge, props.params.endAge)
    if (years.length === 0) {
      notes.push({ name: item.name, text: '不在模拟区间内，未发生' })
      continue
    }
    if (item.period === 'once') {
      notes.push({ name: item.name, text: `仅 ${years[0]} 岁一次` })
      continue
    }
    if (item.period === 'month') {
      const perYear = monthlyOccurrencesPerYear(item.interval)
      notes.push({
        name: item.name,
        text: `每 ${item.interval} 个月一次（每年约 ${perYear.toFixed(perYear === Math.round(perYear) ? 0 : 1)} 次）`,
      })
      continue
    }
    const head = years.slice(0, 8).join(' / ')
    const tail = years.length > 8 ? ` … 共 ${years.length} 次` : `（共 ${years.length} 次）`
    notes.push({ name: item.name, text: `每 ${item.interval} 年一次：${head}${tail}` })
  }

  return notes
})

const disabledCount = computed(
  () =>
    [...props.params.incomes, ...props.params.expenses].filter((item) => !item.enabled).length,
)

/** 当前情景被模拟到的年份里收支累计（破产截断后只统计到耗尽那年） */
const totals = computed(() => {
  let income = 0
  let expense = 0
  for (const row of active.value.rows) {
    income += row.incomeTotal
    expense += row.expenseTotal
  }
  return { income, expense }
})
</script>

<template>
  <div class="card">
    <el-collapse>
      <el-collapse-item title="查看逐年明细（每 5 年一个节点）" name="detail">
        <div class="scenario-bar">
          <template v-if="scenarios.length > 1">
            <span class="scenario-label">情景</span>
            <el-radio-group v-model="selectedKey" size="small">
              <el-radio-button v-for="s in scenarios" :key="s.key" :value="s.key">
                {{ s.name }} {{ formatPercent(s.rate) }}
              </el-radio-button>
            </el-radio-group>
          </template>
          <span class="scenario-summary" :class="{ neg: depletedAt !== null }">
            <template v-if="depletedAt !== null">
              {{ active.name }}情景：{{ depletedAt }} 岁资产耗尽，缺口 {{ formatWan(activeFinal) }}
            </template>
            <template v-else>
              {{ active.name }}情景：{{ params.endAge }} 岁年末本金 {{ formatWan(activeFinal) }}
            </template>
          </span>
        </div>
        <p class="note scenario-hint">
          三个情景的收支项完全相同，只有年化收益率不同——所以「悲观情景 78 岁耗尽」与「普通情景同期还有几百万」可以同时成立。
          下表只显示<b>{{ active.name }}情景（年化 {{ formatPercent(active.rate) }}）</b>。
        </p>

        <el-table :data="tableRows" max-height="380" size="default" border>
          <el-table-column prop="age" label="年龄" width="80" align="center" />
          <el-table-column label="年初本金" align="right">
            <template #default="{ row }">{{ formatYuan(cell(row).startPrincipal) }}</template>
          </el-table-column>
          <el-table-column label="投资收益" align="right">
            <template #default="{ row }">{{ formatYuan(cell(row).investmentIncome) }}</template>
          </el-table-column>
          <el-table-column label="收入合计" align="right">
            <template #default="{ row }">
              <span class="pos">{{ formatYuan(cell(row).incomeTotal) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="支出合计" align="right">
            <template #default="{ row }">{{ formatYuan(cell(row).expenseTotal) }}</template>
          </el-table-column>
          <el-table-column label="年末本金" align="right">
            <template #default="{ row }">
              <template v-if="isDepletedRow(cell(row))">
                <span class="neg">{{ formatYuan(cell(row).endPrincipal) }}</span>
                <span class="row-tag">耗尽年</span>
              </template>
              <span v-else>{{ formatYuan(cell(row).endPrincipal) }}</span>
            </template>
          </el-table-column>
        </el-table>

        <p v-if="depletedAt !== null" class="note warn">
          {{ active.name }}情景（年化 {{ formatPercent(active.rate) }}）在 {{ depletedAt }} 岁耗尽，
          模拟在此截断（共 {{ active.rows.length }} 年），表中最后一行为耗尽当年；后续年份不再推演负债。
        </p>
        <div class="note">
          <p v-for="n in cyclicNotes" :key="n.name" class="cycle-note">
            <b>{{ n.name }}</b>：{{ n.text }}
          </p>
          <p>
            模拟区间 {{ params.startAge }} ~ {{ params.endAge }} 岁，共
            {{ params.endAge - params.startAge + 1 }} 年，当前情景实际模拟 {{ active.rows.length }} 年；
            累计收入 {{ formatWan(totals.income) }}、累计支出 {{ formatWan(totals.expense) }}。
            <template v-if="disabledCount > 0">另有 {{ disabledCount }} 个收支项已停用（当期计为 0）。</template>
          </p>
          <p>周期项的金额按「金额 × (1 + 涨幅)^(年龄 − 起始年龄)」逐年复利；月周期按当年实际发生次数累加。</p>
        </div>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<style scoped>
.card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: 8px 16px 4px;
}
.scenario-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin: 4px 0 0;
}
.scenario-label {
  font-size: 13px;
  color: var(--text-2);
}
.scenario-summary {
  font-size: 13px;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}
.scenario-summary.neg {
  color: var(--red);
}
.scenario-hint {
  margin: 8px 0 12px;
}
.pos {
  color: var(--green);
}
.neg {
  color: var(--red);
  font-weight: 600;
}
.row-tag {
  margin-left: 6px;
  font-size: 11px;
  color: var(--red);
  background: rgba(246, 111, 129, 0.14);
  border: 1px solid rgba(246, 111, 129, 0.4);
  border-radius: 4px;
  padding: 0 4px;
}
.note {
  font-size: 12px;
  color: var(--text-3);
  margin: 8px 0 12px;
  line-height: 1.7;
}
.note.warn {
  color: var(--warning);
}
.note b {
  color: var(--text-2);
}
.cycle-note {
  margin: 0;
}
.cycle-note b {
  color: var(--text-2);
}
</style>
