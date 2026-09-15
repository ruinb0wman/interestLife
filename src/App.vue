<script setup lang="ts">
import { computed, reactive } from 'vue'
import { analyze, DEFAULT_PARAMS, simulate, simulateScenario, verdict } from './lib'
import { formatPercent, formatWan, formatYuan } from './format'
import ParameterPanel from './components/ParameterPanel.vue'
import CashFlowChart from './components/CashFlowChart.vue'
import StatCards from './components/StatCards.vue'
import DetailTable from './components/DetailTable.vue'
import StressTest from './components/StressTest.vue'

let params = reactive({
  ...DEFAULT_PARAMS,
  oneOffExpenses: DEFAULT_PARAMS.oneOffExpenses.map((o) => ({ ...o })),
})

const rows = computed(() => simulate(params))
const optimisticRows = computed(() => simulateScenario(params, params.optimisticReturn))
const pessimisticRows = computed(() => simulateScenario(params, params.pessimisticReturn))
const analysis = computed(() => analyze(rows.value, params))
const pessimisticAnalysis = computed(() => analyze(pessimisticRows.value, params))
const conclusion = computed(() => verdict(analysis.value, pessimisticAnalysis.value))
</script>

<template>
  <div class="page">
    <header class="header">
      <h1>躺平财务模拟器 <span class="sub">· 不交社保版</span></h1>
      <p class="desc">
        模拟一位 30 岁起、不交社保、不买房、不生子的人，靠投资 + 零散工作度过 60 年。
        调整下方参数，找出<b>躺平不破产</b>的条件。
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
        悲观收益率（{{ formatPercent(params.pessimisticReturn) }}）下本金在
        <template v-if="pessimisticAnalysis.firstNegativeAge >= 0">
          <b>{{ pessimisticAnalysis.firstNegativeAge }} 岁</b>首现负数
        </template>
        <template v-else>目标年龄时耗尽</template>
        （最低 {{ formatYuan(pessimisticAnalysis.minBalance) }}）。
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
        本金在
        <template v-if="analysis.firstNegativeAge >= 0">
          <b>{{ analysis.firstNegativeAge }} 岁</b>首现负数
        </template>
        <template v-else>目标年龄时耗尽</template>
        ，全程最低点为 {{ analysis.minBalanceAge }} 岁的 {{ formatYuan(analysis.minBalance) }}。
        试试提高本金 / 收益率，或压低生活费涨幅、停用换车/医疗支出。
      </template>
    </el-alert>

    <ParameterPanel v-model="params" />

    <StressTest :params="params" />

    <CashFlowChart
      :rows="rows"
      :optimistic-rows="optimisticRows"
      :pessimistic-rows="pessimisticRows"
    />

    <StatCards
      :analysis="analysis"
      :pessimistic-balance="pessimisticAnalysis.finalBalance"
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
