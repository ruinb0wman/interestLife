// 方案持久化：把「参数 + 压力测试设置」编码进 URL hash 与 localStorage。
//
// URL 里的内容是不可信输入，因此 decode 一律先过 sanitize：
// 逐字段校验类型、夹紧到安全边界、与默认值合并（旧链接缺字段也不会炸）。
// 安全边界的存在意义之一是防止 endAge 被构造成 1e9 之类导致 simulate 死循环。
//
// 版本策略：STATE_VERSION 变更意味着配置结构不兼容，旧链接/旧本地缓存直接作废
// 回退默认值（见 deserializeState 的 version 检查），不提供旧版本迁移。
// v2 → v3：周期的表示从「frequency(金额单位) + cycle(每 N 年)」
// 改为「period(once|month|year) + interval(每 N 个单位)」，字段语义不兼容。

import {
  DEFAULT_MC_CONFIG,
  DEFAULT_PARAMS,
  cloneItems,
  cloneParams,
  type CashFlowItem,
  type McConfig,
  type Period,
  type SimParams,
} from './lib'

export const STATE_VERSION = 3
export const HASH_KEY = 's'
export const STORAGE_KEY = 'interestlife.state.v3'
/** 每个收支项列表的条数上限（收入、支出各自计算） */
export const MAX_CASHFLOW_ITEMS = 50

/** 完整可分享状态 */
export interface AppState {
  version: number
  params: SimParams
  mc: McConfig
}

/** 安全边界：比 UI 允许的范围更宽松，只用于过滤外部输入里的荒谬值 */
const AGE_MIN = 0
const AGE_MAX = 200
const RATE_MIN = -0.99
const RATE_MAX = 10
const MONEY_MAX = 1e12
/** 周期间隔上限：每 1200 个月 ≈ 每 100 年，够表达任何现实排期 */
const INTERVAL_MAX = 1200
const NAME_MAX = 24
const ID_MAX = 64

const NUMBER_LIMITS: Record<string, [number, number]> = {
  startAge: [AGE_MIN, AGE_MAX],
  endAge: [AGE_MIN, AGE_MAX],
  initialPrincipal: [0, MONEY_MAX],
  annualReturn: [RATE_MIN, RATE_MAX],
  optimisticReturn: [RATE_MIN, RATE_MAX],
  pessimisticReturn: [RATE_MIN, RATE_MAX],
}

const INTEGER_FIELDS = new Set(['startAge', 'endAge'])
const PERIODS: readonly Period[] = ['once', 'month', 'year']

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.min(max, Math.max(min, n))
}

/**
 * 把任意输入规整成合法收支项。
 * 项内自洽：startAge > endAge 时收敛为同一年（该项永不触发对用户没有意义）。
 * 这里不把项内年龄绑定到全局 startAge/endAge——否则用户调整结束年龄会让
 * 已填好的项年龄被静默改写。
 */
function sanitizeCashFlowItem(raw: unknown, index: number, prefix: string): CashFlowItem {
  const entry = asRecord(raw)
  const label = prefix === 'income' ? '收入' : '支出'

  const startAge = Math.round(clampNumber(entry.startAge, DEFAULT_PARAMS.startAge, AGE_MIN, AGE_MAX))
  const endAge = Math.max(
    startAge,
    Math.round(clampNumber(entry.endAge, startAge, AGE_MIN, AGE_MAX)),
  )

  const period = PERIODS.includes(entry.period as Period) ? (entry.period as Period) : 'month'

  const rawName = typeof entry.name === 'string' ? entry.name.trim().slice(0, NAME_MAX) : ''
  const rawId = typeof entry.id === 'string' ? entry.id.trim().slice(0, ID_MAX) : ''

  return {
    id: rawId.length > 0 ? rawId : `${prefix}-${index}`,
    name: rawName.length > 0 ? rawName : `${label}${index + 1}`,
    amount: clampNumber(entry.amount, 0, 0, MONEY_MAX),
    period,
    // 「仅一次」没有周期间隔的概念，强制回 1 避免留下误导性数值
    interval:
      period === 'once' ? 1 : Math.round(clampNumber(entry.interval, 1, 1, INTERVAL_MAX)),
    growth: clampNumber(entry.growth, 0, RATE_MIN, RATE_MAX),
    startAge,
    endAge,
    enabled: typeof entry.enabled === 'boolean' ? entry.enabled : true,
  }
}

