// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_MC_CONFIG, DEFAULT_PARAMS, type SimParams } from './lib'
import {
  clearPersistedState,
  defaultState,
  deserializeState,
  loadInitialState,
  readStateFromStorage,
  readStateFromUrl,
  sanitizeMcConfig,
  sanitizeParams,
  serializeState,
  stateToUrl,
  writeStateToStorage,
  type AppState,
} from './persist'

// 必须与 happy-dom 文档同源，否则 history.replaceState 会抛 SecurityError
const BASE = 'http://localhost:3000/lie-flat/'

beforeEach(() => {
  clearPersistedState()
  window.history.replaceState(null, '', BASE)
})

describe('serialize / deserialize', () => {
  it('往返后参数与压力测试设置保持一致', () => {
    const state: AppState = {
      version: 1,
      params: {
        ...DEFAULT_PARAMS,
        startAge: 35,
        targetAge: 88,
        monthlyLiving: 4_321,
        oneOffExpenses: [{ age: 60, amount: 300_000 }],
        enableCar: false,
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
})

describe('sanitizeParams：外部输入一律视为不可信', () => {
  it('类型不对的字段退回默认值', () => {
    const p = sanitizeParams({
      startAge: '30',
      monthlyLiving: null,
      annualReturn: Number.NaN,
      enableCar: 'yes',
    })
    expect(p.startAge).toBe(DEFAULT_PARAMS.startAge)
    expect(p.monthlyLiving).toBe(DEFAULT_PARAMS.monthlyLiving)
    expect(p.annualReturn).toBe(DEFAULT_PARAMS.annualReturn)
    expect(p.enableCar).toBe(DEFAULT_PARAMS.enableCar)
  })

  it('荒谬的年龄被夹紧，防止 simulate 死循环', () => {
    const p = sanitizeParams({ startAge: 30, targetAge: 1e9 })
    expect(p.targetAge).toBeLessThanOrEqual(200)
    expect(p.targetAge).toBeGreaterThan(p.startAge)
  })

  it('startAge >= targetAge 时修正为合法区间', () => {
    const p = sanitizeParams({ startAge: 80, targetAge: 40 })
    expect(p.targetAge).toBe(p.startAge + 1)
  })

  it('越界数值被夹紧到安全边界', () => {
    const p = sanitizeParams({
      monthlyLiving: -100,
      annualReturn: 500,
      carReplaceInterval: 0,
      monthlyMedical: 1e18,
    })
    expect(p.monthlyLiving).toBe(0)
    expect(p.annualReturn).toBeLessThanOrEqual(10)
    expect(p.carReplaceInterval).toBeGreaterThanOrEqual(1)
    expect(p.monthlyMedical).toBeLessThanOrEqual(1e12)
  })

  it('一次性支出过滤掉非法项', () => {
    const p = sanitizeParams({
      oneOffExpenses: [
        { age: 60, amount: 100 },
        { age: 'x', amount: 100 },
        { age: 60, amount: Number.NaN },
        { amount: 100 },
        null,
        { age: 62, amount: 200 },
      ],
    })

    expect(p.oneOffExpenses).toEqual([
      { age: 60, amount: 100 },
      { age: 62, amount: 200 },
    ])
  })

  it('一次性支出条数上限 50，年龄夹紧为整数', () => {
    const p = sanitizeParams({
      oneOffExpenses: Array.from({ length: 80 }, () => ({ age: 300.7, amount: 1000 })),
    })

    expect(p.oneOffExpenses).toHaveLength(50)
    for (const entry of p.oneOffExpenses) {
      expect(Number.isInteger(entry.age)).toBe(true)
      expect(entry.age).toBeLessThanOrEqual(200)
    }
  })

  it('oneOffExpenses 不是数组时退化为空列表', () => {
    expect(sanitizeParams({ oneOffExpenses: 'oops' }).oneOffExpenses).toEqual([])
    expect(sanitizeParams({}).oneOffExpenses).toEqual([])
  })

  it('旧链接缺少字段时用默认值补齐', () => {
    const p = sanitizeParams({ startAge: 40, targetAge: 85 })
    expect(p.startAge).toBe(40)
    expect(p.targetAge).toBe(85)
    expect(p.monthlySalary).toBe(DEFAULT_PARAMS.monthlySalary)
    expect(p.enableInvestment).toBe(DEFAULT_PARAMS.enableInvestment)
  })

  it('完全非对象输入也能返回合法参数', () => {
    expect(sanitizeParams(null)).toEqual({ ...DEFAULT_PARAMS })
    expect(sanitizeParams('nope')).toEqual({ ...DEFAULT_PARAMS })
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
    state.params.monthlyLiving = 2_800

    const url = stateToUrl(state, BASE)
    expect(url.startsWith(BASE)).toBe(true)

    const restored = readStateFromUrl(url)
    expect(restored!.params.monthlyLiving).toBe(2_800)
  })

  it('没有 hash 时返回 null', () => {
    expect(readStateFromUrl(BASE)).toBeNull()
  })

  it('localStorage 往返', () => {
    const state = defaultState()
    state.params.targetAge = 95
    writeStateToStorage(state)

    expect(readStateFromStorage()!.params.targetAge).toBe(95)
    clearPersistedState()
    expect(readStateFromStorage()).toBeNull()
  })

  it('启动优先级：URL > localStorage > 默认值', () => {
    const stored = defaultState()
    stored.params.monthlyLiving = 1_111
    writeStateToStorage(stored)

    // 只有 storage 时用 storage
    expect(loadInitialState(BASE).from).toBe('storage')
    expect(loadInitialState(BASE).state.params.monthlyLiving).toBe(1_111)

    // URL 存在时优先 URL
    const shared = defaultState()
    shared.params.monthlyLiving = 2_222
    const withUrl = loadInitialState(stateToUrl(shared, BASE))
    expect(withUrl.from).toBe('url')
    expect(withUrl.state.params.monthlyLiving).toBe(2_222)

    // 都没有时用默认值
    clearPersistedState()
    expect(loadInitialState(BASE).from).toBe('default')
    expect(loadInitialState(BASE).state.params).toEqual(DEFAULT_PARAMS)
  })

  it('分享链接里的垃圾参数不会让模拟拿到非法输入', () => {
    const url = stateToUrl(
      { version: 1, params: { x: 1 } as unknown as SimParams, mc: {} as never },
      BASE,
    )
    const loaded = loadInitialState(url)
    expect(loaded.from).toBe('url')
    expect(loaded.state.params.startAge).toBe(DEFAULT_PARAMS.startAge)
    expect(loaded.state.mc).toEqual(DEFAULT_MC_CONFIG)
  })
})
