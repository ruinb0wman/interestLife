// 方案持久化：把「参数 + 压力测试设置」编码进 URL hash 与 localStorage。
//
// URL 里的内容是不可信输入，因此 decode 一律先过 sanitize：
// 逐字段校验类型、夹紧到安全边界、与默认值合并（旧链接缺字段也不会炸）。
// 安全边界的存在意义之一是防止 targetAge 被构造成 1e9 之类导致 simulate 死循环。

import {
  DEFAULT_MC_CONFIG,
  DEFAULT_PARAMS,
  type McConfig,
  type OneOffExpense,
  type SimParams,
} from './lib'

export const STATE_VERSION = 1
export const HASH_KEY = 's'
export const STORAGE_KEY = 'interestlife.state.v1'

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
const MAX_ONE_OFF = 50

const NUMBER_LIMITS: Record<string, [number, number]> = {
  startAge: [AGE_MIN, AGE_MAX],
  targetAge: [AGE_MIN, AGE_MAX],
  salaryStopAge: [AGE_MIN, AGE_MAX],
  carReplaceInterval: [1, 100],
  monthlySalary: [0, MONEY_MAX],
  salaryGrowth: [RATE_MIN, RATE_MAX],
  monthlyLiving: [0, MONEY_MAX],
  livingGrowth: [RATE_MIN, RATE_MAX],
  initialPrincipal: [0, MONEY_MAX],
  annualReturn: [RATE_MIN, RATE_MAX],
  optimisticReturn: [RATE_MIN, RATE_MAX],
  pessimisticReturn: [RATE_MIN, RATE_MAX],
  initialCarPrice: [0, MONEY_MAX],
  carPriceGrowth: [RATE_MIN, RATE_MAX],
  medicalStartAge: [AGE_MIN, AGE_MAX],
  monthlyMedical: [0, MONEY_MAX],
  medicalGrowth: [RATE_MIN, RATE_MAX],
  monthlyExtraIncome: [0, MONEY_MAX],
  extraIncomeGrowth: [RATE_MIN, RATE_MAX],
  extraIncomeStopAge: [AGE_MIN, AGE_MAX],
}

const INTEGER_FIELDS = new Set([
  'startAge',
  'targetAge',
  'salaryStopAge',
  'carReplaceInterval',
  'medicalStartAge',
  'extraIncomeStopAge',
])

const BOOLEAN_FIELDS = [
  'enableSalary',
  'enableInvestment',
  'enableLiving',
  'enableCar',
  'enableMedical',
  'enableExtraIncome',
  'enableOneOff',
] as const

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.min(max, Math.max(min, n))
}

function sanitizeOneOff(raw: unknown): OneOffExpense[] {
  if (!Array.isArray(raw)) return []
  const out: OneOffExpense[] = []
  for (const item of raw.slice(0, MAX_ONE_OFF)) {
    const entry = asRecord(item)
    if (typeof entry.age !== 'number' || !Number.isFinite(entry.age)) continue
    if (typeof entry.amount !== 'number' || !Number.isFinite(entry.amount)) continue
    out.push({
      age: Math.round(clampNumber(entry.age, DEFAULT_PARAMS.startAge, AGE_MIN, AGE_MAX)),
      amount: clampNumber(entry.amount, 0, 0, MONEY_MAX),
    })
  }
  return out
}

/** 把任意输入规整成合法 SimParams：类型不对就退回默认值，数值越界就夹紧 */
export function sanitizeParams(raw: unknown): SimParams {
  const input = asRecord(raw)
  const out: Record<string, unknown> = { ...DEFAULT_PARAMS, oneOffExpenses: [] }

  for (const [key, [min, max]] of Object.entries(NUMBER_LIMITS)) {
    const fallback = DEFAULT_PARAMS[key as keyof SimParams] as number
    const value = clampNumber(input[key], fallback, min, max)
    out[key] = INTEGER_FIELDS.has(key) ? Math.round(value) : value
  }

  for (const key of BOOLEAN_FIELDS) {
    out[key] = typeof input[key] === 'boolean' ? input[key] : DEFAULT_PARAMS[key]
  }

  out.oneOffExpenses = sanitizeOneOff(input.oneOffExpenses)

  // 年龄顺序修正：否则 simulate() 会因 startAge >= targetAge 直接返回空集
  let startAge = out.startAge as number
  if (startAge >= (out.targetAge as number)) {
    if (startAge >= AGE_MAX) startAge = AGE_MAX - 1
    out.startAge = startAge
    out.targetAge = startAge + 1
  }

  // 这三项只做安全夹紧，不跟 targetAge 绑定：
  // 线上应用里把 targetAge 调小并不会回写它们，夹到 targetAge 反而会让
  // 「最近的参数」在刷新后静默变化。
  for (const key of ['salaryStopAge', 'medicalStartAge', 'extraIncomeStopAge']) {
    out[key] = Math.round(clampNumber(out[key], startAge, startAge, AGE_MAX))
  }

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
    params: { ...DEFAULT_PARAMS, oneOffExpenses: [] },
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

/** 反序列化 + 规整；仅在 base64 / JSON 损坏时返回 null */
export function deserializeState(text: string): AppState | null {
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(text))
    const raw = asRecord(parsed)
    if (Object.keys(raw).length === 0) return null
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