function sanitizeItems(raw: unknown, prefix: string, fallback: CashFlowItem[]): CashFlowItem[] {
  // 与标量字段一致：类型不对（含缺失 / null）退回默认项，显式空数组则尊重用户的选择
  if (!Array.isArray(raw)) return cloneItems(fallback)
  return raw
    .slice(0, MAX_CASHFLOW_ITEMS)
    .map((item, index) => sanitizeCashFlowItem(item, index, prefix))
}

/** 把任意输入规整成合法 SimParams：类型不对就退回默认值，数值越界就夹紧 */
export function sanitizeParams(raw: unknown): SimParams {
  const input = asRecord(raw)
  const out: Record<string, unknown> = { ...DEFAULT_PARAMS }

  for (const [key, [min, max]] of Object.entries(NUMBER_LIMITS)) {
    const fallback = DEFAULT_PARAMS[key as keyof SimParams] as number
    const value = clampNumber(input[key], fallback, min, max)
    out[key] = INTEGER_FIELDS.has(key) ? Math.round(value) : value
  }

  // 年龄顺序修正：否则 simulate() 会因 startAge >= endAge 直接返回空集
  let startAge = out.startAge as number
  if (startAge >= (out.endAge as number)) {
    if (startAge >= AGE_MAX) startAge = AGE_MAX - 1
    out.startAge = startAge
    out.endAge = startAge + 1
  }

  out.incomes = sanitizeItems(input.incomes, 'income', DEFAULT_PARAMS.incomes)
  out.expenses = sanitizeItems(input.expenses, 'expense', DEFAULT_PARAMS.expenses)

  return out as unknown as SimParams
}

/** 把任意输入规整成合法 McConfig */
export function sanitizeMcConfig(raw: unknown): McConfig {
  const input = asRecord(raw)
  return {
    iterations: Math.round(
      clampNumber(input.iterations, DEFAULT_MC_CONFIG.iterations, 100, 5000),
    ),
    returnVolatility: clampNumber(
      input.returnVolatility,
      DEFAULT_MC_CONFIG.returnVolatility,
      0.005,
      0.2,
    ),
    inflationVolatility: clampNumber(
      input.inflationVolatility,
      DEFAULT_MC_CONFIG.inflationVolatility,
      0.005,
      0.2,
    ),
  }
}

export function defaultState(): AppState {
  return {
    version: STATE_VERSION,
    params: cloneParams(DEFAULT_PARAMS),
    mc: { ...DEFAULT_MC_CONFIG },
  }
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): string {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='))
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function serializeState(state: AppState): string {
  return toBase64Url(JSON.stringify(state))
}

/**
 * 反序列化 + 规整。
 * 仅在 base64 / JSON 损坏，或版本号不匹配（如 v1 旧链接）时返回 null。
 * 缺 version 字段的 payload 视为当前版本，保持与「旧链接缺字段也不炸」一致的宽容度。
 */
export function deserializeState(text: string): AppState | null {
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(text))
    const raw = asRecord(parsed)
    if (Object.keys(raw).length === 0) return null
    if (typeof raw.version === 'number' && raw.version !== STATE_VERSION) return null
    return {
      version: STATE_VERSION,
      params: sanitizeParams(raw.params),
      mc: sanitizeMcConfig(raw.mc),
    }
  } catch {
    return null
  }
}

/** 供分享按钮使用的完整链接；使用 hash，避免服务端参与 */
export function stateToUrl(state: AppState, href?: string): string {
  const base = href ?? (typeof window === 'undefined' ? '' : window.location.href)
  const url = new URL(base)
  url.hash = `${HASH_KEY}=${serializeState(state)}`
  return url.toString()
}

export function readStateFromUrl(href?: string): AppState | null {
  if (typeof window === 'undefined') return null
  const url = new URL(href ?? window.location.href)
  const raw = new URLSearchParams(url.hash.replace(/^#/, '')).get(HASH_KEY)
  return raw ? deserializeState(raw) : null
}

export function readStateFromStorage(): AppState | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? deserializeState(raw) : null
  } catch {
    return null
  }
}

export function writeStateToStorage(state: AppState): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, serializeState(state))
  } catch {
    // 隐私模式 / 配额满：静默降级为「不保存」
  }
}

export function clearPersistedState(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 忽略
  }
}

/** 启动时的状态来源优先级：URL > localStorage > 默认值 */
export function loadInitialState(href?: string): { state: AppState; from: 'url' | 'storage' | 'default' } {
  const fromUrl = readStateFromUrl(href)
  if (fromUrl) return { state: fromUrl, from: 'url' }

  const fromStorage = readStateFromStorage()
  if (fromStorage) return { state: fromStorage, from: 'storage' }

  return { state: defaultState(), from: 'default' }
}
