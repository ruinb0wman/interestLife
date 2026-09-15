<script setup lang="ts">
import { computed } from 'vue'
import {
  monthlyOccurrencesPerYear,
  occurrenceYears,
  type CashFlowItem,
  type SimParams,
  type YearRow,
} from '../lib'
import { formatWan, formatYuan } from '../format'

const props = defineProps<{ rows: YearRow[]; params: SimParams }>()

const startAge = computed(() => props.rows[0]?.age ?? props.params.startAge)

const tableRows = computed(() =>
  props.rows.filter((r) => (r.age - startAge.value) % 5 === 0),
)

/** el-table 把行数据当成 Record<PropertyKey, any> 传给插槽，这里收回类型 */
function cell(row: unknown): YearRow {
  return row as YearRow
}

/** 资产耗尽的年龄；全程未耗尽则为 null（最后一行年末本金为负即已耗尽） */
const depletedAt = computed(() => {
  const last = props.rows[props.rows.length - 1]
  return last && last.endPrincipal < 0 ? last.age : null
})

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

/** 被模拟到的年份里收支累计（破产截断后只统计到耗尽那年） */
const totals = computed(() => {
  let income = 0
  let expense = 0
  for (const row of props.rows) {
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
              <span :class="cell(row).endPrincipal < 0 ? 'neg' : ''">{{
                formatYuan(cell(row).endPrincipal)
              }}</span>
            </template>
          </el-table-column>
        </el-table>

        <p v-if="depletedAt !== null" class="note warn">
          资产在 {{ depletedAt }} 岁耗尽，模拟在此截断（共 {{ rows.length }} 年），表中最后一行为耗尽当年；
          后续年份不再推演负债。
        </p>
        <div class="note">
          <p v-for="n in cyclicNotes" :key="n.name" class="cycle-note">
            <b>{{ n.name }}</b>：{{ n.text }}
          </p>
          <p>
            模拟区间 {{ params.startAge }} ~ {{ params.endAge }} 岁，共
            {{ params.endAge - params.startAge + 1 }} 年，实际模拟 {{ rows.length }} 年；
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
.pos {
  color: var(--green);
}
.neg {
  color: var(--red);
  font-weight: 600;
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
.cycle-note {
  margin: 0;
}
.cycle-note b {
  color: var(--text-2);
}
</style>
