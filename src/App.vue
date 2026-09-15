<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  analyze,
  simulate,
  simulateScenario,
  verdict,
  type McConfig,
  type SimParams,
} from './lib'
import { formatPercent, formatWan, formatYuan } from './format'
import {
  defaultState,
  loadInitialState,
  stateToUrl,
  writeStateToStorage,
  STATE_VERSION,
  type AppState,
} from './persist'
import ParameterPanel from './components/ParameterPanel.vue'
import CashFlowChart from './components/CashFlowChart.vue'
import StatCards from './components/StatCards.vue'
import DetailTable from './components/DetailTable.vue'
import StressTest from './components/StressTest.vue'

// 启动时的状态优先级：URL hash（分享链接）> localStorage（上次编辑）> 默认值
const initial = loadInitialState()
// 必须用 let：`v-model="params"` 会生成对 params 本身的赋位，
// 用 const 时 Vue 编译器会警告并自行改写为 let。
let params = reactive<SimParams>(initial.state.params)
const mcConfig = ref<McConfig>(initial.state.mc)
const loadedFrom = initial.from
const showLoadedHint = ref(loadedFrom !== 'default')

const rows = computed(() => simulate(params))
const optimisticRows = computed(() => simulateScenario(params, params.optimisticReturn))
const pessimisticRows = computed(() => simulateScenario(params, params.pessimisticReturn))
const analysis = computed(() => analyze(rows.value, params))
const pessimisticAnalysis = computed(() => analyze(pessimisticRows.value, params))
const conclusion = computed(() => verdict(analysis.value, pessimisticAnalysis.value))

function currentState(): AppState {
  return {
    version: STATE_VERSION,
    params: { ...params, oneOffExpenses: params.oneOffExpenses.map((o) => ({ ...o })) },
    mc: { ...mcConfig.value },
  }
}

// 参数一变就同步到 localStorage 与地址栏（去抖 200ms，避免拖拽数字框时狂写）
let persistTimer: ReturnType<typeof setTimeout> | undefined
watch(
  () => [params, mcConfig.value],
  () => {
    clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      const state = currentState()
      writeStateToStorage(state)
      history.replaceState(null, '', stateToUrl(state))
    }, 200)
  },
  { deep: true },
)
onBeforeUnmount(() => clearTimeout(persistTimer))

function resetAll() {
  const fresh = defaultState()
  Object.assign(params, {
    ...fresh.params,
    oneOffExpenses: fresh.params.oneOffExpenses.map((o) => ({ ...o })),
  })
  mcConfig.value = fresh.mc
  ElMessage.success('已恢复默认参数')
}

/** 非安全上下文（如 http 局域网访问）下 navigator.clipboard 不可用，退化到 execCommand */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 继续尝试退化方案
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}

async function copyShareLink() {
  const ok = await copyText(stateToUrl(currentState()))
  if (ok) ElMessage.success('方案链接已复制，参数包含在链接里')
  else ElMessage.warning('复制失败，请手动复制地址栏链接')
}
</script>

