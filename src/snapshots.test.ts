// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_MC_CONFIG, DEFAULT_PARAMS, cloneParams } from './lib'
import { STATE_VERSION } from './persist'
import {
  MAX_SNAPSHOTS,
  SNAPSHOT_KEY,
  addSnapshot,
  createSnapshot,
  defaultSnapshotName,
  findMatchingSnapshot,
  formatSavedAt,
  listSnapshots,
  removeSnapshot,
  stateFingerprint,
  uniqueSnapshotName,
  writeSnapshots,
  type Snapshot,
} from './snapshots'

function snap(name: string, overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    ...createSnapshot(DEFAULT_PARAMS, DEFAULT_MC_CONFIG, name, new Date('2026-09-15T13:40:00Z')),
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('快照存储 key', () => {
  // 参数结构不兼容时（STATE_VERSION 变更）整批作废，与 persist.ts 的策略一致
  it('key 带 STATE_VERSION，版本一变就换 key', () => {
    expect(SNAPSHOT_KEY).toBe(`interestlife.snapshots.v${STATE_VERSION}`)
  })
})

describe('createSnapshot', () => {
  it('深拷贝参数，之后改动原对象不影响快照', () => {
    const params = cloneParams(DEFAULT_PARAMS)
    const created = createSnapshot(params, DEFAULT_MC_CONFIG, 'A')

    params.initialPrincipal = 999
    params.incomes[0].amount = 12345

    expect(created.params.initialPrincipal).toBe(DEFAULT_PARAMS.initialPrincipal)
    expect(created.params.incomes[0].amount).toBe(DEFAULT_PARAMS.incomes[0].amount)
    expect(created.name).toBe('A')
  })

  it('名称为空时退回默认名（月份-日期 时:分 方案）', () => {
    const created = createSnapshot(DEFAULT_PARAMS, DEFAULT_MC_CONFIG, '   ')
    expect(created.name).toBe(defaultSnapshotName())
    expect(created.name).toMatch(/\d{2}-\d{2} \d{2}:\d{2} 方案/)
  })
})

describe('listSnapshots / writeSnapshots', () => {
  it('往返：写入后读回同样的参数与设置', () => {
    const params = cloneParams(DEFAULT_PARAMS)
    params.initialPrincipal = 1_234_567
    params.annualReturn = 0.065
    const created = createSnapshot(params, { ...DEFAULT_MC_CONFIG, iterations: 2500 }, '往返')

    expect(writeSnapshots([created])).toBe(true)
    const [back] = listSnapshots()

    expect(back.name).toBe('往返')
    expect(back.params.initialPrincipal).toBe(1_234_567)
    expect(back.params.annualReturn).toBe(0.065)
    expect(back.params.incomes).toEqual(params.incomes)
    expect(back.mc.iterations).toBe(2500)
  })

  it('内容损坏（非法 JSON / 不是数组）时返回空列表而不是抛异常', () => {
    localStorage.setItem(SNAPSHOT_KEY, '{ this is not json')
    expect(listSnapshots()).toEqual([])

    localStorage.setItem(SNAPSHOT_KEY, '{"a":1}')
    expect(listSnapshots()).toEqual([])
  })

  it('单条快照字段越界/缺失时被规整，不牵连其它条', () => {
    localStorage.setItem(
      SNAPSHOT_KEY,
      JSON.stringify([
        { name: '  ' },
        { id: 'x', savedAt: '这不是时间', params: { startAge: -50, endAge: 1e9 } },
      ]),
    )
    const items = listSnapshots()

    expect(items).toHaveLength(2)
    // 缺 params → 退回默认参数；名字空白 → 序号兜底
    expect(items[0].params.initialPrincipal).toBe(DEFAULT_PARAMS.initialPrincipal)
    expect(items[0].name).toBe('快照 1')
    expect(items[0].id).toBe('snap-0')
    // 非法时间戳不能变成 NaN 显示在列表里
    expect(Number.isNaN(Date.parse(items[1].savedAt))).toBe(false)
    expect(items[1].name).toBe('快照 2')
    // 荒谬年龄被夹紧，而不是让 simulate 拿到 1e9
    expect(items[1].params.endAge).toBeLessThanOrEqual(200)
  })

  it('读回时截断到上限条数', () => {
    const many = Array.from({ length: MAX_SNAPSHOTS + 10 }, (_, i) => snap(`S${i}`))
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(many))
    expect(listSnapshots()).toHaveLength(MAX_SNAPSHOTS)
  })

  it('localStorage 取用即抛（沙箱 iframe / 隐私模式）时降级为空列表 + 写入失败', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError')
      },
    })

    try {
      expect(listSnapshots()).toEqual([])
      expect(writeSnapshots([snap('A')])).toBe(false)
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor)
    }
  })

  it('配额满（setItem 抛异常）时写入返回 false，调用方才能提示用户', () => {
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    expect(writeSnapshots([snap('A')])).toBe(false)
    spy.mockRestore()
  })
})

