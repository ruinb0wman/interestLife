<script setup lang="ts">
import { computed } from 'vue'
import { annualAmount, occurrenceYears, type CashFlowItem } from '../lib'
import { formatYuan } from '../format'

/** 收支项表单行：收入 / 支出共用（由父级决定方向与预设） */
const item = defineModel<CashFlowItem>({ required: true })

const props = defineProps<{
  /** 全局模拟区间，用于输入框上下限与越界提示 */
  rangeStart: number
  rangeEnd: number
  /** 列表方向，仅用于文案 */
  type: 'income' | 'expense'
}>()

const emit = defineEmits<{ remove: [] }>()

type CycleMode = 'yearly' | 'every' | 'once'

const cycleMode = computed<CycleMode>(() => {
  if (item.value.cycle === 0) return 'once'
  return item.value.cycle === 1 ? 'yearly' : 'every'
})

function setCycleMode(mode: unknown) {
  if (mode === 'yearly') item.value.cycle = 1
  else if (mode === 'once') item.value.cycle = 0
  // 从「每年 / 仅一次」切到「每 N 年」，给一个有意义的最小值
  else item.value.cycle = Math.max(2, item.value.cycle)
}

/** 年额（月额 × 12），帮助用户核对填的是月还是年 */
const yearly = computed(() => annualAmount(item.value))

/**
 * 越界提示：不静默改写用户填的年龄（避免调大再调小全局年龄后原值丢失），
 * 而是把「不会触发」这件事显式说出来。
 */
const outOfRange = computed(
  () => item.value.endAge < props.rangeStart || item.value.startAge > props.rangeEnd,
)

/**
 * 结束年龄的下限。直接用 item.startAge 会在项越界时出现 min > max，
 * Element Plus 的 el-input-number 会直接抛错（[InputNumber] min should not be greater than max）。
 */
const endAgeMin = computed(() => Math.min(item.value.startAge, props.rangeEnd))

/** 该项在模拟区间内的触发年龄（越界或区间外为空） */
const triggers = computed(() =>
  occurrenceYears(item.value, props.rangeStart, props.rangeEnd),
)

const triggerHint = computed(() => {
  if (!item.value.enabled) return '已停用，当期计为 0'
  if (outOfRange.value) return `超出模拟区间（${props.rangeStart}~${props.rangeEnd} 岁），不会触发`
  const list = triggers.value
  if (list.length === 0) return '不会触发'
  if (item.value.cycle === 0) return `仅在 ${list[0]} 岁触发一次，共 1 次`
  if (item.value.cycle === 1) return `每年触发（${list[0]} ~ ${list[list.length - 1]} 岁，共 ${list.length} 次）`
  const head = list.slice(0, 6).join(' / ')
  const tail = list.length > 6 ? ` … 共 ${list.length} 次` : ''
  return `每 ${item.value.cycle} 年一次：${head}${tail}`
})
</script>

<template>
  <div class="item-card" :class="{ 'is-off': !item.enabled, 'is-out': outOfRange }">
    <div class="row row-head">
      <el-switch v-model="item.enabled" />
      <el-input v-model="item.name" class="name-input" placeholder="名称，如 工资" maxlength="24" />
      <span class="type-tag">{{ type === 'income' ? '收入' : '支出' }}</span>
      <el-button size="small" type="danger" text @click="emit('remove')">删除</el-button>
    </div>

    <div class="row row-fields">
      <div class="field">
        <label>金额</label>
        <div class="input-row">
          <el-input-number
            v-model="item.amount"
            :min="0"
            :step="item.frequency === 'month' ? 100 : 1000"
            :controls-position="'right'"
          />
          <el-select v-model="item.frequency" class="unit-select">
            <el-option label="元/月" value="month" />
            <el-option label="元/年" value="year" />
          </el-select>
        </div>
      </div>

      <div class="field">
        <label>年涨幅（小数）</label>
        <el-input-number
          v-model="item.growth"
          :min="-0.9"
          :max="9.9999"
          :step="0.01"
          :precision="4"
          :controls-position="'right'"
        />
      </div>

      <div class="field">
        <label>周期</label>
        <div class="input-row">
          <el-select :model-value="cycleMode" class="cycle-select" @change="setCycleMode">
            <el-option label="每年" value="yearly" />
            <el-option label="每 N 年一次" value="every" />
            <el-option label="仅一次" value="once" />
          </el-select>
          <el-input-number
            v-if="cycleMode === 'every'"
            v-model="item.cycle"
            :min="2"
            :max="100"
            :precision="0"
            :step="1"
            :controls-position="'right'"
            class="cycle-num"
          />
        </div>
      </div>

      <div class="field">
        <label>开始年龄</label>
        <div class="input-row">
          <el-input-number
            v-model="item.startAge"
            :min="rangeStart"
            :max="rangeEnd"
            :precision="0"
            :step="1"
            :controls-position="'right'"
          />
          <span class="unit">岁</span>
        </div>
      </div>

      <div class="field">
        <label>结束年龄</label>
        <div class="input-row">
          <el-input-number
            v-model="item.endAge"
            :min="endAgeMin"
            :max="rangeEnd"
            :precision="0"
            :step="1"
            :controls-position="'right'"
          />
          <span class="unit">岁</span>
        </div>
      </div>
    </div>

    <div class="row row-hint" :class="{ warn: outOfRange }">
      <span>{{ triggerHint }}</span>
      <span class="amount-hint">年额约 {{ formatYuan(yearly) }}</span>
    </div>
  </div>
</template>

<style scoped>
.item-card {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 14px;
  background: var(--toggle-bg);
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition:
    background 0.2s,
    border-color 0.2s,
    opacity 0.2s;
}
.item-card.is-off {
  opacity: 0.62;
}
.item-card.is-out {
  border-color: var(--warning);
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.name-input {
  width: 180px;
  flex: 0 0 auto;
}
.type-tag {
  font-size: 12px;
  color: var(--text-3);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 1px 8px;
}
.row-head .el-button {
  margin-left: auto;
}
.row-fields {
  align-items: flex-end;
  gap: 14px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.field label {
  font-size: 12px;
  color: var(--text-3);
}
.field .el-input-number {
  width: 100%;
}
.input-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.unit-select {
  width: 88px;
  flex: 0 0 auto;
}
.cycle-select {
  width: 118px;
  flex: 0 0 auto;
}
.cycle-num {
  width: 84px;
  flex: 0 0 auto;
}
.unit {
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
}
.row-hint {
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-3);
  border-top: 1px dashed var(--border);
  padding-top: 8px;
}
.row-hint.warn {
  color: var(--warning);
}
.amount-hint {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
@media (max-width: 900px) {
  .row-fields {
    align-items: stretch;
  }
  .field {
    flex: 1 1 150px;
  }
}
</style>
