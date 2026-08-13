<script setup lang="ts">
import { computed } from 'vue'
import type { YearRow } from '../lib'
import { formatYuan } from '../format'

const props = defineProps<{ rows: YearRow[] }>()

const tableRows = computed(() =>
  props.rows.filter((r) => (r.age - 32) % 5 === 0),
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
          换车年份：42 / 52 / 62 / 72 / 82 / 92 岁 · 工资停发：52 岁起 · 换车净支出 = 新车价 − 旧车残值（25%）
        </p>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<style scoped>
.card {
  background: #fff;
  border: 1px solid #e4e9f2;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(30, 64, 175, 0.06);
  padding: 8px 16px 4px;
}
.car-year {
  color: #b45309;
  font-weight: 600;
}
.neg {
  color: #dc2626;
  font-weight: 600;
}
.note {
  font-size: 12px;
  color: #94a3b8;
  margin: 8px 0 12px;
}
</style>
