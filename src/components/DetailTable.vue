<script setup lang="ts">
import { computed } from 'vue'
import { carYears, type SimParams, type YearRow } from '../lib'
import { formatYuan } from '../format'

const props = defineProps<{ rows: YearRow[]; params: SimParams }>()

const startAge = computed(() => props.rows[0]?.age ?? props.params.startAge)

const tableRows = computed(() =>
  props.rows.filter((r) => (r.age - startAge.value) % 5 === 0),
)

const carYearsText = computed(() =>
  carYears(props.params.startAge, props.params.targetAge, props.params.carReplaceInterval).join(
    ' / ',
  ),
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
          <el-table-column label="年工资" align="right">
            <template #default="{ row }">{{ formatYuan(cell(row).salary) }}</template>
          </el-table-column>
          <el-table-column label="年生活费" align="right">
            <template #default="{ row }">{{ formatYuan(cell(row).living) }}</template>
          </el-table-column>
          <el-table-column label="换车净支出" align="right">
            <template #default="{ row }">
              <span :class="{ 'car-year': cell(row).carNet > 0 }">{{ formatYuan(cell(row).carNet) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="年末本金" align="right">
            <template #default="{ row }">
              <span :class="cell(row).endPrincipal < 0 ? 'neg' : ''">{{ formatYuan(cell(row).endPrincipal) }}</span>
            </template>
          </el-table-column>
        </el-table>
        <p v-if="depletedAt !== null" class="note warn">
          资产在 {{ depletedAt }} 岁耗尽，模拟在此截断（共 {{ rows.length }} 年），表中最后一行为耗尽当年；
          后续年份不再推演负债。
        </p>
        <p class="note">
          换车年份：{{ carYearsText }} 岁 · 工资发至 {{ params.salaryStopAge }} 岁，{{
            params.salaryStopAge + 1
          }} 岁起停发 · 换车净支出 = 新车价 − 旧车残值（25%）
        </p>
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
.car-year {
  color: var(--warning);
  font-weight: 600;
}
.neg {
  color: var(--red);
  font-weight: 600;
}
.note {
  font-size: 12px;
  color: var(--text-3);
  margin: 8px 0 12px;
}
.note.warn {
  color: var(--warning);
}
</style>
