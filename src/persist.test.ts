// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_MC_CONFIG, DEFAULT_PARAMS, cloneParams, type SimParams } from './lib'
import {
  clearPersistedState,
  defaultState,
  deserializeState,
  loadInitialState,
  MAX_CASHFLOW_ITEMS,
  readStateFromStorage,
  readStateFromUrl,
  sanitizeMcConfig,
  sanitizeParams,
  serializeState,
  stateToUrl,
  writeStateToStorage,
  STATE_VERSION,
  type AppState,
} from './persist'

// 必须与 happy-dom 文档同源，否则 history.replaceState 会抛 SecurityError
const BASE = 'http://localhost:3000/lie-flat/'

beforeEach(() => {
  clearPersistedState()
  window.history.replaceState(null, '', BASE)
})

describe('serialize / deserialize', () => {
  it('往返后参数（含收支项）与压力测试设置保持一致', () => {
    const state: AppState = {
      version: STATE_VERSION,
      params: {
        ...DEFAULT_PARAMS,
        startAge: 35,
        endAge: 88,
        initialPrincipal: 800_000,
        incomes: [
          {
            id: 'inc-a',
            name: '工资',
            amount: 4_321,
            frequency: 'month',
            cycle: 1,
            growth: 0.03,
            startAge: 35,
            endAge: 55,
            enabled: true,
          },
        ],
        expenses: [
          {
            id: 'exp-a',
            name: '换车',
            amount: 82_846.66,
            frequency: 'year',
            cycle: 10,
            growth: 0.01,
            startAge: 45,
            endAge: 88,
            enabled: false,
          },
        ],
      },
      mc: { iterations: 2500, returnVolatility: 0.15, inflationVolatility: 0.03 },
    }

    const restored = deserializeState(serializeState(state))
    expect(restored).not.toBeNull()
    expect(restored!.params).toEqual(state.params)
    expect(restored!.mc).toEqual(state.mc)
  })

  it('base64 或 JSON 损坏时返回 null', () => {
    expect(deserializeState('这不是合法 base64!!')).toBeNull()
    expect(deserializeState('')).toBeNull()
  })

  it('编码结果只含 URL 安全字符', () => {
    const encoded = serializeState(defaultState())
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  // D3：结构不兼容的旧链接直接作废回退默认值，不做 v1 → v2 迁移
  it('v1 旧链接（version 1）视为无效，回退默认值', () => {
    const legacy = serializeState({
      version: 1,
      params: { monthlySalary: 3_000, targetAge: 90 } as unknown as SimParams,
      mc: { ...DEFAULT_MC_CONFIG },
    })
    expect(deserializeState(legacy)).toBeNull()
  })

  it('缺 version 字段的 payload 视为当前版本（兼容手工构造的链接）', () => {
    const payload = serializeState({
      params: { startAge: 40, endAge: 50 } as unknown as SimParams,
      mc: {} as never,
    } as unknown as AppState)
    const restored = deserializeState(payload)
    expect(restored).not.toBeNull()
    expect(restored!.version).toBe(STATE_VERSION)
    expect(restored!.params.startAge).toBe(40)
    expect(restored!.params.endAge).toBe(50)
  })
})

describe('sanitizeParams：外部输入一律视为不可信', () => {
  it('类型不对的字段退回默认值', () => {
    const p = sanitizeParams({
      startAge: '40',
      endAge: null,
      initialPrincipal: Number.NaN,
      annualReturn: Number.NaN,
      optimisticReturn: 'x',
    })
    expect(p.startAge).toBe(DEFAULT_PARAMS.startAge)
    expect(p.endAge).toBe(DEFAULT_PARAMS.endAge)
    expect(p.initialPrincipal).toBe(DEFAULT_PARAMS.initialPrincipal)
    expect(p.annualReturn).toBe(DEFAULT_PARAMS.annualReturn)
    expect(p.optimisticReturn).toBe(DEFAULT_PARAMS.optimisticReturn)
    expect(p.pessimisticReturn).toBe(DEFAULT_PARAMS.pessimisticReturn)
  })

  it('荒谬的年龄被夹紧，防止 simulate 死循环', () => {
    const p = sanitizeParams({ startAge: 30, endAge: 1e9 })
    expect(p.endAge).toBeLessThanOrEqual(200)
    expect(p.endAge).toBeGreaterThan(p.startAge)
  })

  it('startAge >= endAge 时修正为合法区间', () => {
    const p = sanitizeParams({ startAge: 80, endAge: 40 })
    expect(p.endAge).toBe(p.startAge + 1)
  })

  it('越界数值被夹紧到安全边界', () => {
    const p = sanitizeParams({
      initialPrincipal: -100,
      annualReturn: 500,
      optimisticReturn: -100,
      pessimisticReturn: 1e18,
    })
    expect(p.initialPrincipal).toBe(0)
    expect(p.annualReturn).toBeLessThanOrEqual(10)
    expect(p.optimisticReturn).toBeGreaterThanOrEqual(-0.99)
    expect(p.pessimisticReturn).toBeLessThanOrEqual(10)
  })

  it('年龄字段取整', () => {
    const p = sanitizeParams({ startAge: 30.7, endAge: 90.2 })
    expect(Number.isInteger(p.startAge)).toBe(true)
    expect(Number.isInteger(p.endAge)).toBe(true)
    expect(p.startAge).toBe(31)
  })

  it('完全非对象输入也能返回合法参数（收支退回默认项）', () => {
    const fallback = cloneParams(DEFAULT_PARAMS)
    expect(sanitizeParams(null)).toEqual(fallback)
    expect(sanitizeParams('nope')).toEqual(fallback)
    expect(sanitizeParams(undefined)).toEqual(fallback)
  })

  it('旧链接缺少字段时用默认值补齐', () => {
    const p = sanitizeParams({ startAge: 40, endAge: 85 })
    expect(p.startAge).toBe(40)
    expect(p.endAge).toBe(85)
    expect(p.initialPrincipal).toBe(DEFAULT_PARAMS.initialPrincipal)
    expect(p.incomes).toEqual(DEFAULT_PARAMS.incomes)
  })
})

describe('sanitizeParams：收支项列表', () => {
  it('非法项被规整为合法项而不是丢弃', () => {
    const p = sanitizeParams({
      startAge: 30,
      endAge: 90,
      incomes: [null, { age: 'x' }, 42, 'oops'],
    })

    expect(p.incomes).toHaveLength(4)
    for (const entry of p.incomes) {
      expect(Number.isFinite(entry.amount)).toBe(true)
      expect(Number.isFinite(entry.growth)).toBe(true)
      expect(entry.startAge).toBeLessThanOrEqual(entry.endAge)
      expect(['month', 'year']).toContain(entry.frequency)
      expect(entry.name.length).toBeGreaterThan(0)
      expect(entry.id.length).toBeGreaterThan(0)
    }
    // 缺失的 id / name 生成确定性兜底值
    expect(p.incomes[0].id).toBe('income-0')
    expect(p.incomes[0].name).toBe('收入1')
    expect(p.incomes[2].id).toBe('income-2')
  })

  it('启停、频率与周期的非法值被归一', () => {
    const p = sanitizeParams({
      incomes: [
        { name: 'a', frequency: 'weekly', cycle: 3.6, enabled: 'yes' },
        { name: 'b', frequency: 'month', cycle: -5 },
        { name: 'c', frequency: 'year', cycle: 0 },
        { name: 'd', cycle: 1e9 },
      ],
    })

    expect(p.incomes[0].frequency).toBe('year')
    expect(p.incomes[0].cycle).toBe(4)
    expect(p.incomes[0].enabled).toBe(true) // 类型不对 → 退回默认启用
    expect(p.incomes[1].frequency).toBe('month')
    expect(p.incomes[1].cycle).toBe(0) // 负数夹到 0（= 仅一次）
    expect(p.incomes[2].cycle).toBe(0) // 0 是合法值，必须原样保留
    expect(p.incomes[3].cycle).toBe(200)
  })

  it('enabled = false 被保留', () => {
    const p = sanitizeParams({ expenses: [{ name: 'x', enabled: false }] })
    expect(p.expenses[0].enabled).toBe(false)
  })

  it('项内 startAge > endAge 时收敛为同一年', () => {
    const p = sanitizeParams({ expenses: [{ name: 'x', startAge: 70, endAge: 40 }] })
    expect(p.expenses[0].startAge).toBe(70)
    expect(p.expenses[0].endAge).toBe(70)
  })

  it('金额与涨幅越界被夹紧', () => {
    const p = sanitizeParams({
      expenses: [{ amount: 1e18, growth: 99 }, { amount: -5, growth: -99 }],
    })
    expect(p.expenses[0].amount).toBeLessThanOrEqual(1e12)
    expect(p.expenses[0].growth).toBeLessThanOrEqual(10)
    expect(p.expenses[1].amount).toBe(0)
    expect(p.expenses[1].growth).toBeGreaterThanOrEqual(-0.99)
  })

  it('名称与 id 超长被截断', () => {
    const p = sanitizeParams({
      incomes: [{ name: 'x'.repeat(100), id: 'i'.repeat(200) }],
    })
    expect(p.incomes[0].name).toHaveLength(24)
    expect(p.incomes[0].id).toHaveLength(64)
  })

  it('列表条数上限 50，收入与支出各自计算', () => {
    const p = sanitizeParams({
      incomes: Array.from({ length: 80 }, (_, i) => ({ name: `i${i}` })),
      expenses: Array.from({ length: 60 }, () => ({ amount: 1 })),
    })
    expect(p.incomes).toHaveLength(MAX_CASHFLOW_ITEMS)
    expect(p.expenses).toHaveLength(MAX_CASHFLOW_ITEMS)
  })

  it('显式空数组被尊重，非数组退回默认项', () => {
    expect(sanitizeParams({ incomes: [], expenses: [] }).incomes).toEqual([])
    expect(sanitizeParams({ incomes: [], expenses: [] }).expenses).toEqual([])
    expect(sanitizeParams({ incomes: 'oops' }).incomes).toEqual(DEFAULT_PARAMS.incomes)
  })
})

describe('sanitizeMcConfig', () => {
  it('夹紧到 UI 允许的范围', () => {
    expect(sanitizeMcConfig({ iterations: 1e9 }).iterations).toBe(5000)
    expect(sanitizeMcConfig({ iterations: 0 }).iterations).toBe(100)
    expect(sanitizeMcConfig({ returnVolatility: 9 }).returnVolatility).toBe(0.2)
    expect(sanitizeMcConfig({}).returnVolatility).toBe(DEFAULT_MC_CONFIG.returnVolatility)
    expect(sanitizeMcConfig(null).iterations).toBe(DEFAULT_MC_CONFIG.iterations)
  })
})

describe('URL 与 localStorage', () => {
  it('stateToUrl 生成可读回的同源链接', () => {
    const state = defaultState()
    state.params.expenses[0].amount = 2_800

    const url = stateToUrl(state, BASE)
    expect(url.startsWith(BASE)).toBe(true)

    const restored = readStateFromUrl(url)
    expect(restored!.params.expenses[0].amount).toBe(2_800)
  })

  it('没有 hash 时返回 null', () => {
    expect(readStateFromUrl(BASE)).toBeNull()
  })

  it('localStorage 往返', () => {
    const state = defaultState()
    state.params.endAge = 95
    writeStateToStorage(state)

    expect(readStateFromStorage()!.params.endAge).toBe(95)
    clearPersistedState()
    expect(readStateFromStorage()).toBeNull()
  })

  it('启动优先级：URL > localStorage > 默认值', () => {
    const stored = defaultState()
    stored.params.initialPrincipal = 1_111
    writeStateToStorage(stored)

    // 只有 storage 时用 storage
    expect(loadInitialState(BASE).from).toBe('storage')
    expect(loadInitialState(BASE).state.params.initialPrincipal).toBe(1_111)

    // URL 存在时优先 URL
    const shared = defaultState()
    shared.params.initialPrincipal = 2_222
    const withUrl = loadInitialState(stateToUrl(shared, BASE))
    expect(withUrl.from).toBe('url')
    expect(withUrl.state.params.initialPrincipal).toBe(2_222)

    // 都没有时用默认值
    clearPersistedState()
    expect(loadInitialState(BASE).from).toBe('default')
    expect(loadInitialState(BASE).state.params).toEqual(cloneParams(DEFAULT_PARAMS))
  })

  it('分享链接里的垃圾参数不会让模拟拿到非法输入', () => {
    const url = stateToUrl(
      { version: STATE_VERSION, params: { x: 1 } as unknown as SimParams, mc: {} as never },
      BASE,
    )
    const loaded = loadInitialState(url)
    expect(loaded.from).toBe('url')
    expect(loaded.state.params.startAge).toBe(DEFAULT_PARAMS.startAge)
    expect(loaded.state.params.endAge).toBe(DEFAULT_PARAMS.endAge)
    expect(loaded.state.params.incomes).toEqual(DEFAULT_PARAMS.incomes)
    expect(loaded.state.mc).toEqual(DEFAULT_MC_CONFIG)
  })
})
