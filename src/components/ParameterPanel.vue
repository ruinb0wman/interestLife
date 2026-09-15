<script setup lang="ts">
import { computed } from 'vue'
import { CASHFLOW_PRESETS, createItem, type SimParams } from '../lib'
import CashFlowItemRow from './CashFlowItemRow.vue'

const model = defineModel<SimParams>({ required: true })

const incomePresets = computed(() => CASHFLOW_PRESETS.filter((p) => p.type === 'income'))
const expensePresets = computed(() => CASHFLOW_PRESETS.filter((p) => p.type === 'expense'))

const rateFields = [
  { key: 'annualReturn', label: '普通收益率', hint: '主曲线' },
  { key: 'optimisticReturn', label: '乐观收益率', hint: '上界情景' },
  { key: 'pessimisticReturn', label: '悲观收益率', hint: '下界情景' },
] as const

function addItem(type: 'income' | 'expense', presetKey: unknown) {
  const key = String(presetKey)
  const list = type === 'income' ? model.value.incomes : model.value.expenses
  list.push(createItem(key, model.value.startAge, model.value.endAge))
}

function removeItem(type: 'income' | 'expense', index: number) {
  const list = type === 'income' ? model.value.incomes : model.value.expenses
  list.splice(index, 1)
}

function resetList(type: 'income' | 'expense') {
  const list = type === 'income' ? model.value.incomes : model.value.expenses
  list.splice(0, list.length)
}
</script>

<template>
  <div class="panel">
    <div class="card param-card">
      <div class="card-title">基础信息</div>
      <p class="card-hint">模拟区间与起始本金；所有收支项都在这段区间内按周期触发</p>
      <div class="param-grid">
        <div class="param-item">
          <label>开始年龄</label>
          <div class="input-row">
            <el-input-number
              v-model="model.startAge"
              :min="16"
              :max="model.endAge - 1"
              :precision="0"
              :step="1"
              :controls-position="'right'"
            />
            <span class="unit">岁</span>
          </div>
        </div>
        <div class="param-item">
          <label>结束年龄</label>
          <div class="input-row">
            <el-input-number
              v-model="model.endAge"
              :min="model.startAge + 1"
              :max="120"
              :precision="0"
              :step="1"
              :controls-position="'right'"
            />
            <span class="unit">岁</span>
          </div>
        </div>
        <div class="param-item">
          <label>初始本金</label>
          <div class="input-row">
            <el-input-number
              v-model="model.initialPrincipal"
              :min="0"
              :step="1000"
              :controls-position="'right'"
            />
            <span class="unit">元</span>
          </div>
        </div>
      </div>
    </div>

    <div class="card param-card">
      <div class="card-title">收入项</div>
      <p class="card-hint">
        涨幅按各项自身起始年龄复利；周期「每 N 年一次」的首次触发在开始年龄。填了「元/月」的项会自动 ×12 折算成年额
      </p>
      <div v-if="model.incomes.length === 0" class="empty-hint">未设置任何收入（默认参数为「工资」）</div>
      <div class="item-list">
        <CashFlowItemRow
          v-for="(it, i) in model.incomes"
          :key="it.id"
          v-model="model.incomes[i]"
          type="income"
          :range-start="model.startAge"
          :range-end="model.endAge"
          @remove="removeItem('income', i)"
        />
      </div>
      <div class="list-actions">
        <el-dropdown @command="(key: unknown) => addItem('income', key)">
          <el-button size="small" plain>+ 添加收入项</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-for="p in incomePresets" :key="p.key" :command="p.key">
                <span class="preset-label">{{ p.label }}</span>
                <span class="preset-hint">{{ p.hint }}</span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button v-if="model.incomes.length > 0" size="small" text @click="resetList('income')">
          清空
        </el-button>
      </div>
    </div>

    <div class="card param-card">
      <div class="card-title">支出项</div>
      <p class="card-hint">
        「仅一次」用于大病 / 意外这类单点支出；换车模板已按 25% 旧车残值预折算成净支出
      </p>
      <div v-if="model.expenses.length === 0" class="empty-hint">未设置任何支出（默认参数为「生活费 + 换车」）</div>
      <div class="item-list">
        <CashFlowItemRow
          v-for="(it, i) in model.expenses"
          :key="it.id"
          v-model="model.expenses[i]"
          type="expense"
          :range-start="model.startAge"
          :range-end="model.endAge"
          @remove="removeItem('expense', i)"
        />
      </div>
      <div class="list-actions">
        <el-dropdown @command="(key: unknown) => addItem('expense', key)">
          <el-button size="small" plain>+ 添加支出项</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-for="p in expensePresets" :key="p.key" :command="p.key">
                <span class="preset-label">{{ p.label }}</span>
                <span class="preset-hint">{{ p.hint }}</span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button v-if="model.expenses.length > 0" size="small" text @click="resetList('expense')">
          清空
        </el-button>
      </div>
    </div>

    <div class="card param-card">
      <div class="card-title">投资收益</div>
      <p class="card-hint">
        涨幅 / 利率以小数输入，如 3% 填 0.03；三档收益率用于主曲线与悲观情景对照（压力测试只随机「普通收益率」）
      </p>
      <div class="param-grid">
        <div v-for="f in rateFields" :key="f.key" class="param-item">
          <label>{{ f.label }}</label>
          <div class="input-row">
            <el-input-number
              v-model="model[f.key]"
              :min="-0.9"
              :max="9.9999"
              :step="0.01"
              :precision="4"
              :controls-position="'right'"
            />
            <span class="unit">小数</span>
          </div>
          <span class="field-hint">{{ f.hint }}</span>
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
  line-height: 1.6;
}
.param-grid {
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
.field-hint {
  font-size: 12px;
  color: var(--text-3);
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
.item-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.empty-hint {
  font-size: 12px;
  color: var(--text-3);
  margin-bottom: 10px;
}
.list-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}
.preset-label {
  font-weight: 500;
}
.preset-hint {
  margin-left: 10px;
  font-size: 12px;
  color: var(--text-3);
}
@media (max-width: 1200px) {
  .param-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 640px) {
  .param-grid {
    grid-template-columns: 1fr;
  }
}
</style>
