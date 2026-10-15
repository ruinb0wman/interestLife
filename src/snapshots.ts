// 方案快照：把「参数 + 压力测试设置」命名保存到 localStorage，方便回头翻看/对比。
//
// 为什么只存参数、不存计算结果：
//   主曲线 / 三情景 / 指标卡 / 逐年明细全是纯函数（simulate / simulateScenario / analyze），
//   载入后实时重算，结果与保存时逐位一致；把这些 rows 存下来只买到「零计算」和
//   「公式改了还能看旧数」，却让每条快照从 ~1 KB 涨到 ~55 KB。
//   唯一的例外是蒙特卡洛——它用 Math.random()，重跑一定不复现（那时 99.7%、这次可能 100%），
//   所以快照刻意不存 MC 结果，而是由 UI 明确告知「载入后 MC 需要重新运行」，
//   不能让用户以为快照"记得"当时的存活率（存结果就得把 MC 状态从 StressTest 里提上来，
//   在「只存参数」这个前提下属于多余改动）。
//
// 存储边界：这里的输入（localStorage 内容）与 persist.ts 的 URL 一样不可信，
// 一律先 sanitizeParams / sanitizeMcConfig 收口，坏数据只丢字段、不炸整页。
// key 带 STATE_VERSION：与 persist.ts 的策略一致，参数结构不兼容时整批作废（不做迁移）。

import { cloneParams, createItemId, type CashFlowItem, type McConfig, type SimParams } from './lib'
import { STATE_VERSION, asRecord, sanitizeMcConfig, sanitizeParams } from './persist'

export const SNAPSHOT_KEY = `interestlife.snapshots.v${STATE_VERSION}`
/** 条数上限：单条约 1 KB，50 条 ~50 KB，远低于 localStorage 的 ~5 MB 配额 */
export const MAX_SNAPSHOTS = 50
export const SNAPSHOT_NAME_MAX = 40
const ID_MAX = 64

/** 一条快照：参数 + 压力测试设置 + 展示用的元信息 */
export interface Snapshot {
  id: string
  name: string
  /** ISO 8601 时间戳，列表里格式化成「09-15 21:40」 */
  savedAt: string
  params: SimParams
  mc: McConfig
}

// 注意：Snapshot 是只读记录（创建后不改），但字段没加 readonly 修饰——
// sanitizeSnapshot 需要先构造再规整，加 readonly 会把构造路径也锁死。

/**
 * 访问 localStorage。
 * 不用 `typeof localStorage === 'undefined'` 一把梭：某些沙箱 iframe / 隐私模式下
 * 光是读取这个属性本身就会抛 SecurityError，所以连判别都要包在 try 里。
 */
function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function sanitizeName(raw: unknown, fallback: string): string {
  const name = typeof raw === 'string' ? raw.trim().slice(0, SNAPSHOT_NAME_MAX) : ''
  return name.length > 0 ? name : fallback
}

/** 把任意输入规整成合法快照：缺 id / 名称 / 时间戳时补齐，参数与 MC 设置走各自的安全收口 */
function sanitizeSnapshot(raw: unknown, index: number): Snapshot {
  const entry = asRecord(raw)
  const savedAt =
    typeof entry.savedAt === 'string' && !Number.isNaN(Date.parse(entry.savedAt))
      ? entry.savedAt
      : new Date().toISOString()
  const rawId = typeof entry.id === 'string' ? entry.id.trim().slice(0, ID_MAX) : ''

  return {
    id: rawId.length > 0 ? rawId : `snap-${index}`,
    name: sanitizeName(entry.name, `快照 ${index + 1}`),
    savedAt,
    params: sanitizeParams(entry.params),
    mc: sanitizeMcConfig(entry.mc),
  }
}

