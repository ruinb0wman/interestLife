# 躺平财务模拟器 · 不交社保版

模拟一位不交社保、不买房、不生子的人，依靠投资与零散工作收入，从「初始年龄」到「目标年龄」的 60 年现金流，帮助找出「躺平不破产」的条件。

## 功能

- 按年递推现金流：投资收益 → 工资 + 零工 → 生活费 + 老年医疗 → 换车净支出 → 一次性大额支出。
- 全部参数可调：初始/目标年龄、工资结束年龄、买车周期、月薪/生活费及涨幅、初始本金、收益率、车价及涨幅，并可逐项启用/停用。
- 三情景对照（乐观/中性/悲观收益率）+ 破产点预警。
- 蒙特卡洛压力测试：随机收益率与通胀逐年游走，输出存活成功率与最终资产分位。
- ECharts 双轴折线图、关键数据卡片、逐年明细表。

## 技术栈

- Vue 3（组合式 API）+ TypeScript + Vite
- ECharts 6
- element-plus（深色模式）

## 本地运行

```bash
bun install
bun run dev      # 开发（host: true，可在局域网访问）
bun run build    # 类型检查 + 打包
bun run preview  # 预览构建产物
bun run test     # 单元测试（vitest）
```

核心计算公式独立于 `src/lib.ts`（含 `simulate` / `simulateScenario` / `monteCarlo` / `analyze` / `verdict`），便于审查与复用；
回归测试见 `src/lib.test.ts`（公式与边界）与 `src/components.test.ts`（组件层）。

---

# 配色方案

本项目的主题为**固定深色**（`html.dark` 生效），配色参考自 [GoFundBot](https://github.com/ruinb0w/Workspace/GoFundBot) 前端（`Frontend/src/App.css` 的 `[data-theme=dark]` 与 `useEChartsTheme.ts` 的 `gofund-dark`）。

主题机制：element-plus 全部设计令牌以 CSS 变量（`--el-*`）暴露，在 `src/style.css` 的 `html.dark` 块中覆盖即可；`--el-color-primary` 的浅色梯度（light-3/5/7/8/9）与深色（dark-2）用 `color-mix()` 跟随主色自动生成，无需引入 SCSS 编译链。

## 一、语义变量

| 变量 | 浅色 `:root` | 深色 `html.dark` | 用途 |
|---|---|---|---|
| `--bg` | `#f5f7fa` | `#1b1b1f` | 页面背景 |
| `--panel` | `#ffffff` | `#202127` | 卡片背景 |
| `--border` | `#e5e7eb` | `#3c3f44` | 边框 |
| `--text` | `#1f2937` | `#dfdfd6` | 主文字 |
| `--text-2` | `#6b7280` | `#98989f` | 次级文字 |
| `--text-3` | `#9ca3af` | `#6a6a71` | 三级文字/提示 |
| `--primary` | `#1677ff` | `#a8b1ff` | 主色 |
| `--green` | `#52c41a` | `#3dd68c` | 正收益/成功 |
| `--red` | `#ff4d4f` | `#f66f81` | 负收益/危险 |
| `--warning` | `#faad14` | `#f9b44e` | 警告 |
| `--ok-bg` | `#f6ffed` | `rgba(61,214,140,.14)` | 开关开启背景 |
| `--ok-border` | `#b7eb8f` | `#3dd68c` | 开关开启边框 |
| `--toggle-bg` | `#f3f4f6` | `#2a2b31` | 开关默认背景 |
| `--radius-sm/md/lg` | `6/10/16px` | `6/10/16px` | 圆角 |
| `--shadow-md` | `0 4px 6px -1px rgba(0,0,0,.1)` | `0 4px 6px -1px rgba(0,0,0,.5)` | 卡片阴影 |

## 二、element-plus 令牌覆盖（深色）

```css
html.dark {
  /* 主色 */
  --el-color-primary: #a8b1ff;
  --el-color-primary-light-3: color-mix(in srgb, #a8b1ff 70%, #fff);
  --el-color-primary-light-5: color-mix(in srgb, #a8b1ff 50%, #fff);
  --el-color-primary-light-7: color-mix(in srgb, #a8b1ff 30%, #fff);
  --el-color-primary-light-8: color-mix(in srgb, #a8b1ff 20%, #fff);
  --el-color-primary-light-9: color-mix(in srgb, #a8b1ff 12%, #fff);
  --el-color-primary-dark-2: color-mix(in srgb, #a8b1ff 80%, #000);

  /* 语义色（success/warning/danger/error/info 同理，用 color-mix 生成 light-3..9 与 dark-2） */
  --el-color-success: #3dd68c;
  --el-color-warning: #f9b44e;
  --el-color-danger: #f66f81;
  --el-color-error: #f66f81;
  --el-color-info: #5c73e7;

  /* 背景 / 填充 */
  --el-bg-color: #202127;
  --el-bg-color-page: #1b1b1f;
  --el-bg-color-overlay: #202127;
  --el-fill-color: #2a2b31;
  --el-fill-color-light: #2e2e32;
  --el-fill-color-lighter: #202127;
  --el-fill-color-blank: #202127;

  /* 边框 */
  --el-border-color: #3c3f44;
  --el-border-color-light: #3c3f44;
  --el-border-color-lighter: #2e2e32;
  --el-border-color-extra-light: #2e2e32;

  /* 文字 */
  --el-text-color-primary: #dfdfd6;
  --el-text-color-regular: #98989f;
  --el-text-color-secondary: #98989f;
  --el-text-color-placeholder: #6a6a71;
  --el-text-color-disabled: #4a4a52;

  --el-border-radius-base: 6px;
}
```

## 三、ECharts 深色色板

| 用途 | 颜色 |
|---|---|
| 本金·乐观 | `#3dd68c` |
| 本金·中性 | `#a8b1ff` |
| 本金·悲观 | `#f9b44e` |
| 破产区间 | `#f66f81` |
| 年度工资 | `#38bdf8` |
| 年度生活费 | `#c8abfa` |
| 年度医疗 | `#fb923c` |
| 零工收入 | `#f0abfc` |
| 一次性支出 | `#6a6a71` |
| 坐标轴标签 / 图例 | `#98989f` |
| 坐标轴线 | `#3c3f44` |
| 网格分割线 | `#2e2e32` |
| tooltip 背景/边框/文字 | `rgba(32,33,39,.96)` / `#3c3f44` / `#dfdfd6` |

## 四、在其他项目复用

1. 引入 element-plus 深色基础样式：
   ```ts
   import 'element-plus/theme-chalk/dark/css-vars.css'
   ```
2. 根元素开启深色：`<html class="dark">`（本项目固定深色）。
3. 复制 `src/style.css` 中 `html.dark` 内的语义变量 + element-plus 令牌覆盖到目标项目（注意加载顺序需在 element-plus 样式之后）。
4. 图表如需同款色板，采用第三节的颜色。
