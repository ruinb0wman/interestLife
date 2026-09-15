<script setup lang="ts">
import { computed } from 'vue'
import {
  averageAnnualAmount,
  monthlyOccurrencesPerYear,
  occurrenceYears,
  occurrencesInYear,
  perOccurrenceAmount,
  type CashFlowItem,
} from '../lib'
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

const isOnce = computed(() => item.value.period === 'once')

/**
 * 越界提示：不静默改写用户填的年龄（避免调大再调小全局年龄后原值丢失），
 * 而是把「不会触发」这件事显式说出来。
 */
const outOfRange = computed(
  () => item.value.endAge < props.rangeStart || item.value.startAge > props.rangeEnd,
)

/** 该项在模拟区间内至少发生一次的年龄（月周期通常是每年，年周期只到触发年） */
const triggers = computed(() => occurrenceYears(item.value, props.rangeStart, props.rangeEnd))

/**
 * 结束年龄的下限。直接用 item.startAge 会在项越界时出现 min > max，
 * Element Plus 的 el-input-number 会直接抛错（[InputNumber] min should not be greater than max）。
 */
const endAgeMin = computed(() => Math.min(item.value.startAge, props.rangeEnd))

/** 该项在模拟区间内的总发生次数（按年粒度统计，月周期为各年次数之和） */
const totalOccurrences = computed(() => {
  if (outOfRange.value) return 0
  let total = 0
  for (const age of triggers.value) total += occurrencesInYear(item.value, age)
  return total
})

const triggerHint = computed(() => {
  if (!item.value.enabled) return '已停用，当期计为 0'
  if (outOfRange.value) {
    return `超出模拟区间（${props.rangeStart}~${props.rangeEnd} 岁），不会发生`
  }
  const list = triggers.value
  if (list.length === 0) return '在模拟区间内不会发生'

  if (isOnce.value) return `仅在 ${list[0]} 岁发生一次`
  if (item.value.period === 'month') {
    const perYear = monthlyOccurrencesPerYear(item.value.interval)
    const rate = Number.isInteger(perYear) ? `每年 ${perYear} 次` : `每年约 ${perYear.toFixed(1)} 次`
    return `每 ${item.value.interval} 个月发生一次 · ${rate} · 共约 ${totalOccurrences.value} 次`
  }
  const head = list.slice(0, 6).join(' / ')
  const tail = list.length > 6 ? ' … ' : ''
  return `每 ${item.value.interval} 年发生一次：${head}${tail} · 共 ${list.length} 次`
})

/** 金额提示：一次性项看单次金额，周期项摊成年额 */
const amountHint = computed(() => {
  const it = item.value
  if (isOnce.value) {
    return `单次 ${formatYuan(perOccurrenceAmount(it, it.startAge))}`
  }
  return `年额约 ${formatYuan(averageAnnualAmount(it))}`
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
        <label>单次金额</label>
        <div class="input-row">
          <el-input-number
            v-model="item.amount"
            :min="0"
            :step="1000"
            :controls-position="'right'"
          />
          <span class="unit">元/次</span>
        </div>
      </div>

      <div class="field">
        <label>周期</label>
        <div class="input-row">
          <!-- 先「每 [n]」再选单位：读作「每 2 个月」
               固定宽度必须挂在普通 span 上，不能直接写在 el-input-number / el-select 上：
               下面的 .field .el-input-number { width: 100% } 特异性更高，会把这里的宽度覆盖成
               「擑满整行」，把下拉框顶出格子、被右边字段的输入框盖住（看上去就是「下拉框没了」）。 -->
          <template v-if="!isOnce">
            <span class="unit">每</span>
            <span class="interval-box">
              <el-input-number
                v-model="item.interval"
                :min="1"
                :max="1200"
                :precision="0"
                :step="1"
                :controls-position="'right'"
                class="interval-num"
              />
            </span>
          </template>
          <span class="period-box">
            <el-select v-model="item.period" class="period-select">
              <el-option label="仅一次" value="once" />
              <el-option label="月" value="month" />
              <el-option label="年" value="year" />
            </el-select>
          </span>
        </div>
      </div>

      <div class="field">
        <label>单次金额年涨幅（小数）</label>
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
      <span class="amount-hint">{{ amountHint }}</span>
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
/* 用 grid 而不是 flex：宽度可预测，stretching 的百分比子元素（width:100% 的输入框）
   不会把定宽的下拉框顶出格子。minmax(0, …) 允许格子窄于内容而不溢出。 */
.row-fields {
  display: grid;
  grid-template-columns: 1.4fr 1.15fr 1.15fr 0.85fr 0.85fr;
  gap: 14px;
  align-items: end;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
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
  min-width: 0;
}
/* 固定宽度挂在 wrapper 上（见模板里的注释），这样不受 element-plus 自身宽度规则影响 */
.interval-box {
  width: 72px;
  flex: 0 0 auto;
}
.period-box {
  width: 92px;
  flex: 0 0 auto;
}
.interval-box .el-input-number,
.period-box .el-select {
  width: 100%;
}
.period-select {
  width: 100%;
}
.interval-num {
  width: 100%;
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
  gap: 12px;
}
.row-hint.warn {
  color: var(--warning);
}
.amount-hint {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
@media (max-width: 1200px) {
  .row-fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 640px) {
  .row-fields {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
