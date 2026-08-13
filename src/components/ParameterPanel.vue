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
  { key: 'annualReturn', label: '中性收益率', unit: '', step: 0.01 },
  { key: 'carPriceGrowth', label: '车价年涨幅', unit: '', step: 0.01 },
] as const

const toggles = [
  { key: 'enableSalary', label: '工资收入' },
  { key: 'enableInvestment', label: '投资收益' },
  { key: 'enableLiving', label: '生活费支出' },
  { key: 'enableCar', label: '换车支出' },
  { key: 'enableMedical', label: '医疗支出' },
  { key: 'enableExtraIncome', label: '零工收入' },
  { key: 'enableOneOff', label: '一次性支出' },
] as const

function addOneOff() {
  model.value.oneOffExpenses.push({ age: 60, amount: 200000 })
}
function removeOneOff(index: number) {
  model.value.oneOffExpenses.splice(index, 1)
}
</script>

<template>
  <div class="panel">
    <div class="card param-card">
      <div class="card-title">时间设定</div>
      <p class="card-hint">工资发到「工资结束年龄」为止；首次换车 = 初始年龄 + 买车周期，此后每周期一次</p>
      <div class="param-grid">
        <div class="param-item">
          <label>初始年龄</label>
          <div class="input-row">
            <el-input-number v-model="model.startAge" :min="16" :max="model.targetAge - 1" :precision="0" :step="1" :controls-position="'right'" />
            <span class="unit">岁</span>
          </div>
        </div>
        <div class="param-item">
          <label>目标年龄</label>
          <div class="input-row">
            <el-input-number v-model="model.targetAge" :min="model.startAge + 1" :max="120" :precision="0" :step="1" :controls-position="'right'" />
            <span class="unit">岁</span>
          </div>
        </div>
        <div class="param-item">
          <label>工资结束年龄</label>
          <div class="input-row">
            <el-input-number v-model="model.salaryStopAge" :min="model.startAge" :max="model.targetAge" :precision="0" :step="1" :controls-position="'right'" />
            <span class="unit">岁</span>
          </div>
        </div>
        <div class="param-item">
          <label>买车周期</label>
          <div class="input-row">
            <el-input-number v-model="model.carReplaceInterval" :min="1" :max="40" :precision="0" :step="1" :controls-position="'right'" />
            <span class="unit">年</span>
          </div>
        </div>
      </div>
    </div>

    <div class="card param-card">
      <div class="card-title">收支参数</div>
      <p class="card-hint">涨幅 / 利率以小数输入，如 3% 填 0.03；中性收益率用于主曲线</p>
      <div class="param-grid">
        <div v-for="f in moneyFields" :key="f.key" class="param-item">
          <label>{{ f.label }}</label>
          <div class="input-row">
            <el-input-number v-model="model[f.key]" :min="0" :step="f.step" :controls-position="'right'" />
            <span class="unit">{{ f.unit }}</span>
          </div>
        </div>
        <div v-for="f in percentFields" :key="f.key" class="param-item">
          <label>{{ f.label }}</label>
          <div class="input-row">
            <el-input-number v-model="model[f.key]" :min="-0.9" :max="9.9999" :step="f.step" :precision="4" :controls-position="'right'" />
            <span class="unit">小数</span>
          </div>
        </div>
      </div>
    </div>

    <div class="card param-card">
      <div class="card-title">情景与风险</div>
      <p class="card-hint">三情景对照用于观察破产点；医疗/零工/一次性支出默认关闭（金额为 0 或空列表）</p>

      <div class="sub-title">收益率情景</div>
      <div class="param-grid">
        <div class="param-item">
          <label>乐观收益率</label>
          <div class="input-row">
            <el-input-number v-model="model.optimisticReturn" :min="-0.9" :max="9.9999" :step="0.01" :precision="4" :controls-position="'right'" />
            <span class="unit">小数</span>
          </div>
        </div>
        <div class="param-item">
          <label>悲观收益率</label>
          <div class="input-row">
            <el-input-number v-model="model.pessimisticReturn" :min="-0.9" :max="9.9999" :step="0.01" :precision="4" :controls-position="'right'" />
            <span class="unit">小数</span>
          </div>
        </div>
      </div>

      <div class="sub-title">老年医疗 / 护理支出</div>
      <div class="param-grid">
        <div class="param-item">
          <label>起始年龄</label>
          <div class="input-row">
            <el-input-number v-model="model.medicalStartAge" :min="model.startAge" :max="model.targetAge" :precision="0" :step="1" :controls-position="'right'" />
            <span class="unit">岁</span>
          </div>
        </div>
        <div class="param-item">
          <label>月支出</label>
          <div class="input-row">
            <el-input-number v-model="model.monthlyMedical" :min="0" :step="100" :controls-position="'right'" />
            <span class="unit">元/月</span>
          </div>
        </div>
        <div class="param-item">
          <label>年涨幅</label>
          <div class="input-row">
            <el-input-number v-model="model.medicalGrowth" :min="-0.9" :max="9.9999" :step="0.01" :precision="4" :controls-position="'right'" />
            <span class="unit">小数</span>
          </div>
        </div>
      </div>

      <div class="sub-title">零工 / 其他收入（工资停发后）</div>
      <div class="param-grid">
        <div class="param-item">
          <label>月收入</label>
          <div class="input-row">
            <el-input-number v-model="model.monthlyExtraIncome" :min="0" :step="100" :controls-position="'right'" />
            <span class="unit">元/月</span>
          </div>
        </div>
        <div class="param-item">
          <label>年涨幅</label>
          <div class="input-row">
            <el-input-number v-model="model.extraIncomeGrowth" :min="-0.9" :max="9.9999" :step="0.01" :precision="4" :controls-position="'right'" />
            <span class="unit">小数</span>
          </div>
        </div>
        <div class="param-item">
          <label>结束年龄</label>
          <div class="input-row">
            <el-input-number v-model="model.extraIncomeStopAge" :min="model.salaryStopAge + 1" :max="model.targetAge" :precision="0" :step="1" :controls-position="'right'" />
            <span class="unit">岁</span>
          </div>
        </div>
      </div>

      <div class="sub-title">一次性大额支出（大病 / 意外）</div>
      <div v-if="model.oneOffExpenses.length === 0" class="empty-hint">未设置任何一次性支出（默认为空）</div>
      <div v-for="(exp, i) in model.oneOffExpenses" :key="i" class="oneoff-row">
        <span>第 {{ i + 1 }} 笔</span>
        <el-input-number v-model="exp.age" :min="model.startAge" :max="model.targetAge" :precision="0" :step="1" :controls-position="'right'" />
        <span class="unit">岁，支出</span>
        <el-input-number v-model="exp.amount" :min="0" :step="5000" :controls-position="'right'" />
        <span class="unit">元</span>
        <el-button size="small" type="danger" text @click="removeOneOff(i)">删除</el-button>
      </div>
      <el-button class="add-btn" size="small" plain @click="addOneOff">+ 添加一次性支出</el-button>
    </div>

    <div class="card toggle-card">
      <div class="card-title">盈亏项启用 / 停用</div>
      <p class="card-hint">关闭某项后，该项当期计为 0（用于找出“躺平不破产”的边界）</p>
      <div class="toggle-grid">
        <div
          v-for="t in toggles"
          :key="t.key"
          class="toggle-item"
          :class="{ 'is-on': model[t.key] }"
        >
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
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px;
  box-shadow: var(--shadow-md);
}
.card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}
.card-hint {
  font-size: 12px;
  color: var(--text-3);
  margin: 4px 0 14px;
}
.sub-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-2);
  margin: 16px 0 10px;
  padding-top: 12px;
  border-top: 1px dashed var(--border);
}
.sub-title:first-of-type {
  border-top: none;
  padding-top: 0;
  margin-top: 0;
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
  color: var(--text-2);
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
  color: var(--text-3);
  white-space: nowrap;
}
.toggle-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text-2);
  background: var(--toggle-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  transition:
    background 0.2s,
    border-color 0.2s;
}
.toggle-item.is-on {
  background: var(--ok-bg);
  border-color: var(--ok-border);
}
.empty-hint {
  font-size: 12px;
  color: var(--text-3);
  margin-bottom: 10px;
}
.oneoff-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 13px;
  color: var(--text-2);
}
.oneoff-row .el-input-number {
  width: 130px;
}
.add-btn {
  margin-top: 4px;
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
