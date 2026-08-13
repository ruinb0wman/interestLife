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
</script>

<template>
  <div class="card">
    <el-collapse>
      <el-collapse-item title="查看逐年明细（每 5 年一个节点）" name="detail">
        <el-table :data="tableRows" max-height="380" size="default" border>
          <el-table-column prop="age" label="年龄" width="80" align="center" />
          <el-table-column label="年初本金" align="right">
            <template #default="{ row }: { row: YearRow }">{{ formatYuan(row.startPrincipal) }}</template>
          </el-table-column>
          <el-table-column label="年工资" align="right">
            <template #default="{ row }: { row: YearRow }">{{ formatYuan(row.salary) }}</template>
          </el-table-column>
          <el-table-column label="年生活费" align="right">
            <template #default="{ row }: { row: YearRow }">{{ formatYuan(row.living) }}</template>
          </el-table-column>
          <el-table-column label="换车净支出" align="right">
            <template #default="{ row }: { row: YearRow }">
              <span :class="{ 'car-year': row.carNet > 0 }">{{ formatYuan(row.carNet) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="年末本金" align="right">
            <template #default="{ row }: { row: YearRow }">
              <span :class="row.endPrincipal < 0 ? 'neg' : ''">{{ formatYuan(row.endPrincipal) }}</span>
            </template>
          </el-table-column>
        </el-table>
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
</style>
