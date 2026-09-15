<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { monteCarlo, type McConfig, type McResult, type SimParams } from '../lib'
import { formatPercent, formatWan, formatYuan } from '../format'

const props = defineProps<{ params: SimParams }>()
const config = defineModel<McConfig>('config', { required: true })

const running = ref(false)
const result = ref<McResult | null>(null)
/** 运行时的输入快照：用于判断已有结果是否已经对不上当前参数 */
const ranWith = ref<string | null>(null)

const inputKey = computed(() => JSON.stringify([props.params, config.value]))
const stale = computed(() => result.value !== null && ranWith.value !== inputKey.value)

async function run() {
  running.value = true
  await nextTick()
  const key = inputKey.value
  try {
    result.value = monteCarlo(props.params, config.value)
    ranWith.value = key
  } finally {
    running.value = false
  }
}

function rateTone(rate: number): 'good' | 'warn' | 'bad' {
  if (rate >= 0.95) return 'good'
  if (rate >= 0.8) return 'warn'
  return 'bad'
}
</script>

<template>
  <div class="card">
    <div class="card-title">蒙特卡洛压力测试</div>
    <p class="card-hint">
      每年收益率 ~ N(普通收益率, 收益波动率)；每个支出项的涨幅 ~ N(该项涨幅, 通胀波动率) 逐年随机游走
      （收入项涨幅固定）。统计“全程本金从未为负”的成功率与最终资产分布。
      与主图一致，某次模拟一旦资不抵债就在当年截断，缺口计入最终资产，不再推演负债雪球。
    </p>
    <div class="mc-grid">
      <div class="param-item">
        <label>模拟次数</label>
        <el-input-number v-model="config.iterations" :min="100" :max="5000" :step="100" :precision="0" :controls-position="'right'" />
      </div>
      <div class="param-item">
        <label>收益波动率</label>
        <el-input-number v-model="config.returnVolatility" :min="0.005" :max="0.2" :step="0.005" :precision="3" :controls-position="'right'" />
      </div>
      <div class="param-item">
        <label>通胀波动率</label>
        <el-input-number v-model="config.inflationVolatility" :min="0.005" :max="0.2" :step="0.005" :precision="3" :controls-position="'right'" />
      </div>
      <div class="param-item run-col">
        <el-button type="primary" :loading="running" @click="run">
          {{ result ? '重新运行' : '运行压力测试' }}
        </el-button>
      </div>
    </div>

    <div v-if="result" class="mc-result" :class="{ 'is-stale': stale }">
      <div class="mc-rate" :class="rateTone(result.successRate)">
        <div class="mc-rate-num">{{ (result.successRate * 100).toFixed(1) }}%</div>
        <div class="mc-rate-label">存活成功率（全程不破产）</div>
      </div>
      <div class="mc-bars">
        <div class="bar">
          <span>5% 分位</span>
          <b>{{ formatWan(result.p5Final) }}</b>
        </div>
        <div class="bar">
          <span>中位数</span>
          <b>{{ formatWan(result.p50Final) }}</b>
        </div>
        <div class="bar">
          <span>95% 分位</span>
          <b>{{ formatWan(result.p95Final) }}</b>
        </div>
        <div class="bar">
          <span>最差情景</span>
          <b :class="{ neg: result.worstFinal < 0 }">{{ formatWan(result.worstFinal) }}</b>
        </div>
        <div v-if="result.p50DepletedAge !== null" class="bar">
          <span>破产中位年龄</span>
          <b class="neg">{{ result.p50DepletedAge }} 岁</b>
        </div>
      </div>
      <p class="mc-note">
        成功率为 {{ formatPercent(result.successRate) }}；
        最终资产最低 {{ formatYuan(result.worstFinal) }}、中位 {{ formatYuan(result.p50Final) }}。
        <template v-if="result.p50DepletedAge !== null">
          破产的模拟中，有一半在 {{ result.p50DepletedAge }} 岁前就已耗尽资产。
        </template>
      </p>
      <p v-if="stale" class="mc-stale">
        参数已变更，上方结果对应当前的上一版设置，请重新运行。
      </p>
    </div>
  </div>
</template>

<style scoped>
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
.mc-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  align-items: end;
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
.run-col {
  justify-content: flex-end;
}
.mc-result {
  margin-top: 18px;
  display: flex;
  gap: 24px;
  align-items: center;
  flex-wrap: wrap;
}
.mc-rate {
  text-align: center;
  padding: 12px 24px;
  border-radius: var(--radius-lg);
  min-width: 180px;
}
.mc-rate.good {
  background: rgba(61, 214, 140, 0.14);
  color: var(--green);
  border: 1px solid rgba(61, 214, 140, 0.5);
}
.mc-rate.warn {
  background: rgba(249, 180, 78, 0.14);
  color: var(--warning);
  border: 1px solid rgba(249, 180, 78, 0.5);
}
.mc-rate.bad {
  background: rgba(246, 111, 129, 0.14);
  color: var(--red);
  border: 1px solid rgba(246, 111, 129, 0.5);
}
.mc-rate-num {
  font-size: 32px;
  font-weight: 800;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.mc-rate-label {
  font-size: 12px;
  margin-top: 4px;
  opacity: 0.85;
}
.mc-bars {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px 32px;
  flex: 1;
  min-width: 280px;
}
.bar {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text-2);
  border-bottom: 1px dashed var(--border);
  padding-bottom: 4px;
}
.bar b {
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.bar b.neg {
  color: var(--red);
}
.mc-note {
  font-size: 12px;
  color: var(--text-3);
  margin-top: 12px;
  flex-basis: 100%;
}
.mc-result.is-stale {
  opacity: 0.5;
}
.mc-stale {
  font-size: 12px;
  color: var(--warning);
  margin-top: 4px;
  flex-basis: 100%;
}
@media (max-width: 900px) {
  .mc-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
