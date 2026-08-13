<script setup lang="ts">
import { computed, reactive } from 'vue'
import { analyze, DEFAULT_PARAMS, simulate } from './lib'
import { formatWan, formatYuan } from './format'
import ParameterPanel from './components/ParameterPanel.vue'
import CashFlowChart from './components/CashFlowChart.vue'
import StatCards from './components/StatCards.vue'
import DetailTable from './components/DetailTable.vue'

let params = reactive({ ...DEFAULT_PARAMS })

const rows = computed(() => simulate(params))
const analysis = computed(() => analyze(rows.value, params))
</script>

<template>
  <div class="page">
    <header class="header">
      <h1>躺平财务模拟器 <span class="sub">· 不交社保版</span></h1>
      <p class="desc">
        模拟一位 30 岁起、不交社保、不买房、不生子的人，靠投资 + 零散工资度过 60 年。
        调整下方参数，找出<b>躺平不破产</b>的条件。
      </p>
    </header>

    <el-alert
      v-if="analysis.survives"
      type="success"
      :closable="false"
      show-icon
      class="banner"
      title="可以躺平：全程从未破产"
    >
      <template #default>
        {{ analysis.targetAge }} 岁时仍有 <b>{{ formatWan(analysis.finalBalance) }}</b>（{{
          formatYuan(analysis.finalBalance)
        }}）
        资产，全程最低点为 {{ analysis.minBalanceAge }} 岁的 {{ formatYuan(analysis.minBalance) }}。
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
        <template v-else>某一年</template>
        ，全程最低点为 {{ analysis.minBalanceAge }} 岁的 {{ formatYuan(analysis.minBalance) }}。
        试试提高本金 / 收益率，或压低生活费涨幅、停用换车支出。
      </template>
    </el-alert>

    <ParameterPanel v-model="params" />

    <CashFlowChart :rows="rows" />

    <StatCards :analysis="analysis" />

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
  color: #0f172a;
  margin: 0;
}
.header .sub {
  font-size: 18px;
  font-weight: 500;
  color: #64748b;
}
.desc {
  font-size: 14px;
  color: #64748b;
  margin: 6px 0 0;
  line-height: 1.6;
}
.desc b {
  color: #1e40af;
}
.banner {
  border-radius: 12px;
}
</style>