/** 读取全部快照（最近的在前）；存储不可用或内容损坏时静默返回空列表 */
export function listSnapshots(): Snapshot[] {
  const store = storage()
  if (!store) return []
  try {
    const raw = store.getItem(SNAPSHOT_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.slice(0, MAX_SNAPSHOTS).map(sanitizeSnapshot)
  } catch {
    return []
  }
}

/**
 * 覆盖写入快照列表。
 * 返回 false 表示没写进去（隐私模式、配额满）——调用方必须提示用户，
 * 否则用户会以为「保存成功」但其实一刷新就没了。
 */
export function writeSnapshots(items: Snapshot[]): boolean {
  const store = storage()
  if (!store) return false
  try {
    store.setItem(SNAPSHOT_KEY, JSON.stringify(items.slice(0, MAX_SNAPSHOTS)))
    return true
  } catch {
    return false
  }
}

/** 「09-15 21:40 方案」：默认名，用户可在保存弹窗里改 */
export function defaultSnapshotName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())} 方案`
}

/** ISO 时间戳 → 「09-15 21:40」；解析失败时原样返回，别在列表里显示 NaN */
export function formatSavedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 重名时追加序号（「方案 2」），避免列表里出现两条一模一样的名字 */
export function uniqueSnapshotName(items: Snapshot[], name: string): string {
  const used = new Set(items.map((item) => item.name))
  if (!used.has(name)) return name
  for (let i = 2; i <= MAX_SNAPSHOTS + 1; i++) {
    const suffix = ` ${i}`
    const base = name.slice(0, SNAPSHOT_NAME_MAX - suffix.length)
    const candidate = `${base}${suffix}`
    if (!used.has(candidate)) return candidate
  }
  return name
}

/** 构造一条新快照（参数一律深拷贝，避免与正在编辑的响应式对象共享引用） */
export function createSnapshot(
  params: SimParams,
  mc: McConfig,
  name?: string,
  now: Date = new Date(),
): Snapshot {
  return {
    id: createItemId(),
    name: sanitizeName(name, defaultSnapshotName(now)),
    savedAt: now.toISOString(),
    params: cloneParams(params),
    mc: { ...mc },
  }
}

/** 新快照插到最前（最近的在最上面），超上限时丢弃最旧的 */
export function addSnapshot(items: Snapshot[], snapshot: Snapshot): Snapshot[] {
  return [snapshot, ...items].slice(0, MAX_SNAPSHOTS)
}

/** 删除指定快照；id 不存在时原样返回（保持引用不变，便于调用方判断有无改动） */
export function removeSnapshot(items: Snapshot[], id: string): Snapshot[] {
  const next = items.filter((item) => item.id !== id)
  return next.length === items.length ? items : next
}

/**
 * 指纹里要丢掉收支项的 id。
 * id 是列表渲染用的身份（createItemId() 每次页面加载都是新随机值），不是「方案」的一部分：
 * 「重置默认」会重新生成一套 id，同一个方案在两台设备/两次刷新之间 id 也必然不同，
 * 把它们算进去就会退化成「刷新一下或重置一下就不认识自己的快照了」。
 * 项的顺序仍在指纹里——顺序不同就不算同一套参数，宁可要求严一点。
 */
function withoutIds(items: CashFlowItem[]): Omit<CashFlowItem, 'id'>[] {
  return items.map(({ id: _id, ...rest }) => rest)
}

/**
 * 状态指纹：把「参数 + 压力测试设置」归一化后编码成可直接比较的字符串。
 *
 * 两侧都必须先过各自的规整函数再编码：当前参数来自正在编辑的响应式对象，快照参数来自
 * localStorage 往返 + sanitizeSnapshot，二者在「合法但写法不同」的输入上（interval 越界、
 * 缺 enabled、年龄带小数、字段顺序不同…）会被规整成同一个结果。少了这一步就会出现
 * 「明明和快照一模一样，界面却不认」的假阴性——这属于指纹方案唯一的坑，所以两侧都在这里收口。
 *
 * 用 JSON 而不是 serializeState()：指纹只需要「可比较」，不需要进 URL，省掉一次 base64。
 */
export function stateFingerprint(params: SimParams, mc: McConfig): string {
  const normalized = sanitizeParams(params)
  return JSON.stringify({
    version: STATE_VERSION,
    params: {
      ...normalized,
      incomes: withoutIds(normalized.incomes),
      expenses: withoutIds(normalized.expenses),
    },
    mc: sanitizeMcConfig(mc),
  })
}

/**
 * 找出「当前参数就是它」的快照。
 * 列表是最近的在前，所以多条快照参数相同时命中的是最新那条（不额外提示，见下方说明）。
 *
 * 代价已实测：50 条快照 × 100 个收支项时约 2 ms（现实规模 22 项约 0.9 ms），
 * 与 simulate() 同量级，还不足以需要按快照缓存指纹。
 *
 * 注意 MC 也参与指纹：载入后只调压力测试的迭代次数，名字会消失。
 * 要改成「只看参数不看 MC」就把上面的 mc 摘掉。
 */
export function findMatchingSnapshot(
  items: Snapshot[],
  params: SimParams,
  mc: McConfig,
): Snapshot | null {
  const target = stateFingerprint(params, mc)
  return items.find((item) => stateFingerprint(item.params, item.mc) === target) ?? null
}

// 快照是**只读记录**：创建之后不得再修改（名字也不行）。
// 参数在 createSnapshot 里就是深拷贝，所以不可变是结构性保证；
// 曾经有过 renameSnapshot()，现已删掉——保留它等于给「史前记录可被改写」留后门。
