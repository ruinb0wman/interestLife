<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { analyze, simulate, simulateScenario, type McConfig, type SimParams } from '../lib'
import { formatPercent, formatWan } from '../format'
import {
  MAX_SNAPSHOTS,
  SNAPSHOT_NAME_MAX,
  addSnapshot,
  createSnapshot,
  defaultSnapshotName,
  formatSavedAt,
  listSnapshots,
  removeSnapshot,
  renameSnapshot,
  uniqueSnapshotName,
  writeSnapshots,
  type Snapshot,
} from '../snapshots'

const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ params: SimParams; mc: McConfig }>()
const emit = defineEmits<{ load: [snapshot: Snapshot]; change: [count: number] }>()

const items = ref<Snapshot[]>(listSnapshots())
const renamingId = ref<string | null>(null)
const renameDraft = ref('')
/** 上次写入是否成功；失败时内存里的列表不再与存储一致，不能再拿存储去覆盖它 */
const persistFailed = ref(false)

// 抽屉是随 App 一起挂载的，列表只在 setup 时读一次。
// 打开时重读：另一个标签页可能刚存过快照（写入失败时例外，否则会把内存里的条目刷掉）。
watch(open, (isOpen) => {
  if (isOpen && !persistFailed.value) items.value = listSnapshots()
})

interface SnapshotRow {
  snapshot: Snapshot
  /** 悲观情景能否躺平到结束年龄 */
  survives: boolean
  /** 悲观情景的资产耗尽年龄；未耗尽、或直到结束年龄才≤0 时为 -1 */
  depletedAge: number
  /** 普通情景在结束年龄的年末本金 */
  finalBalance: number
}

// 每条快照的结论都是点击/渲染时现算的：simulate + analyze 各 < 1 ms，
// 缓存反而要处理失效，不值当。
const rows = computed<SnapshotRow[]>(() =>
  items.value.map((snapshot) => {
    const neutral = analyze(simulate(snapshot.params), snapshot.params)
    const pessimistic = analyze(
      simulateScenario(snapshot.params, snapshot.params.pessimisticReturn),
      snapshot.params,
    )
    return {
      snapshot,
      survives: pessimistic.survives,
      depletedAge: pessimistic.firstNegativeAge,
      finalBalance: neutral.finalBalance,
    }
  }),
)

/** 统一的落地：先更新列表，再持久化，失败时明确告知（不然刷新就没了） */
function commit(next: Snapshot[], okMessage?: string) {
  items.value = next
  const ok = writeSnapshots(next)
  persistFailed.value = !ok
  if (!ok) {
    ElMessage.warning('快照没能写入本地存储（隐私模式或已满），本次改动只在当前页面有效')
  } else if (okMessage) {
    ElMessage.success(okMessage)
  }
  emit('change', next.length)
}

async function saveCurrent() {
  if (items.value.length >= MAX_SNAPSHOTS) {
    ElMessage.warning(`最多保存 ${MAX_SNAPSHOTS} 条快照，请先删除一些再保存`)
    return
  }

  let name = defaultSnapshotName()
  try {
    const { value } = await ElMessageBox.prompt('给这份快照起个名字，方便以后翻回来对比', '保存快照', {
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputValue: name,
      inputPlaceholder: '如：保守方案 / 45 岁辞职',
      inputValidator: (value: string) => (value ?? '').trim().length > 0 || '名称不能为空',
    })
    name = value
  } catch {
    return // 用户取消
  }

  const finalName = uniqueSnapshotName(items.value, name.trim().slice(0, SNAPSHOT_NAME_MAX))
  const snapshot = createSnapshot(props.params, props.mc, finalName)
  commit(addSnapshot(items.value, snapshot), `已保存快照「${snapshot.name}」`)
}

function startRename(snapshot: Snapshot) {
  renamingId.value = snapshot.id
  renameDraft.value = snapshot.name
}

function commitRename() {
  const id = renamingId.value
  if (!id) return
  renamingId.value = null
  const next = renameSnapshot(items.value, id, renameDraft.value)
  if (next !== items.value) commit(next)
}

