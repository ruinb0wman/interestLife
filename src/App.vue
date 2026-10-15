<script setup lang="ts">
import { computed, h, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ElButton, ElMessage } from 'element-plus'
import {
  analyze,
  cloneParams,
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
import SnapshotPanel from './components/SnapshotPanel.vue'
import { findMatchingSnapshot, listSnapshots, type Snapshot } from './snapshots'

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

// ── 方案快照 ─────────────────────────────────────────────────────
const snapshotOpen = ref(false)
/**
 * 快照列表的副本，由 SnapshotPanel 在打开与每次增删后 emit 过来（抽屉才是列表的持有者）。
 * 另一个标签页在抽屉关着时写了快照，这里会一直旧到下次打开抽屉——只影响显示哪个名字。
 */
const snapshots = ref<Snapshot[]>(listSnapshots())
/**
 * 载入快照会递增这个 token，让 StressTest 把上一次的蒙特卡洛结果清掉。
 * 快照按选定方案只存参数、不存结果，而 MC 用 Math.random() 重跑不复现，
 * 所以留着上一套参数跑出来的「存活率」比清空更容易误导。
 */
const mcResetToken = ref(0)
/** 载入前的状态，供 toast 里的「撤销」回滚；两个数组已是深拷贝，不会与正在编辑的项共享引用 */
let undoState: { params: SimParams; mc: McConfig } | null = null

/**
 * 当前参数命中哪条快照——按指纹现算，不额外记「上次载入了谁」：
 * 载入后显示名字，改了参数名字自动消失，撤销回去或刷新页面重现，都不用单独维护状态。
 * 代价：参数每次变化都要规整 + 编码一次全套参数（实测 50 条快照 × 100 项约 2 ms）。
 */
const activeSnapshot = computed(() => findMatchingSnapshot(snapshots.value, params, mcConfig.value))

function loadSnapshot(snapshot: Snapshot) {
  undoState = { params: cloneParams(params), mc: { ...mcConfig.value } }
  Object.assign(params, cloneParams(snapshot.params))
  mcConfig.value = { ...snapshot.mc }
  mcResetToken.value++

  ElMessage({
    duration: 6000,
    message: h('span', null, [
      `已载入快照「${snapshot.name}」`,
      h(
        ElButton,
        { link: true, type: 'primary', size: 'small', style: 'margin-left: 8px', onClick: undoLoad },
        () => '撤销',
      ),
    ]),
  })
}

function undoLoad() {
  if (!undoState) return
  Object.assign(params, undoState.params)
  mcConfig.value = undoState.mc
  undoState = null
  mcResetToken.value++
  ElMessage.success('已撤销，回到载入前的参数')
}

function currentState(): AppState {
  return {
    version: STATE_VERSION,
    params: cloneParams(params),
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
  Object.assign(params, cloneParams(fresh.params))
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
        <h1>躺平财务模拟器</h1>
        <div class="header-actions">
          <span class="snap-group">
            <el-tag
              v-if="activeSnapshot"
              size="small"
              type="info"
              class="snap-tag"
              :title="`当前参数与快照「${activeSnapshot.name}」完全一致`"
            >
              {{ activeSnapshot.name }}
            </el-tag>
            <el-button size="small" plain @click="snapshotOpen = true">管理快照</el-button>
          </span>
          <el-button size="small" plain @click="copyShareLink">复制方案链接</el-button>
          <el-button size="small" plain @click="resetAll">重置默认</el-button>
        </div>
      </div>
      <p class="desc">
        模拟从「开始年龄」到「结束年龄」的逐年现金流：投资收益 + 各项收入 − 各项支出。
        调整收支项与收益率，找出<b>躺平不破产</b>的条件。参数会自动保存在本地并写入地址栏，复制链接即可分享方案。
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
        {{ analysis.endAge }} 岁时仍有 {{ formatWan(pessimisticAnalysis.finalBalance) }}，
        全程最低点 {{ formatWan(pessimisticAnalysis.minBalance) }}（{{ pessimisticAnalysis.minBalanceAge }} 岁）；
        普通情景（{{ formatPercent(params.annualReturn) }}）下为
        {{ formatWan(analysis.finalBalance) }}。
      </template>
    </el-alert>
    <el-alert
      v-else-if="conclusion === 'risky'"
      type="warning"
      :closable="false"
      show-icon
      class="banner"
      title="普通情景可躺平，但悲观情景存在失效风险"
    >
      <template #default>
        悲观收益率（{{ formatPercent(params.pessimisticReturn) }}）下
        <template v-if="pessimisticAnalysis.firstNegativeAge >= 0">
          资产在 <b>{{ pessimisticAnalysis.firstNegativeAge }} 岁</b>耗尽，
          缺口 {{ formatWan(pessimisticAnalysis.finalBalance) }}（此后不再推演）；
        </template>
        <template v-else>结束年龄时资产正好耗尽；</template>
        普通情景（{{ formatPercent(params.annualReturn) }}）最终仍有
        {{ formatWan(analysis.finalBalance) }}，全程最低点 {{ formatWan(analysis.minBalance) }}
        （{{ analysis.minBalanceAge }} 岁）。
        建议压低支出项涨幅、提高本金或收益率。
      </template>
    </el-alert>
    <el-alert
      v-else
      type="error"
      :closable="false"
      show-icon
      class="banner"
      title="会破产，无法躺平到结束年龄"
    >
      <template #default>
        资产在
        <template v-if="analysis.firstNegativeAge >= 0">
          <b>{{ analysis.firstNegativeAge }} 岁</b>耗尽
        </template>
        <template v-else>结束年龄时耗尽</template>
        ，缺口 {{ formatWan(analysis.finalBalance) }}（此后不再推演），
        全程最低点为 {{ analysis.minBalanceAge }} 岁的 {{ formatYuan(analysis.minBalance) }}。
        试试提高本金 / 收益率，或压低支出项涨幅、停用大额支出项。
      </template>
    </el-alert>

    <ParameterPanel v-model="params" />

    <StressTest :params="params" v-model:config="mcConfig" :reset-token="mcResetToken" />

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

    <DetailTable
      :rows="rows"
      :optimistic-rows="optimisticRows"
      :pessimistic-rows="pessimisticRows"
      :params="params"
    />

    <SnapshotPanel
      v-model:open="snapshotOpen"
      :params="params"
      :mc="mcConfig"
      @load="loadSnapshot"
      @change="snapshots = $event"
    />
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
  align-items: center;
}
/* 名字与按钮包在一起，窄屏换行时不会被拆开 */
.snap-group {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.snap-tag {
  max-width: 12em;
}
.snap-tag :deep(.el-tag__content) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