describe('addSnapshot / removeSnapshot', () => {
  it('新快照插到最前，超过上限时丢弃最旧的', () => {
    let items: Snapshot[] = []
    for (let i = 0; i < MAX_SNAPSHOTS + 3; i++) items = addSnapshot(items, snap(`S${i}`))

    expect(items).toHaveLength(MAX_SNAPSHOTS)
    expect(items[0].name).toBe(`S${MAX_SNAPSHOTS + 2}`)
    expect(items.some((item) => item.name === 'S0')).toBe(false)
  })

  it('删除不存在的 id 时原样返回同一引用（调用方据此跳过无谓写入）', () => {
    const items = [snap('A'), snap('B')]
    expect(removeSnapshot(items, '不存在')).toBe(items)

    const next = removeSnapshot(items, items[0].id)
    expect(next).not.toBe(items)
    expect(next.map((item) => item.name)).toEqual(['B'])
  })

  // 回归：「重命名」已按「快照创建后即只读」的需求移除。
  // 这里钉住的是它的结构性前提——改原对象动不了已存快照，以后谁再想加回改名，
  // 得先把这条推翻。
  it('快照不可变：创建后改动原 params 不影响已存快照', () => {
    const params = cloneParams(DEFAULT_PARAMS)
    writeSnapshots([createSnapshot(params, DEFAULT_MC_CONFIG, '快照')])

    params.initialPrincipal = 9_999_999
    params.pessimisticReturn = 0.1
    params.expenses[0].amount = 88_888

    const [stored] = listSnapshots()
    expect(stored.params.initialPrincipal).toBe(DEFAULT_PARAMS.initialPrincipal)
    expect(stored.params.pessimisticReturn).toBe(DEFAULT_PARAMS.pessimisticReturn)
    expect(stored.params.expenses[0].amount).toBe(DEFAULT_PARAMS.expenses[0].amount)
    expect(stored.name).toBe('快照')
  })
})