async function confirmRemove(snapshot: Snapshot) {
  try {
    await ElMessageBox.confirm(`删除快照「${snapshot.name}」？删除后无法恢复。`, '删除快照', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return // 用户取消
  }
  commit(removeSnapshot(items.value, snapshot.id), `已删除快照「${snapshot.name}」`)
}

function load(snapshot: Snapshot) {
  emit('load', snapshot)
  open.value = false
}

/** 悲观情景一句话结论 */
function pessimisticText(row: SnapshotRow): string {
  if (row.survives) return '悲观情景也能躺平'
  if (row.depletedAge >= 0) return `悲观情景 ${row.depletedAge} 岁耗尽`
  return '悲观情景结束时资产 ≤ 0'
}
</script>

<template>
  <el-drawer v-model="open" title="方案快照" :size="440">
    <div class="snap-toolbar">
      <el-button type="primary" :disabled="items.length >= MAX_SNAPSHOTS" @click="saveCurrent">
        保存当前参数
      </el-button>
      <span class="snap-count">{{ items.length }} / {{ MAX_SNAPSHOTS }}</span>
    </div>

    <p class="snap-hint">
      快照只保存参数（收益率与全部收支项）。载入后主图、指标卡、逐年明细会实时重算，
      结果与保存时一致；蒙特卡洛是随机模拟、重跑不复现，所以载入后需要重新运行。
    </p>

    <div v-if="rows.length === 0" class="snap-empty">
      还没有快照。调好一套参数后，点上面的按钮存一份，之后随时切回来。
    </div>

    <ul v-else class="snap-list">
      <li v-for="row in rows" :key="row.snapshot.id" class="snap-item">
        <div class="snap-head">
          <el-input
            v-if="renamingId === row.snapshot.id"
            v-model="renameDraft"
            class="snap-rename"
            size="small"
            :maxlength="SNAPSHOT_NAME_MAX"
            @keyup.enter="commitRename"
            @blur="commitRename"
          />
          <span v-else class="snap-name" :title="row.snapshot.name">{{ row.snapshot.name }}</span>
          <span class="snap-time">{{ formatSavedAt(row.snapshot.savedAt) }}</span>
        </div>

        <div class="snap-meta">
          {{ row.snapshot.params.startAge }}→{{ row.snapshot.params.endAge }} 岁 · 本金
          {{ formatWan(row.snapshot.params.initialPrincipal) }} · 收益
          {{ formatPercent(row.snapshot.params.annualReturn) }}（悲观
          {{ formatPercent(row.snapshot.params.pessimisticReturn) }}）
        </div>

        <div class="snap-meta">
          <span :class="row.survives ? 'ok' : 'bad'">{{ pessimisticText(row) }}</span>
          · 普通终值 {{ formatWan(row.finalBalance) }}
        </div>

        <div class="snap-actions">
          <el-button size="small" type="primary" plain @click="load(row.snapshot)">载入</el-button>
          <el-button size="small" plain @click="startRename(row.snapshot)">重命名</el-button>
          <el-button size="small" plain @click="confirmRemove(row.snapshot)">删除</el-button>
        </div>
      </li>
    </ul>
  </el-drawer>
</template>

<style scoped>
.snap-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.snap-count {
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.snap-hint {
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.6;
  margin: 10px 0 16px;
}
.snap-empty {
  font-size: 13px;
  color: var(--text-3);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  padding: 20px 14px;
  text-align: center;
  line-height: 1.6;
}
.snap-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.snap-item {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  background: var(--toggle-bg);
}
.snap-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 24px;
}
.snap-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.snap-rename {
  flex: 1;
}
.snap-time {
  font-size: 12px;
  color: var(--text-3);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
.snap-meta {
  font-size: 12px;
  color: var(--text-2);
  margin-top: 6px;
  line-height: 1.5;
}
.snap-meta .ok {
  color: var(--green);
}
.snap-meta .bad {
  color: var(--warning);
}
.snap-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}
</style>
