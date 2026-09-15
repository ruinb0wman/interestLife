# 躺平财务模拟器 · 不交社保版

模拟一位不交社保、不买房、不生子的人，依靠投资与零散工作收入，从「初始年龄」到「目标年龄」的 60 年现金流，帮助找出「躺平不破产」的条件。

## 功能

- 按年递推现金流：投资收益 → 工资 + 零工 → 生活费 + 老年医疗 → 换车净支出 → 一次性大额支出。
- 全部参数可调：初始/目标年龄、工资结束年龄、买车周期、月薪/生活费及涨幅、初始本金、收益率、车价及涨幅，并可逐项启用/停用。
- 三情景对照（乐观/中性/悲观收益率）+ 破产点预警；资不抵债即截断，不再推演负债雪球。
- 蒙特卡洛压力测试：随机收益率与通胀逐年游走，输出存活成功率、最终资产分位与破产中位年龄。
- ECharts 双轴折线图（含耗尽点标记）、关键数据卡片、逐年明细表。
- 参数自动保存到 localStorage 并写入地址栏，「复制方案链接」即可分享整套参数与压力测试设置。

## 技术栈

- Vue 3（组合式 API）+ TypeScript + Vite
- ECharts 6（**按需注册**：只引入用到的图表与组件，新增图表类型需在 `src/components/CashFlowChart.vue` 的 `echarts.use([...])` 里补注册）
- element-plus（**按需引入**：组件由 `unplugin-vue-components` 自动导入，样式在 `src/element-plus-styles.ts` 显式列出，新增 `el-*` 组件时要补一行对应的 `style/css`）
- vitest + @vue/test-utils + happy-dom（单元测试）

## 本地运行

```bash
bun install
bun run dev      # 开发（host: true，可在局域网访问）
bun run build    # 类型检查 + 打包
bun run preview  # 预览构建产物
bun run test     # 单元测试（vitest）
```

核心计算公式独立于 `src/lib.ts`（含 `simulate` / `simulateScenario` / `monteCarlo` / `analyze` / `verdict`），便于审查与复用；
参数持久化与分享链接在 `src/persist.ts`；回归测试见 `src/lib.test.ts`（公式与边界）、`src/persist.test.ts`（外部输入净化）与 `src/components.test.ts`（组件层）。

## 部署

构建产物是纯静态文件，`base` 默认 `/`；部署到子路径（GitHub Pages、反代子目录）时改 `vite.config.ts` 的 `base`，或直接设为 `'./'` 使用相对路径。

```bash
bun run build && bun run preview
```

---

# 计算口径

每年只推演一次（按年龄），顺序严格如下：

1. 年初本金产生投资收益：`年初本金 × 年化收益率`
2. 加入当年工资（`工资结束年龄` 及之前）与零工收入（停薪之后至其结束年龄）
3. 扣除当年生活费，达到 `医疗起始年龄` 后加扣老年医疗支出
4. 若当年为换车年，扣除换车净支出 = 新车价 − 旧车残值
5. 扣除当年一次性大额支出

```
年末本金 = 年初本金 + 投资收益 + 年工资 + 零工收入
           − 年生活费 − 年医疗支出 − 换车净支出 − 一次性支出
```

几个容易误读的口径：

- **破产判据**：`survives` 要求「全程任何一年年末本金都未为负」，而不是只看目标年龄的终值。主曲线、三情景与压力测试共用同一判据。
- **破产即截断**：某年年末本金首次为负就终止该情景的模拟，当年缺口保留在结果里。后续年份不再推演——现实中无法以自己组合的收益率无限透支，否则负本金会跟着「复利」滚成雪球，把破产金额严重夸大。因此 `Analysis.simulatedThroughAge` 可能小于 `targetAge`，`afterFirstCar` / `afterSalaryStop` 可能为 `null`。
- **递增的基准年**：生活费、工资、医疗、零工收入的「第 n 年」都从起始年算起，起始年系数为 1（不预先涨一年）。压力测试里的随机通胀也遵循同一口径，因此波动率为 0 时结果会收敛到确定性模型。
- **三档结论**：`verdict()` 把「中性 / 悲观」两组分析归纳为 `safe`（两者都不破产）/ `risky`（中性可以、悲观破产）/ `bankrupt`（中性就破产）。

---

# 模型假设与局限

这是一个**教学与直觉工具**，不是理财建议。下列简化会系统性影响结论方向，请按需自行加安全边际：

**口径**

1. **名义口径**：收益率与各项涨幅都是名义值，两者相抵才是实际购买力。注意不要一边填「实际收益率 5%」一边又填「生活费涨 3%」，那等于把通胀算了两遍。
2. **无税费、无费率**：投资收益、股息、卖出都不扣税，也没有基金/ETF 管理费。A 股个人资本利得免税只是特例，美股股息预扣 30% 且有利得税。
3. **「月生活费」必须是全口径**：模型不含房租/房贷、不含子女教育支出，所以不买房不生子的人要把房租、水电物业、通讯、保险等全部算进这一项。

**风险建模**

4. **无社保、也无医保**：医疗支出与一次性大额支出默认全额自费，既没有城乡居民医保的报销，也没有商业医疗/重疾险的保费与赔付。这是本模型最大的简化——会让「不交社保」的替代成本被低估，也会让尾部风险被低估。
5. **一次性支出是确定金额，不是概率事件**：压力测试只随机化收益率与通胀，**不含**大病、意外、失能等尾部事件。真实世界里这类事件往往正是压垮躺平的原因。
6. **医疗支出是平滑增长的单一曲线**：未体现「生命末期医疗支出骤升」（现实中临终前数年的医疗费用占一生相当大的比例）。
7. **只有换车、没有养车**：油/电费、保险、保养、停车、违章、年检全部未计入。这部分每年通常上千到数万元，长期影响可能大于换车本身。
8. **长寿风险**：模拟在目标年龄截止，活过目标年龄的部分（以及活过目标年龄后的医疗支出）不计入。

**收益与波动**

9. **确定性情景的收益率是常数**：主曲线与三情景每年都用同一个收益率，不存在「头几年大跌」的序列风险。
10. **压力测试是逐年独立同分布的正态抽样**：这低估了固定支出下的序列风险，且用算术均值做复利会高估长期结果（波动率拖累）。另需注意默认波动率较小，`成功率` 会偏乐观，建议把它调到接近真实组合的水平（股票为主的组合年化 σ 常在 10%~18%）。
11. **硬截断**：收益率被夹在 `[−30%, 60%]`、通胀被夹在 `[−5%, 20%]`，两端会有概率堆积，极端情形被削平。

**结构**

12. **车辆假设**：起始年龄已持有一辆车，「第一次换车」= 起始年龄 + 买车周期；残值固定按「当年车价 × 25%」抵扣，不区分具体车龄的折旧曲线。
13. **零工收入固定从「工资结束年龄 + 1」开始**，无法表达「边上班边接私活」或中间断档。
14. **各项涨幅互相独立**：通胀、工资涨幅、医疗涨幅、车价涨幅都是外生给定，不联动。

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
| 破产/耗尽点 | `#f66f81` |
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
