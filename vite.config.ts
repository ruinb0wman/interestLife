import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

// https://vite.dev/config/
export default defineConfig({
  // 部署到子路径（如 GitHub Pages / 反代子目录）时改成 '/<子路径>/'，
  // 或直接设 base: './' 以使用相对路径。
  base: '/',
  plugins: [
    vue(),
    // element-plus 组件按需自动导入。
    // importStyle: false —— 样式不在这里注入，改由 src/element-plus-styles.ts 显式引入：
    // 组件样式模块内部 import 的是 .css，若在测试里被 Node 外部化加载会直接抛
    // “Unknown file extension .css”，而把整个 element-plus inline 进 vite 管道又会拖慢测试。
    Components({
      resolvers: [ElementPlusResolver({ importStyle: false })],
      dts: 'src/components.d.ts',
    }),
  ],
  server: {
    host: true,
    port: 44012,
  },
})
