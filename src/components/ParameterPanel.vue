<script setup lang="ts">
import type { SimParams } from '../lib'

const model = defineModel<SimParams>({ required: true })

const moneyFields = [
  { key: 'monthlySalary', label: '初始月薪', unit: '元/月', step: 100 },
  { key: 'monthlyLiving', label: '初始月生活费', unit: '元/月', step: 100 },
  { key: 'initialPrincipal', label: '初始投资本金', unit: '元', step: 1000 },
  { key: 'initialCarPrice', label: '初始新车价格', unit: '元', step: 1000 },
] as const

const percentFields = [
  { key: 'salaryGrowth', label: '年薪涨幅', unit: '', step: 0.01 },
  { key: 'livingGrowth', label: '生活费年涨幅', unit: '', step: 0.01 },
  { key: 'annualReturn', label: '投资年化收益率', unit: '', step: 0.01 },
  { key: 'carPriceGrowth', label: '车价年涨幅', unit: '', step: 0.01 },
] as const

const toggles = [
  { key: 'enableSalary', label: '工资收入' },
  { key: 'enableInvestment', label: '投资收益' },
  { key: 'enableLiving', label: '生活费支出' },
  { key: 'enableCar', label: '换车支出' },
] as const
</script>

<template>
  <div class="panel">
    <div class="card param-card">
      <div class="card-title">收支参数</div>
      <p class="card-hint">涨幅 / 利率以小数输入，如 3% 填 0.03</p>
      <div class="param-grid">
        <div v-for="f in moneyFields" :key="f.key" class="param-item">
          <label>{{ f.label }}</label>
          <div class="input-row">
            <el-input-number
              v-model="model[f.key]"
              :min="0"
              :step="f.step"
              :controls-position="'right'"
            />
            <span class="unit">{{ f.unit }}</span>
          </div>
        </div>
        <div v-for="f in percentFields" :key="f.key" class="param-item">
          <label>{{ f.label }}</label>
          <div class="input-row">
            <el-input-number
              v-model="model[f.key]"
              :min="-0.9"
              :max="9.9999"
              :step="f.step"
              :precision="4"
              :controls-position="'right'"
            />
            <span class="unit">小数</span>
          </div>
        </div>
      </div>
    </div>

    <div class="card toggle-card">
      <div class="card-title">盈亏项启用 / 停用</div>
      <p class="card-hint">关闭某项后，该项当期计为 0（用于找出“躺平不破产”的边界）</p>
      <div class="toggle-grid">
        <div v-for="t in toggles" :key="t.key" class="toggle-item">
          <span>{{ t.label }}</span>
          <el-switch v-model="model[t.key]" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.card {
  background: #fff;
  border: 1px solid #e4e9f2;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(30, 64, 175, 0.06);
}
.card-title {
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
}
.card-hint {
  font-size: 12px;
  color: #94a3b8;
  margin: 4px 0 14px;
}
.param-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.toggle-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.param-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.param-item label {
  font-size: 13px;
  color: #475569;
}
.input-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.input-row .el-input-number {
  width: 100%;
}
.unit {
  font-size: 12px;
  color: #94a3b8;
  white-space: nowrap;
}
.toggle-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: #475569;
}
@media (max-width: 1200px) {
  .param-grid,
  .toggle-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 640px) {
  .param-grid,
  .toggle-grid {
    grid-template-columns: 1fr;
  }
}
</style>
