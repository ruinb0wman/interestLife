// 回归守卫：element-plus 组件由 unplugin-vue-components 自动导入，
// 但样式必须在 src/element-plus-styles.ts 里显式列出（见 vite.config.ts 的
// importStyle: false 与那个文件顶部的说明）。
//
// 只补组件、忘了补样式时**不会报错**：组件能渲染、单元测试也照样通过
// （测试环境刻意不加载 .css），但线上下拉框会变成没有面板样式的裸列表。
//
// 这里直接扫模板里的 <el-*> 标签反查样式清单，把这类遗漏变成失败。
// 注意：不能 import node:fs —— src/ 走的是浏览器 tsconfig（types: ["vite/client"]），
// 所以用 Vite 的 import.meta.glob 以字符串形式读取源码。
import { describe, expect, it } from 'vitest'

type RawModules = Record<string, string>

// 注意：import.meta.glob 的第二个参数必须是字面量对象（构建期静态解析）
const styleSources = import.meta.glob('./element-plus-styles.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as RawModules
const sourceFiles = import.meta.glob('./**/*.{ts,vue}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as RawModules

/** ElMessage → message */
function toStyleDir(componentName: string): string {
  return componentName
    .replace(/^El/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
}

/** 实际用到的 element-plus 组件（模板标签 + 显式 import 的服务式组件） */
function collectUsedStyleDirs(): Map<string, string> {
  const used = new Map<string, string>()

  for (const [path, text] of Object.entries(sourceFiles)) {
    if (/\.test\.ts$/.test(path)) continue

    for (const match of text.matchAll(/<(el-[a-z0-9-]+)[\s/>]/g)) {
      const dir = match[1].slice('el-'.length)
      if (!used.has(dir)) used.set(dir, `${path} <${match[1]}>`)
    }

    for (const match of text.matchAll(/import\s*\{([^}]+)\}\s*from\s*'element-plus'/g)) {
      for (const name of match[1].split(',')) {
        const trimmed = name.trim()
        if (!/^El[A-Z]\w*$/.test(trimmed)) continue
        const dir = toStyleDir(trimmed)
        if (!used.has(dir)) used.set(dir, `${path} import { ${trimmed} }`)
      }
    }
  }

  return used
}

describe('element-plus 样式清单完整性', () => {
  const styleFile = Object.values(styleSources)[0] ?? ''
  const imported = new Set(
    [...styleFile.matchAll(/import 'element-plus\/es\/components\/([\w-]+)\/style\/css'/g)].map(
      (m) => m[1],
    ),
  )
  const used = collectUsedStyleDirs()

  it('确实扫到了实际用到的组件（守卫自身不能失效）', () => {
    expect(used.size).toBeGreaterThan(5)
    expect(used.has('select')).toBe(true)
    expect(used.has('dropdown-item')).toBe(true)
    expect(used.has('message')).toBe(true)
  })

  it('每个用到的 el-* 组件都有对应的样式导入', () => {
    const missing = [...used.entries()]
      .filter(([dir]) => !imported.has(dir))
      .map(([dir, where]) => `${dir}（${where}）`)

    expect(missing).toEqual([])
  })

  it('样式清单里没有多余的条目（已无组件使用）', () => {
    const unused = [...imported].filter((dir) => !used.has(dir))
    expect(unused).toEqual([])
  })
})