describe('stateFingerprint / findMatchingSnapshot', () => {
  it('当前参数与某条快照一致时命中它', () => {
    const params = cloneParams(DEFAULT_PARAMS)
    params.initialPrincipal = 1_000_000
    const items = [snap('别的'), createSnapshot(params, DEFAULT_MC_CONFIG, '目标')]

    expect(findMatchingSnapshot(items, params, DEFAULT_MC_CONFIG)?.name).toBe('目标')
  })

  it('参数或 MC 任一处不同就不算命中', () => {
    const params = cloneParams(DEFAULT_PARAMS)
    const items = [createSnapshot(params, DEFAULT_MC_CONFIG, '基准')]

    expect(findMatchingSnapshot(items, params, DEFAULT_MC_CONFIG)?.name).toBe('基准')
    expect(
      findMatchingSnapshot(items, { ...params, annualReturn: 0.09 }, DEFAULT_MC_CONFIG),
    ).toBeNull()
    // MC 参与指纹：只改压力测试设置也算「不再是这条快照」
    expect(
      findMatchingSnapshot(items, params, { ...DEFAULT_MC_CONFIG, iterations: 2000 }),
    ).toBeNull()
  })

  it('没有快照时返回 null', () => {
    expect(findMatchingSnapshot([], cloneParams(DEFAULT_PARAMS), DEFAULT_MC_CONFIG)).toBeNull()
  })

  // 列表是最近的在前，所以多条快照参数相同时返回最新的那条
  it('两条快照参数相同时命中最新的那条', () => {
    const items = [snap('新'), snap('旧')]
    expect(
      findMatchingSnapshot(items, cloneParams(DEFAULT_PARAMS), DEFAULT_MC_CONFIG)?.name,
    ).toBe('新')
  })

  // 指纹的两侧都要过规整函数：快照里存的是「合法但写法不同」的输入时，
  // 只要规整后与当前参数一致就该算命中。少了这一步就是形如
  // 「明明和快照一模一样，界面却不显示名字」的假阴性。
  it('写法不同但规整后等价的输入仍算命中', () => {
    const raw = JSON.parse(JSON.stringify(DEFAULT_PARAMS))
    delete raw.expenses[0].enabled // 缺 enabled → 规整成 true（与默认值相同）
    raw.expenses[0].interval = 0 // interval 越界 → 夹到 1（与默认值相同）
    localStorage.setItem(
      SNAPSHOT_KEY,
      JSON.stringify([
        { id: 'x', name: '等价写法', savedAt: new Date().toISOString(), params: raw, mc: DEFAULT_MC_CONFIG },
      ]),
    )

    const [stored] = listSnapshots()
    expect(
      findMatchingSnapshot([stored], cloneParams(DEFAULT_PARAMS), DEFAULT_MC_CONFIG)?.name,
    ).toBe('等价写法')
  })

  // 回归：项 id 每次页面加载都是新随机值（createItemId 在 DEFAULT_PARAMS 里就跑过一次），
  // 「重置默认」/换设备/刷新后同一套参数的 id 必然不同。id 一旦参与指纹，
  // 就会退化成「刷新一下就不认识自己的快照了」——真实浏览器上踩到过。
  it('收支项 id 不同、其余完全相同时仍算命中', () => {
    const params = cloneParams(DEFAULT_PARAMS)
    const items = [
      createSnapshot(
        { ...cloneParams(params), incomes: params.incomes.map((i) => ({ ...i, id: '另一套-id' })) },
        DEFAULT_MC_CONFIG,
        '同参数异 id',
      ),
    ]

    expect(findMatchingSnapshot(items, params, DEFAULT_MC_CONFIG)?.name).toBe('同参数异 id')
  })

  it('指纹对同一套参数稳定，对改过的参数不同', () => {
    const params = cloneParams(DEFAULT_PARAMS)
    const before = stateFingerprint(params, DEFAULT_MC_CONFIG)
    expect(stateFingerprint(cloneParams(params), { ...DEFAULT_MC_CONFIG })).toBe(before)

    params.expenses[0].amount += 1
    expect(stateFingerprint(params, DEFAULT_MC_CONFIG)).not.toBe(before)
  })
})

describe('uniqueSnapshotName', () => {
  it('重名时追加序号，避免列表里两条一模一样的名字', () => {
    const items = [snap('保守方案'), snap('保守方案 2')]
    expect(uniqueSnapshotName(items, '保守方案')).toBe('保守方案 3')
    expect(uniqueSnapshotName(items, '激进方案')).toBe('激进方案')
  })

  it('名字已到长度上限时仍不超出上限', () => {
    const long = 'x'.repeat(40)
    const name = uniqueSnapshotName([snap(long)], long)
    expect(name.length).toBeLessThanOrEqual(40)
    expect(name).not.toBe(long)
  })
})

describe('formatSavedAt / defaultSnapshotName', () => {
  it('非法时间戳原样返回，不在列表里显示 NaN', () => {
    expect(formatSavedAt('不是时间')).toBe('不是时间')
  })

  it('默认名按本地时间补零', () => {
    expect(defaultSnapshotName(new Date(2026, 8, 5, 9, 7))).toBe('09-05 09:07 方案')
    expect(formatSavedAt(new Date(2026, 8, 5, 9, 7).toISOString())).toBe('09-05 09:07')
  })
})