<template>
  <div class="page">
    <header class="header">
      <div class="header-row">
        <h1>躺平财务模拟器 <span class="sub">· 不交社保版</span></h1>
        <div class="header-actions">
          <el-button size="small" plain @click="copyShareLink">复制方案链接</el-button>
          <el-button size="small" plain @click="resetAll">重置默认</el-button>
        </div>
      </div>
      <p class="desc">
        模拟一位 30 岁起、不交社保、不买房、不生子的人，靠投资 + 零散工作度过 60 年。
        调整下方参数，找出<b>躺平不破产</b>的条件。参数会自动保存在本地并写入地址栏，复制链接即可分享方案。
      </p>
      <p v-if="showLoadedHint" class="loaded-hint">
        {{ loadedFrom === 'url' ? '已从分享链接载入参数（修改后会覆盖链接内容）' : '已恢复上次编辑的参数' }}
        <el-button size="small" text @click="showLoadedHint = false">知道了</el-button>
      </p>
    </header>

    <el-alert
      v-if="conclusion === 'safe'"
      type="success"
      :closable="false"
      show-icon
      class="banner"
      title="可以躺平：悲观情景也未破产"
    >
      <template #default>
        即使在悲观收益率（{{ formatPercent(params.pessimisticReturn) }}）下，
        {{ analysis.targetAge }} 岁时仍有 {{ formatWan(pessimisticAnalysis.finalBalance) }}，
        全程最低点 {{ formatWan(pessimisticAnalysis.minBalance) }}（{{ pessimisticAnalysis.minBalanceAge }} 岁）；
        中性情景（{{ formatPercent(params.annualReturn) }}）下为
        {{ formatWan(analysis.finalBalance) }}。
      </template>
    </el-alert>
    <el-alert
      v-else-if="conclusion === 'risky'"
      type="warning"
      :closable="false"
      show-icon
      class="banner"
      title="中性可躺平，但悲观情景存在失效风险"
    >
      <template #default>
        悲观收益率（{{ formatPercent(params.pessimisticReturn) }}）下
        <template v-if="pessimisticAnalysis.firstNegativeAge >= 0">
          资产在 <b>{{ pessimisticAnalysis.firstNegativeAge }} 岁</b>耗尽，
          缺口 {{ formatWan(pessimisticAnalysis.finalBalance) }}（此后不再推演）；
        </template>
        <template v-else>目标年龄时资产正好耗尽；</template>
        中性情景（{{ formatPercent(params.annualReturn) }}）最终仍有
        {{ formatWan(analysis.finalBalance) }}，全程最低点 {{ formatWan(analysis.minBalance) }}
        （{{ analysis.minBalanceAge }} 岁）。
        建议压低生活费/医疗涨幅、提高本金或收益率。
      </template>
    </el-alert>
    <el-alert
      v-else
      type="error"
      :closable="false"
      show-icon
      class="banner"
      title="会破产，无法躺平到目标年龄"
    >
      <template #default>
        资产在
        <template v-if="analysis.firstNegativeAge >= 0">
          <b>{{ analysis.firstNegativeAge }} 岁</b>耗尽
        </template>
        <template v-else>目标年龄时耗尽</template>
        ，缺口 {{ formatWan(analysis.finalBalance) }}（此后不再推演），
        全程最低点为 {{ analysis.minBalanceAge }} 岁的 {{ formatYuan(analysis.minBalance) }}。
        试试提高本金 / 收益率，或压低生活费涨幅、停用换车/医疗支出。
      </template>
    </el-alert>

    <ParameterPanel v-model="params" />

    <StressTest :params="params" v-model:config="mcConfig" />

    <CashFlowChart
      :rows="rows"
      :optimistic-rows="optimisticRows"
      :pessimistic-rows="pessimisticRows"
    />

    <StatCards
      :analysis="analysis"
      :pessimistic-analysis="pessimisticAnalysis"
      :pessimistic-return="params.pessimisticReturn"
    />

    <DetailTable :rows="rows" :params="params" />
  </div>
</template>

<style scoped>
.page {
  max-width: 1180px;
  margin: 0 auto;
  padding: 28px 20px 48px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.header-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.header-actions {
  display: flex;
  gap: 8px;
}
.loaded-hint {
  font-size: 12px;
  color: var(--text-3);
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.header h1 {
  font-size: 26px;
  font-weight: 700;
  color: var(--text);
  margin: 0;
}
.header .sub {
  font-size: 18px;
  font-weight: 500;
  color: var(--text-2);
}
.desc {
  font-size: 14px;
  color: var(--text-2);
  margin: 6px 0 0;
  line-height: 1.6;
}
.desc b {
  color: var(--primary);
}
.banner {
  border-radius: 12px;
}
</style>
